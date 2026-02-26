import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';
import { EventEmitter } from 'node:events';
import { Entry, Conflict } from "../../renderer/lib/types";

export const dbEvents = new EventEmitter();

const dbPath = app.isPackaged
  ? path.join(app.getPath('userData'), 'journal.db')
  : path.join(__dirname, '../../../../journal.db');

const db = new Database(dbPath);

console.log("dbPath: ", dbPath);

// .entries_t
// | Column       | Type       | Constraints |
// |--------------|------------|-------------|
// | id           | TEXT       | PRIMARY KEY |
// | date         | TEXT       | NOT NULL    |
// | content      | TEXT       | NOT NULL    |
// | location     | TEXT       |             |
// | timestamp    | INTEGER    | NOT NULL    |
// | lastModified | INTEGER    |             |
// 
// .settings_t
// | Column | Type | Constraints |
// |--------|------|-------------|
// | key    | TEXT | PRIMARY KEY |
// | value  | TEXT | NOT NULL    |

// Initialize database tables
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

function getEntries(limit?: number): Entry[] {
    let query = 'SELECT * FROM entries_t order by timestamp DESC';
    if (limit && limit > 0) {
        query += ` LIMIT ${limit}`;
    }
    const rows = db.prepare(query).all() as Entry[];
    return rows;
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

function createEntry(entry: Entry, skipSync = false): void {
    // validate entry before database insertion
    try {
        validateEntry(entry);
    } catch (error) {
        console.error(`createEntry: validation failed for entry ${entry.id}:`, error);
        throw error;
    }

    // auto-generate timestamp and lastModified if missing
    if (!entry.timestamp) {
        entry.timestamp = Date.now();
    }
    if (!entry.lastModified) {
        entry.lastModified = Date.now();
    }

    const transaction = db.transaction(() => {
        db.prepare('INSERT INTO entries_t (id, date, content, location, timestamp, lastModified) VALUES (?, ?, ?, ?, ?, ?)').run(entry.id, entry.date, entry.content, entry.location, entry.timestamp, entry.lastModified);
    });

    try {
        transaction();
        // only update master index if db transaction succeeded
        if (!skipSync) {
            dbEvents.emit('entry:created', { id: entry.id, lastModified: Date.now() });
        }
    } catch (error) {
        console.error(`createEntry: error creating entry ${entry.id}:`, error);
        throw error;
    }
}

function updateEntry(id: string, entry: Entry, skipSync = false): void {
    // validate entry before database update
    try {
        // ensure entry.id matches the id parameter
        if (!entry.id) {
            entry.id = id;
        } else if (entry.id !== id) {
            throw new Error(`Entry id mismatch: parameter id="${id}" but entry.id="${entry.id}"`);
        }
        validateEntry(entry);
    } catch (error) {
        console.error(`updateEntry: validation failed for entry ${id}:`, error);
        throw error;
    }

    // auto-generate lastModified if missing (timestamp should already exist for updates)
    if (!entry.lastModified) {
        entry.lastModified = Date.now();
    }

    const transaction = db.transaction(() => {
        db.prepare('UPDATE entries_t SET date = ?, content = ?, location = ?, timestamp = ?, lastModified = ? WHERE id = ?').run(entry.date, entry.content, entry.location, entry.timestamp, entry.lastModified, id);

        // Update conflict if one exists for this entry
        const conflict = getConflictByEntryId(id);
        if (conflict) {
            db.prepare('UPDATE conflicts_t SET localVersion = ?, localModified = ? WHERE entryId = ?')
                .run(entry.content, entry.lastModified, id);
        }
    });

    try {
        transaction();
        // only update master index if db transaction succeeded
        if (!skipSync) {
            dbEvents.emit('entry:updated', { id, lastModified: Date.now() });
        }
    } catch (error) {
        console.error(`updateEntry: error updating entry ${id}:`, error);
        throw error;
    }
}

function deleteEntry(id: string, skipSync = false): void {
    const transaction = db.transaction(() => {
        db.prepare('DELETE FROM entries_t WHERE id = ?').run(id);
    });

    try {
        transaction();
        // only update master index if db transaction succeeded
        if (!skipSync) {
            dbEvents.emit('entry:deleted', { id, lastModified: Date.now() });
        }
    } catch (error) {
        console.error(`deleteEntry: error deleting entry ${id}:`, error);
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

// Conflict functions
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

/**
 * Validates an entry object before database insertion.
 *
 * @param {Entry} entry - The entry to validate.
 * @throws {Error} If validation fails.
 */
function validateEntry(entry: Entry): void {
    // validate id
    if (!entry.id || typeof entry.id !== 'string' || entry.id.trim() === '') {
        throw new Error('Invalid entry: id is required and must be a non-empty string');
    }

    // validate date
    if (!entry.date || typeof entry.date !== 'string' || entry.date.trim() === '') {
        throw new Error('Invalid entry: date is required and must be a non-empty string');
    }

    // validate date format matches expected pattern (e.g., "Jun 14, 2025 at 12:35")
    if (!entry.date.match(/^\w{3} \d{1,2}, \d{4} at \d{2}:\d{2}(:\d{2})?$/)) {
        throw new Error(`Invalid entry: date format incorrect. Expected format: "Jun 14, 2025 at 12:35". Got: "${entry.date}"`);
    }

    // validate content
    if (!entry.content || typeof entry.content !== 'string' || entry.content.trim() === '') {
        throw new Error('Invalid entry: content is required and must be a non-empty string');
    }

    // validate location if provided (todo: delete?)
    if (entry.location !== undefined && entry.location !== null && typeof entry.location !== 'string') {
        throw new Error('Invalid entry: location must be a string if provided');
    }

    // validate timestamp if provided
    if (entry.timestamp !== undefined) {
        if (typeof entry.timestamp !== 'number' || isNaN(entry.timestamp) || entry.timestamp < 0) {
            throw new Error('Invalid entry: timestamp must be a positive number');
        }
    }

    // validate lastModified if provided
    if (entry.lastModified !== undefined) {
        if (typeof entry.lastModified !== 'number' || isNaN(entry.lastModified) || entry.lastModified < 0) {
            throw new Error('Invalid entry: lastModified must be a positive number');
        }
    }
}

function getSetting(key: string): string | null {
    const row = db.prepare('SELECT value FROM settings_t WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
    db.prepare('INSERT OR REPLACE INTO settings_t (key, value) VALUES (?, ?)').run(key, value);
}

export {
    getEntries,
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
    setSetting
};
