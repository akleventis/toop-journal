import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Entry } from "../../renderer/lib/types";
import { updateMasterIndex } from '../cloudsync/master_index';

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
`);

// function getEntries(): Entry[] {
//     const rows = db.prepare('SELECT * FROM entries_t order by timestamp desc').all() as Entry[];
//     return rows;
// }

function getEntries(limit: number = 10): Entry[] {
    const rows = db.prepare('SELECT * FROM entries_t order by timestamp desc limit ?').all(limit) as Entry[];
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

function createEntry(entry: Entry): void {
    db.prepare('INSERT INTO entries_t (id, date, content, location, timestamp, lastModified) VALUES (?, ?, ?, ?, ?, ?)').run(entry.id, entry.date, entry.content, entry.location, entry.timestamp, entry.lastModified);
    updateMasterIndex(entry.id, { lastModified: Date.now(), deleted: false });
}

function updateEntry(id: string, entry: Entry): void {
    db.prepare('UPDATE entries_t SET date = ?, content = ?, location = ?, timestamp = ?, lastModified = ? WHERE id = ?').run(entry.date, entry.content, entry.location, entry.timestamp, entry.lastModified, id);
    updateMasterIndex(id, { lastModified: Date.now(), deleted: false });
}

function deleteEntry(id: string): void {
    db.prepare('DELETE FROM entries_t WHERE id = ?').run(id);
    updateMasterIndex(id, { lastModified: Date.now(), deleted: true });
}

function getPasswordHash(): string | null {
    const result = db.prepare('SELECT value FROM settings_t WHERE key = ?').get('passwordHash');
    return result ? (result as { value: string }).value : null;
}

function setPasswordHash(passwordHash: string): void {
    db.prepare('INSERT OR REPLACE INTO settings_t (key, value) VALUES (?, ?)').run('passwordHash', passwordHash);
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
    setPasswordHash
};
