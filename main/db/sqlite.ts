import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Entry, Conflict } from "../../renderer/lib/types";
import { updateLocalMasterIndex } from '../cloudsync/master_index';

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
    db.prepare('INSERT INTO entries_t (id, date, content, location, timestamp, lastModified) VALUES (?, ?, ?, ?, ?, ?)').run(entry.id, entry.date, entry.content, entry.location, entry.timestamp, entry.lastModified);
    if (!skipSync) {
        updateLocalMasterIndex(entry.id, { lastModified: Date.now(), deleted: false });
    }
}

function updateEntry(id: string, entry: Entry, skipSync = false): void {
    db.prepare('UPDATE entries_t SET date = ?, content = ?, location = ?, timestamp = ?, lastModified = ? WHERE id = ?').run(entry.date, entry.content, entry.location, entry.timestamp, entry.lastModified, id);

    // Update conflict if one exists for this entry
    const conflict = getConflictByEntryId(id);
    if (conflict) {
        db.prepare('UPDATE conflicts_t SET localVersion = ?, localModified = ? WHERE entryId = ?')
            .run(entry.content, entry.lastModified, id);
    }

    if (!skipSync) {
        updateLocalMasterIndex(id, { lastModified: Date.now(), deleted: false });
    }
}

function deleteEntry(id: string, skipSync = false): void {
    db.prepare('DELETE FROM entries_t WHERE id = ?').run(id);
    if (!skipSync) {
        updateLocalMasterIndex(id, { lastModified: Date.now(), deleted: true });
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
    deleteConflict
};
