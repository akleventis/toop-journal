import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Entry } from "../../renderer/lib/types";
import { updateMasterIndex } from '../cloudsync/master_index';

const dbPath = app.isPackaged
  ? path.join(app.getPath('userData'), 'journal.db')
  : path.join(__dirname, '../../../../journal.db');

const db = new Database(dbPath);

console.log("dbPath", dbPath);

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    location TEXT,
    timestamp INTEGER NOT NULL,
    lastModified INTEGER
  );
  
  CREATE INDEX IF NOT EXISTS idx_timestamp ON entries(timestamp DESC);
  
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function getEntries(): Entry[] {
    const rows = db.prepare('SELECT * FROM entries').all() as Entry[];
    return rows;
}

function getEntryById(id: string): Entry | null {
    return db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Entry | null;
}

function getMostRecentEntry(): Entry | null {
    return db.prepare('SELECT * FROM entries ORDER BY timestamp DESC LIMIT 1').get() as Entry | null;
}

function getEntriesBetweenTimestamps(startTs: number, endTs: number): Entry[] {
    return db.prepare('SELECT * FROM entries WHERE timestamp BETWEEN ? AND ?').all(startTs, endTs) as Entry[];
}

function createEntry(entry: Entry): void {
    db.prepare('INSERT INTO entries (id, date, content, location, timestamp, lastModified) VALUES (?, ?, ?, ?, ?, ?)').run(entry.id, entry.date, entry.content, entry.location, entry.timestamp, entry.lastModified);
    updateMasterIndex(entry.id, { lastModified: entry.lastModified, deleted: false });
}

function updateEntry(id: string, entry: Entry): void {
    db.prepare('UPDATE entries SET date = ?, content = ?, location = ?, timestamp = ?, lastModified = ? WHERE id = ?').run(entry.date, entry.content, entry.location, entry.timestamp, entry.lastModified, id);
    updateMasterIndex(id, { lastModified: entry.lastModified, deleted: false });
}

function deleteEntry(id: string): void {
    db.prepare('DELETE FROM entries WHERE id = ?').run(id);
    updateMasterIndex(id, { lastModified: Date.now(), deleted: true });
}

function getPasswordHash(): string | null {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get('passwordHash');
    return result ? (result as { value: string }).value : null;
}

function setPasswordHash(passwordHash: string): void {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('passwordHash', passwordHash);
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
