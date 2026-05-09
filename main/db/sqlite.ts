import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Worker } from 'worker_threads';
import { EventEmitter } from 'node:events';
import { Entry, Conflict } from "../../shared/types";
import { logger } from '../logger';

// fires on entry create/update/delete — consumed by sync_coordinator to update local master index
export const dbEvents = new EventEmitter();

// use userData for both prod and dev to avoid committing journal.db to git
const dbPath = app.isPackaged
  ? path.join(app.getPath('userData'), 'journal.db')
  : path.join(app.getPath('userData'), 'journal-dev.db');

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS entries_t (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    location TEXT,
    timestamp INTEGER NOT NULL,
    lastModified INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_timestamp ON entries_t(timestamp DESC);

  CREATE TABLE IF NOT EXISTS settings_t (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conflicts_t (
    entryId TEXT PRIMARY KEY,
    entryDate TEXT NOT NULL,
    localVersion TEXT NOT NULL,
    remoteVersion TEXT NOT NULL,
    localModified INTEGER NOT NULL,
    remoteModified INTEGER NOT NULL
  );
`);

// fts worker — runs in a separate thread so search never blocks the main loop
let ftsWorker: Worker | null = null;
let ftsWorkerReady = false;
// at most one search is in flight at a time; a new search cancels the previous
let pendingSearch: { resolve: (ids: string[]) => void; reject: (err: unknown) => void } | null = null;

// Spawns the FTS worker thread to build an in-memory FTS5 index in the background.
// Search works via message passing once the worker posts { type: 'ready' }.
export function buildInMemoryFts(onReady?: () => void): void {
  // terminate any existing worker before spawning a new one to avoid leaking the DB read handle
  if (ftsWorker) {
    ftsWorker.terminate();
    ftsWorker = null;
    ftsWorkerReady = false;
  }

  const workerPath = path.join(__dirname, 'fts-worker.js');

  ftsWorker = new Worker(workerPath, {
    workerData: { dbPath },
  });

  ftsWorker.on('message', (msg: { type: string; count?: number; ids?: string[]; message?: string }) => {
    if (msg.type === 'ready') {
      ftsWorkerReady = true;
      onReady?.();
      logger.info(`buildInMemoryFts: worker indexed ${msg.count} entries`);
    } else if (msg.type === 'result') {
      if (pendingSearch) {
        pendingSearch.resolve(msg.ids ?? []);
        pendingSearch = null;
      }
    } else if (msg.type === 'warn' && msg.message) {
      logger.warn(msg.message);
    }
  });

  ftsWorker.on('error', (err) => {
    logger.error('FTS worker error:', err);
    pendingSearch?.reject(err);
    pendingSearch = null;
    ftsWorkerReady = false;
    ftsWorker = null;
  });

  ftsWorker.on('exit', (code) => {
    if (code !== 0) logger.warn(`FTS worker exited with code ${code}`);
    // resolve any pending search so the Promise doesn't hang forever
    pendingSearch?.resolve([]);
    pendingSearch = null;
    ftsWorkerReady = false;
    ftsWorker = null;
  });
}

function getEntries(limit?: number): Entry[] {
    const safeLimit = Number.isInteger(limit) && (limit as number) > 0 ? limit : undefined;
    let query = 'SELECT * FROM entries_t order by timestamp DESC';
    if (safeLimit) query += ` LIMIT ${safeLimit}`;
    return db.prepare(query).all() as Entry[];
}

// for list view — truncated content avoids serializing full entry bodies over IPC
function getEntriesForList(limit?: number): Entry[] {
    const safeLimit = Number.isInteger(limit) && (limit as number) > 0 ? limit : undefined;
    let query = "SELECT id, date, location, timestamp, lastModified, substr(content, 1, 500) as content FROM entries_t ORDER BY timestamp DESC";
    if (safeLimit) query += ` LIMIT ${safeLimit}`;
    return db.prepare(query).all() as Entry[];
}

// prev = next older entry, next = next newer — ignores entryLimit so arrow nav always works
function getAdjacentEntry(id: string, direction: 'prev' | 'next'): Entry | null {
    const current = db.prepare('SELECT timestamp FROM entries_t WHERE id = ?').get(id) as { timestamp: number } | undefined;
    if (!current) return null;
    if (direction === 'prev') {
        return db.prepare('SELECT * FROM entries_t WHERE timestamp < ? ORDER BY timestamp DESC LIMIT 1').get(current.timestamp) as Entry | null;
    }
    return db.prepare('SELECT * FROM entries_t WHERE timestamp > ? ORDER BY timestamp ASC LIMIT 1').get(current.timestamp) as Entry | null;
}

function getEntryById(id: string): Entry | null {
    return db.prepare('SELECT * FROM entries_t WHERE id = ?').get(id) as Entry | null;
}

function getMostRecentEntry(): Entry | null {
    return db.prepare('SELECT * FROM entries_t ORDER BY timestamp DESC LIMIT 1').get() as Entry | null;
}

function getEntriesBetweenTimestamps(startTs: number, endTs: number): Entry[] {
    return db.prepare('SELECT * FROM entries_t WHERE timestamp BETWEEN ? AND ? order by timestamp desc').all(startTs, endTs) as Entry[];
}

// pass emitEvents=false for sync-sourced writes to avoid triggering the sync coordinator
function createEntry(entry: Entry, emitEvents = true): void {
    try {
        validateEntry(entry);
    } catch (error) {
        logger.error(`createEntry: validation failed for entry ${entry.id}:`, error);
        throw error;
    }

    if (!entry.timestamp) entry.timestamp = Date.now();
    if (!entry.lastModified) entry.lastModified = Date.now();

    const transaction = db.transaction(() => {
        db.prepare('INSERT INTO entries_t (id, date, content, location, timestamp, lastModified) VALUES (?, ?, ?, ?, ?, ?)').run(entry.id, entry.date, entry.content, entry.location, entry.timestamp, entry.lastModified);
    });

    try {
        transaction();
        if (ftsWorker) {
            ftsWorker.postMessage({ type: 'upsert', id: entry.id, content: entry.content, timestamp: entry.timestamp });
        }
        if (emitEvents) {
            logger.info(`entry created: ${entry.id}`);
            dbEvents.emit('entry:created', { id: entry.id, lastModified: Date.now() });
        }
    } catch (error) {
        logger.error(`createEntry: error creating entry ${entry.id}:`, error);
        throw error;
    }
}

function updateEntry(id: string, entry: Entry, emitEvents = true): void {
    try {
        if (!entry.id) {
            entry.id = id;
        } else if (entry.id !== id) {
            throw new Error(`Entry id mismatch: parameter id="${id}" but entry.id="${entry.id}"`);
        }
        validateEntry(entry);
    } catch (error) {
        logger.error(`updateEntry: validation failed for entry ${id}:`, error);
        throw error;
    }

    if (!entry.lastModified) entry.lastModified = Date.now();

    const transaction = db.transaction(() => {
        db.prepare('UPDATE entries_t SET date = ?, content = ?, location = ?, timestamp = ?, lastModified = ? WHERE id = ?').run(entry.date, entry.content, entry.location, entry.timestamp, entry.lastModified, id);

        const conflict = getConflictByEntryId(id);
        if (conflict) {
            db.prepare('UPDATE conflicts_t SET localVersion = ?, localModified = ? WHERE entryId = ?')
                .run(entry.content, entry.lastModified, id);
        }
    });

    try {
        transaction();
        if (ftsWorker) {
            ftsWorker.postMessage({ type: 'upsert', id, content: entry.content, timestamp: entry.timestamp });
        }
        if (emitEvents) {
            logger.info(`entry updated: ${id}`);
            dbEvents.emit('entry:updated', { id, lastModified: Date.now() });
        }
    } catch (error) {
        logger.error(`updateEntry: error updating entry ${id}:`, error);
        throw error;
    }
}

function deleteEntry(id: string, emitEvents = true): void {
    const transaction = db.transaction(() => {
        db.prepare('DELETE FROM entries_t WHERE id = ?').run(id);
    });

    try {
        transaction();
        if (ftsWorker) {
            ftsWorker.postMessage({ type: 'delete', id });
        }
        if (emitEvents) {
            logger.info(`entry deleted: ${id}`);
            dbEvents.emit('entry:deleted', { id, lastModified: Date.now() });
        }
    } catch (error) {
        logger.error(`deleteEntry: error deleting entry ${id}:`, error);
        throw error;
    }
}

function getPasswordHash(): string | null {
    const result = db.prepare('SELECT value FROM settings_t WHERE key = ?').get('passwordHash');
    return result ? (result as { value: string }).value : null;
}

function getPasswordSalt(): string | null {
    const result = db.prepare('SELECT value FROM settings_t WHERE key = ?').get('passwordSalt');
    return result ? (result as { value: string }).value : null;
}

function setPasswordHash(passwordHash: string): void {
    db.prepare('INSERT OR REPLACE INTO settings_t (key, value) VALUES (?, ?)').run('passwordHash', passwordHash);
}

function setPasswordSalt(passwordSalt: string): void {
    db.prepare('INSERT OR REPLACE INTO settings_t (key, value) VALUES (?, ?)').run('passwordSalt', passwordSalt);
}

function clearPasswordCredentials(): void {
    db.prepare('DELETE FROM settings_t WHERE key IN (?, ?)').run('passwordHash', 'passwordSalt');
}

function createConflict(conflict: Conflict): void {
    db.prepare(`
        INSERT OR REPLACE INTO conflicts_t
        (entryId, entryDate, localVersion, remoteVersion, localModified, remoteModified)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        conflict.entryId,
        conflict.entryDate,
        conflict.localVersion,
        conflict.remoteVersion,
        conflict.localModified,
        conflict.remoteModified
    );
}

function getConflicts(): Conflict[] {
    return db.prepare('SELECT * FROM conflicts_t ORDER BY entryDate DESC').all() as Conflict[];
}

function getConflictCount(): number {
    const result = db.prepare('SELECT COUNT(*) as count FROM conflicts_t').get() as { count: number };
    return result.count;
}

function getConflictByEntryId(entryId: string): Conflict | null {
    return db.prepare('SELECT * FROM conflicts_t WHERE entryId = ?').get(entryId) as Conflict | null;
}

function deleteConflict(entryId: string): void {
    db.prepare('DELETE FROM conflicts_t WHERE entryId = ?').run(entryId);
}

// Throws if the entry is missing required fields or has an invalid date format.
function validateEntry(entry: Entry): void {
    if (!entry.id || typeof entry.id !== 'string' || entry.id.trim() === '') {
        throw new Error('Invalid entry: id is required and must be a non-empty string');
    }

    if (!entry.date || typeof entry.date !== 'string' || entry.date.trim() === '') {
        throw new Error('Invalid entry: date is required and must be a non-empty string');
    }

    // format: "Jun 14, 2025 at 12:35"
    if (!entry.date.match(/^\w{3} \d{1,2}, \d{4} at \d{2}:\d{2}(:\d{2})?$/)) {
        throw new Error(`Invalid entry: date format incorrect. Expected format: "Jun 14, 2025 at 12:35". Got: "${entry.date}"`);
    }

    if (!entry.content || typeof entry.content !== 'string' || entry.content.trim() === '') {
        throw new Error('Invalid entry: content is required and must be a non-empty string');
    }

    if (entry.location !== undefined && entry.location !== null && typeof entry.location !== 'string') {
        throw new Error('Invalid entry: location must be a string if provided');
    }

    if (entry.timestamp !== undefined) {
        if (typeof entry.timestamp !== 'number' || isNaN(entry.timestamp) || entry.timestamp < 0) {
            throw new Error('Invalid entry: timestamp must be a positive number');
        }
    }

    if (entry.lastModified !== undefined) {
        if (typeof entry.lastModified !== 'number' || isNaN(entry.lastModified) || entry.lastModified < 0) {
            throw new Error('Invalid entry: lastModified must be a positive number');
        }
    }
}

function getEntryCount(): number {
  return (db.prepare('SELECT COUNT(*) as count FROM entries_t').get() as { count: number }).count;
}

function hasEntriesModifiedSince(timestamp: number): boolean {
  return db.prepare('SELECT 1 FROM entries_t WHERE lastModified > ? LIMIT 1').get(timestamp) !== undefined;
}

function isFtsReady(): boolean {
  return ftsWorkerReady;
}

async function searchEntries(query: string, limit?: number): Promise<Entry[]> {
  if (!ftsWorker || !ftsWorkerReady) return [];

  const ids = await new Promise<string[]>((resolve, reject) => {
    // cancel any in-flight search — only the latest result is relevant
    if (pendingSearch) pendingSearch.resolve([]);
    pendingSearch = { resolve, reject };
    // SQLite LIMIT -1 means no limit
    ftsWorker!.postMessage({ type: 'search', query, limit: limit ?? -1 });
  });
  return ids
    .map(id => db.prepare('SELECT * FROM entries_t WHERE id = ?').get(id) as Entry | null)
    .filter((e): e is Entry => e !== null);
}

function getSetting(key: string): string | null {
    const row = db.prepare('SELECT value FROM settings_t WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
    db.prepare('INSERT OR REPLACE INTO settings_t (key, value) VALUES (?, ?)').run(key, value);
}

function closeDb(): void {
    ftsWorker?.terminate();
    ftsWorker = null;
    db.close();
}

function integrityCheck(): boolean {
    const result = db.pragma('integrity_check') as { integrity_check: string }[];
    return result[0]?.integrity_check === 'ok';
}

export {
    getEntries,
    getEntriesForList,
    getAdjacentEntry,
    getEntryCount,
    hasEntriesModifiedSince,
    isFtsReady,
    searchEntries,
    getEntryById,
    getMostRecentEntry,
    getEntriesBetweenTimestamps,
    createEntry,
    updateEntry,
    deleteEntry,
    getPasswordHash,
    setPasswordHash,
    getPasswordSalt,
    setPasswordSalt,
    clearPasswordCredentials,
    createConflict,
    getConflicts,
    getConflictCount,
    getConflictByEntryId,
    deleteConflict,
    getSetting,
    setSetting,
    closeDb,
    integrityCheck,
};
