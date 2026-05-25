import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';

// inside Electron: use app.getPath; outside (test scripts): fall back to known dev path
const dbPath = process.versions.electron
  ? (() => {
      const { app } = require('electron');
      return app.isPackaged
        ? path.join(app.getPath('userData'), 'journal.db')
        : path.join(app.getPath('userData'), 'journal-dev.db');
    })()
  : path.join(os.homedir(), 'Library', 'Application Support', 'electron', 'journal-dev.db');

const db = new Database(dbPath, { readonly: true });

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanEntry(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, content: stripHtml(String(row.content ?? '')) };
}

// ── Tool definitions (passed to the model) ───────────────────────────────────

export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'search_journal',
      description: `Search journal entries using FTS5 full-text search. Returns up to 25 entries per call plus a total match count.
If total > 25, make additional calls with narrower date_range values (e.g. one call per year) to cover remaining entries.
Use short, specific queries — a name, a place, a single keyword. Do not add descriptive words like "fun" or "experience".`,
      parameters: {
        type: 'object',
        properties: {
          query:      { type: 'string', description: 'FTS5 search query' },
          date_range: { type: 'string', description: 'e.g. "2023" for a full year, or "2022-01:2022-06" for a range. Use to paginate when total > 25.' },
          sort:       { type: 'string', enum: ['asc', 'desc'] },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_entry_by_date',
      description: 'Retrieve a single journal entry by exact date. Use when the user specifies a specific day.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_entries_by_range',
      description: 'Retrieve all journal entries within a date range. Use for month or period analysis.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'YYYY-MM-DD' },
          end:   { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['start', 'end'],
      },
    },
  },
];

// ── Tool implementations ──────────────────────────────────────────────────────

// dates are stored as journal format ("Jun 14, 2025 at 12:35") — use timestamp (ms) for all range filtering
function toTimestampRange(isoDate: string): { start: number; end: number } {
  const start = new Date(isoDate).setHours(0, 0, 0, 0);
  const end   = new Date(isoDate).setHours(23, 59, 59, 999);
  return { start, end };
}

const SEARCH_PAGE_SIZE = 25;

function searchJournal(args: { query: string; date_range?: string; sort?: string }) {
  const { query, date_range, sort = 'desc' } = args;

  let dateFilter = '';
  const params: unknown[] = [query];

  if (date_range && date_range !== 'all') {
    const [startStr, endStr] = date_range.includes(':') ? date_range.split(':') : [date_range, date_range];
    // Plain year "2018" → full calendar year; otherwise parse as-is
    const start = /^\d{4}$/.test(startStr)
      ? new Date(parseInt(startStr), 0, 1).setHours(0, 0, 0, 0)
      : new Date(startStr).setHours(0, 0, 0, 0);
    const end = /^\d{4}$/.test(endStr)
      ? new Date(parseInt(endStr), 11, 31).setHours(23, 59, 59, 999)
      : new Date(endStr).setHours(23, 59, 59, 999);
    if (!isNaN(start) && !isNaN(end)) {
      dateFilter = 'AND e.timestamp BETWEEN ? AND ?';
      params.push(start, end);
    }
  }

  try {
    const total = (db.prepare(`
      SELECT COUNT(*) as n FROM entries_fts f
      JOIN entries_t e ON e.id = f.id
      WHERE entries_fts MATCH ? ${dateFilter}
    `).get(...params) as { n: number }).n;

    const rows = db.prepare(`
      SELECT e.id, e.date, e.content
      FROM entries_fts f
      JOIN entries_t e ON e.id = f.id
      WHERE entries_fts MATCH ?
      ${dateFilter}
      ORDER BY e.timestamp ${sort === 'asc' ? 'ASC' : 'DESC'}
      LIMIT ${SEARCH_PAGE_SIZE}
    `).all(...params) as Record<string, unknown>[];

    return { entries: rows.map(cleanEntry), showing: rows.length, total };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

function getEntryByDate(args: { date: string }) {
  try {
    const { start, end } = toTimestampRange(args.date);
    const row = db.prepare(`SELECT id, date, content FROM entries_t WHERE timestamp BETWEEN ? AND ? LIMIT 1`)
      .get(start, end) as Record<string, unknown> | undefined;
    return row ? cleanEntry(row) : null;
  } catch (err) {
    return { error: (err as Error).message };
  }
}

function getEntriesByRange(args: { start: string; end: string }) {
  try {
    const start = new Date(args.start).setHours(0, 0, 0, 0);
    const end   = new Date(args.end).setHours(23, 59, 59, 999);
    const rows = db.prepare(`
      SELECT id, date, content FROM entries_t
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `).all(start, end) as Record<string, unknown>[];
    return rows.map(cleanEntry);
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Journal span ─────────────────────────────────────────────────────────────

export function getJournalSpan(): { startYear: number; endYear: number; total: number } | null {
  try {
    const row = db.prepare(
      'SELECT MIN(timestamp) as minTs, MAX(timestamp) as maxTs, COUNT(*) as total FROM entries_t'
    ).get() as { minTs: number; maxTs: number; total: number } | undefined;
    if (!row || !row.minTs) return null;
    return {
      startYear: new Date(row.minTs).getFullYear(),
      endYear:   new Date(row.maxTs).getFullYear(),
      total:     row.total,
    };
  } catch {
    return null;
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export function executeTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case 'search_journal':      return searchJournal(args as Parameters<typeof searchJournal>[0]);
    case 'get_entry_by_date':   return getEntryByDate(args as Parameters<typeof getEntryByDate>[0]);
    case 'get_entries_by_range': return getEntriesByRange(args as Parameters<typeof getEntriesByRange>[0]);
    default: return { error: `Unknown tool: ${name}` };
  }
}
