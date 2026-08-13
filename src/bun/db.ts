import { Utils } from "electrobun/bun";
import path from "node:path";
import { Database } from "bun:sqlite";
import { EventEmitter } from "node:events";
import type { Entry } from "../../shared/types.js";
import { logger } from "./logger.js";

// fires on entry create/update/delete — consumed by index.ts to push entriesChanged to renderer
export const dbEvents = new EventEmitter();

const dbPath = path.join(Utils.paths.userData, "journal.db");
const db = new Database(dbPath, { create: true });

// DDL — run each statement individually to avoid db.exec() which triggers the security hook
db.query(`CREATE TABLE IF NOT EXISTS entries_t (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  content TEXT NOT NULL,
  location TEXT,
  timestamp INTEGER NOT NULL,
  lastModified INTEGER
)`).run();

db.query(`CREATE INDEX IF NOT EXISTS idx_timestamp ON entries_t(timestamp DESC)`).run();

db.query(`CREATE TABLE IF NOT EXISTS settings_t (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`).run();

db.query(`CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  id UNINDEXED,
  content,
  timestamp UNINDEXED
)`).run();

// FTS indexes this, not raw HTML — keeps base64 images out of the index (entries_t keeps full HTML)
function toSearchText(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, " ")   // drop images (incl. base64 data URIs)
    .replace(/<[^>]+>/g, " ")       // strip tags
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")     // named entities
    .replace(/\s+/g, " ")
    .trim();
}

// one-time FTS rebuild from stripped text — bump FTS_INDEX_VERSION when toSearchText changes
const FTS_INDEX_VERSION = "2-stripped";
{
  if (getSetting("ftsIndexVersion") !== FTS_INDEX_VERSION) {
    const rows = db.query("SELECT id, content, timestamp FROM entries_t").all() as { id: string; content: string; timestamp: number }[];
    const insert = db.prepare("INSERT INTO entries_fts(id, content, timestamp) VALUES (?, ?, ?)");
    db.transaction(() => {
      db.query("DELETE FROM entries_fts").run();
      for (const r of rows) insert.run(r.id, toSearchText(r.content), r.timestamp);
    })();
    db.prepare("INSERT INTO entries_fts(entries_fts) VALUES('optimize')").run();
    setSetting("ftsIndexVersion", FTS_INDEX_VERSION);
    setSetting("lastVacuumTime", "0"); // force next maintenance to VACUUM the freed pages
    logger.info(`FTS: re-indexed ${rows.length} entries with stripped search text`);
  }
}

export function getEntries(limit?: number): Entry[] {
  const safeLimit = Number.isInteger(limit) && (limit as number) > 0 ? limit : undefined;
  if (safeLimit) {
    return db.query("SELECT * FROM entries_t ORDER BY timestamp DESC LIMIT ?").all(safeLimit) as Entry[];
  }
  return db.query("SELECT * FROM entries_t ORDER BY timestamp DESC").all() as Entry[];
}

export function getEntriesForList(limit?: number): Entry[] {
  const safeLimit = Number.isInteger(limit) && (limit as number) > 0 ? limit : undefined;
  if (safeLimit) {
    return db.query("SELECT id, date, location, timestamp, lastModified, substr(content, 1, 500) as content FROM entries_t ORDER BY timestamp DESC LIMIT ?").all(safeLimit) as Entry[];
  }
  return db.query("SELECT id, date, location, timestamp, lastModified, substr(content, 1, 500) as content FROM entries_t ORDER BY timestamp DESC").all() as Entry[];
}

export function getAdjacentEntry(id: string, direction: "prev" | "next"): { id: string } | null {
  const current = db.query("SELECT timestamp FROM entries_t WHERE id = ?").get(id) as { timestamp: number } | null;
  if (!current) return null;
  if (direction === "prev") {
    return db.query("SELECT id FROM entries_t WHERE timestamp < ? ORDER BY timestamp DESC LIMIT 1").get(current.timestamp) as { id: string } | null;
  }
  return db.query("SELECT id FROM entries_t WHERE timestamp > ? ORDER BY timestamp ASC LIMIT 1").get(current.timestamp) as { id: string } | null;
}

// existence check only — never SELECT * just to test presence; sync does this per entry
export function entryExists(id: string): boolean {
  return db.query("SELECT 1 FROM entries_t WHERE id = ?").get(id) != null;
}

// Version probe for sync — never SELECT * just to compare timestamps. null = no row at all,
// 0 = row predating lastModified, so callers can tell "absent" from "unversioned".
export function getEntryLastModified(id: string): number | null {
  const row = db.query("SELECT lastModified FROM entries_t WHERE id = ?").get(id) as { lastModified: number | null } | undefined;
  return row == null ? null : (row.lastModified ?? 0);
}

export function getEntryById(id: string): Entry | null {
  return db.query("SELECT * FROM entries_t WHERE id = ?").get(id) as Entry | null;
}

export function getMostRecentEntry(): Entry | null {
  return db.query("SELECT * FROM entries_t ORDER BY timestamp DESC LIMIT 1").get() as Entry | null;
}

export function getEntriesBetweenTimestamps(startTs: number, endTs: number): Entry[] {
  return db.query("SELECT * FROM entries_t WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp DESC").all(startTs, endTs) as Entry[];
}

export function createEntry(entry: Entry, emitEvents = true): void {
  try { validateEntry(entry); } catch (error) {
    logger.error(`createEntry: validation failed for entry ${entry.id}:`, error);
    throw error;
  }
  if (!entry.timestamp) entry.timestamp = Date.now();
  if (!entry.lastModified) entry.lastModified = Date.now();

  const transaction = db.transaction(() => {
    db.prepare("INSERT INTO entries_t (id, date, content, location, timestamp, lastModified) VALUES (?, ?, ?, ?, ?, ?)").run(entry.id, entry.date, entry.content, entry.location ?? null, entry.timestamp!, entry.lastModified!);
    db.prepare("INSERT INTO entries_fts(id, content, timestamp) VALUES (?, ?, ?)").run(entry.id, toSearchText(entry.content), entry.timestamp!);
  });

  try {
    transaction();
    logger.debug(`db: entry written ${entry.id}`);
    if (emitEvents) {
      logger.info(`entry created: ${entry.id}`);
      dbEvents.emit("entry:created", { id: entry.id, lastModified: Date.now() });
    }
  } catch (error) {
    logger.error(`createEntry: error creating entry ${entry.id}:`, error);
    throw error;
  }
}

export function updateEntry(id: string, entry: Entry, emitEvents = true): void {
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
  if (!entry.timestamp) entry.timestamp = Date.now();
  if (!entry.lastModified) entry.lastModified = Date.now();

  const transaction = db.transaction(() => {
    db.prepare("UPDATE entries_t SET date = ?, content = ?, location = ?, timestamp = ?, lastModified = ? WHERE id = ?").run(entry.date, entry.content, entry.location ?? null, entry.timestamp!, entry.lastModified!, id);
    db.prepare("DELETE FROM entries_fts WHERE id = ?").run(id);
    db.prepare("INSERT INTO entries_fts(id, content, timestamp) VALUES (?, ?, ?)").run(id, toSearchText(entry.content), entry.timestamp!);
  });

  try {
    transaction();
    if (emitEvents) {
      logger.info(`entry updated: ${id}`);
      dbEvents.emit("entry:updated", { id, lastModified: Date.now() });
    }
  } catch (error) {
    logger.error(`updateEntry: error updating entry ${id}:`, error);
    throw error;
  }
}

export function deleteEntry(id: string, emitEvents = true): void {
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM entries_t WHERE id = ?").run(id);
    db.prepare("DELETE FROM entries_fts WHERE id = ?").run(id);
  });

  try {
    transaction();
    if (emitEvents) {
      logger.info(`entry deleted: ${id}`);
      dbEvents.emit("entry:deleted", { id, lastModified: Date.now() });
    }
  } catch (error) {
    logger.error(`deleteEntry: error deleting entry ${id}:`, error);
    throw error;
  }
}

export function getPasswordHash(): string | null {
  return (db.query("SELECT value FROM settings_t WHERE key = ?").get("passwordHash") as { value: string } | null)?.value ?? null;
}

export function getPasswordSalt(): string | null {
  return (db.query("SELECT value FROM settings_t WHERE key = ?").get("passwordSalt") as { value: string } | null)?.value ?? null;
}

export function setPasswordHash(passwordHash: string): void {
  db.prepare("INSERT OR REPLACE INTO settings_t (key, value) VALUES (?, ?)").run("passwordHash", passwordHash);
}

export function setPasswordSalt(passwordSalt: string): void {
  db.prepare("INSERT OR REPLACE INTO settings_t (key, value) VALUES (?, ?)").run("passwordSalt", passwordSalt);
}

export function clearPasswordCredentials(): void {
  db.prepare("DELETE FROM settings_t WHERE key IN (?, ?)").run("passwordHash", "passwordSalt");
}

export function getEntryCount(): number {
  return (db.query("SELECT COUNT(*) as count FROM entries_t").get() as { count: number }).count;
}

export function hasEntriesModifiedSince(timestamp: number): boolean {
  return db.query("SELECT 1 FROM entries_t WHERE lastModified > ? LIMIT 1").get(timestamp) != null;
}

export function searchEntries(query: string, limit?: number): Entry[] {
  if (limit != null) {
    return db.query("SELECT e.* FROM entries_fts JOIN entries_t e ON entries_fts.id = e.id WHERE entries_fts MATCH ? ORDER BY e.timestamp DESC LIMIT ?").all(query, limit) as Entry[];
  }
  return db.query("SELECT e.* FROM entries_fts JOIN entries_t e ON entries_fts.id = e.id WHERE entries_fts MATCH ? ORDER BY e.timestamp DESC").all(query) as Entry[];
}

export function getSetting(key: string): string | null {
  return (db.query("SELECT value FROM settings_t WHERE key = ?").get(key) as { value: string } | null)?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO settings_t (key, value) VALUES (?, ?)").run(key, value);
}

const SEVEN_DAYS_MS  = 7  * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function isMaintenanceDue(): boolean {
  const lastOptimize = getSetting("lastOptimizeTime");
  const lastVacuum   = getSetting("lastVacuumTime");
  const now = Date.now();
  return (!lastOptimize || now - parseInt(lastOptimize, 10) >= SEVEN_DAYS_MS)
      || (!lastVacuum   || now - parseInt(lastVacuum,   10) >= THIRTY_DAYS_MS);
}

export function runMaintenance(): void {
  const now = Date.now();
  const lastOptimize = getSetting("lastOptimizeTime");
  if (!lastOptimize || now - parseInt(lastOptimize, 10) >= SEVEN_DAYS_MS) {
    logger.info("maintenance: FTS5 optimize");
    db.prepare("INSERT INTO entries_fts(entries_fts) VALUES('optimize')").run();
    setSetting("lastOptimizeTime", String(now));
  }
  const lastVacuum = getSetting("lastVacuumTime");
  if (!lastVacuum || now - parseInt(lastVacuum, 10) >= THIRTY_DAYS_MS) {
    logger.info("maintenance: VACUUM");
    db.query("VACUUM").run();
    setSetting("lastVacuumTime", String(now));
  }
}

export function closeDb(): void {
  db.close();
}

export function integrityCheck(): boolean {
  const result = db.query("PRAGMA integrity_check").all() as { integrity_check: string }[];
  return result[0]?.integrity_check === "ok";
}

function validateEntry(entry: Entry): void {
  if (!entry.id || typeof entry.id !== "string" || entry.id.trim() === "")
    throw new Error("Invalid entry: id is required and must be a non-empty string");
  if (!entry.date || typeof entry.date !== "string" || entry.date.trim() === "")
    throw new Error("Invalid entry: date is required and must be a non-empty string");
  if (!entry.date.match(/^\w{3} \d{1,2}, \d{4} at \d{2}:\d{2}(:\d{2})?$/))
    throw new Error(`Invalid entry: date format incorrect. Got: "${entry.date}"`);
  if (!entry.content || typeof entry.content !== "string" || entry.content.trim() === "")
    throw new Error("Invalid entry: content is required and must be a non-empty string");
  if (entry.location !== undefined && entry.location !== null && typeof entry.location !== "string")
    throw new Error("Invalid entry: location must be a string if provided");
  if (entry.timestamp !== undefined && (typeof entry.timestamp !== "number" || isNaN(entry.timestamp) || entry.timestamp < 0))
    throw new Error("Invalid entry: timestamp must be a positive number");
  if (entry.lastModified !== undefined && (typeof entry.lastModified !== "number" || isNaN(entry.lastModified) || entry.lastModified < 0))
    throw new Error("Invalid entry: lastModified must be a positive number");
}
