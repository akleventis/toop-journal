import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';
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

  CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
    id UNINDEXED,
    content,
    timestamp UNINDEXED
  );
`);

// one-time migration: populate FTS index from entries_t if the table is empty
{
  const ftsCount = (db.prepare('SELECT COUNT(*) as c FROM entries_fts').get() as { c: number }).c;
  if (ftsCount === 0) {
    const rows = db.prepare('SELECT id, content, timestamp FROM entries_t').all() as { id: string; content: string; timestamp: number }[];
    if (rows.length > 0) {
      const insert = db.prepare('INSERT INTO entries_fts(id, content, timestamp) VALUES (?, ?, ?)');
      db.transaction(() => { for (const r of rows) insert.run(r.id, r.content, r.timestamp); })();
      logger.info(`FTS: indexed ${rows.length} existing entries`);
    }
  }
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
        db.prepare('INSERT INTO entries_fts(id, content, timestamp) VALUES (?, ?, ?)').run(entry.id, entry.content, entry.timestamp);
    });

    try {
        transaction();
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

        db.prepare('DELETE FROM entries_fts WHERE id = ?').run(id);
        db.prepare('INSERT INTO entries_fts(id, content, timestamp) VALUES (?, ?, ?)').run(id, entry.content, entry.timestamp);
    });

    try {
        transaction();
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
        db.prepare('DELETE FROM entries_fts WHERE id = ?').run(id);
    });

    try {
        transaction();
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

function searchEntries(query: string, limit?: number): Entry[] {
  const stmt = limit != null
    ? db.prepare('SELECT id FROM entries_fts WHERE entries_fts MATCH ? ORDER BY timestamp DESC LIMIT ?')
    : db.prepare('SELECT id FROM entries_fts WHERE entries_fts MATCH ? ORDER BY timestamp DESC');
  const rows = (limit != null ? stmt.all(query, limit) : stmt.all(query)) as { id: string }[];
  return rows
    .map(r => db.prepare('SELECT * FROM entries_t WHERE id = ?').get(r.id) as Entry | null)
    .filter((e): e is Entry => e !== null);
}

function getSetting(key: string): string | null {
    const row = db.prepare('SELECT value FROM settings_t WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
    db.prepare('INSERT OR REPLACE INTO settings_t (key, value) VALUES (?, ?)').run(key, value);
}

const SEVEN_DAYS_MS  = 7  * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isMaintenanceDue(): boolean {
  const lastOptimize = getSetting('lastOptimizeTime');
  const lastVacuum   = getSetting('lastVacuumTime');
  const now = Date.now();
  return (!lastOptimize || now - parseInt(lastOptimize, 10) >= SEVEN_DAYS_MS)
      || (!lastVacuum   || now - parseInt(lastVacuum,   10) >= THIRTY_DAYS_MS);
}

function runMaintenance(): void {
  const now = Date.now();
  const lastOptimize = getSetting('lastOptimizeTime');
  if (!lastOptimize || now - parseInt(lastOptimize, 10) >= SEVEN_DAYS_MS) {
    logger.info('maintenance: FTS5 optimize');
    db.prepare("INSERT INTO entries_fts(entries_fts) VALUES('optimize')").run();
    setSetting('lastOptimizeTime', String(now));
  }
  const lastVacuum = getSetting('lastVacuumTime');
  if (!lastVacuum || now - parseInt(lastVacuum, 10) >= THIRTY_DAYS_MS) {
    logger.info('maintenance: VACUUM');
    db.exec('VACUUM');
    setSetting('lastVacuumTime', String(now));
  }
}

function closeDb(): void {
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
    isMaintenanceDue,
    runMaintenance,
};
