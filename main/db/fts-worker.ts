/**
 * FTS worker thread — runs entirely off the main process event loop.
 *
 * On startup:
 *   1. Opens the journal DB read-only (main thread keeps the write connection)
 *   2. Reads all entries, decrypts with the provided key, builds an in-memory
 *      FTS5 index, then closes the read-only connection.
 *   3. Posts { type: 'ready', count } back to the main thread.
 *
 * After ready, handles messages from the main thread:
 *   { type: 'search',  query, limit } → { type: 'result', ids }
 *   { type: 'upsert',  id, content, timestamp  } → no reply (fire-and-forget)
 *   { type: 'delete',  id                      } → no reply (fire-and-forget)
 *
 * content in upsert messages must be plaintext — the main thread decrypts before sending.
 */

import { workerData, parentPort } from 'worker_threads';
import Database from 'better-sqlite3';
import { ENC_PREFIX, decrypt } from '../security/encryption';

type WorkerData = { dbPath: string; encKeyHex: string | null };
const { dbPath, encKeyHex } = workerData as WorkerData;

const encKey = encKeyHex ? Buffer.from(encKeyHex, 'hex') : null;

// Read all entries from the DB using a short-lived readonly connection so we
// don't interfere with the main thread's write connection.
const sourceDb = new Database(dbPath, { readonly: true });
const rows = sourceDb.prepare('SELECT id, content, timestamp FROM entries_t').all() as {
  id: string; content: string; timestamp: number;
}[];
sourceDb.close();

// Build the in-memory FTS5 index.
const ftsDb = new Database(':memory:');
ftsDb.exec(`CREATE VIRTUAL TABLE entries_fts_mem USING fts5(id UNINDEXED, content, timestamp UNINDEXED)`);
const insertStmt = ftsDb.prepare('INSERT INTO entries_fts_mem(id, content, timestamp) VALUES (?, ?, ?)');
ftsDb.transaction(() => {
  for (const row of rows) {
    let plaintext = row.content;
    if (encKey && row.content.startsWith(ENC_PREFIX)) {
      try {
        plaintext = decrypt(row.content, encKey);
      } catch (err) {
        // Corrupted or unreadable entry — index as empty so one bad row
        // doesn't crash the worker and disable search for the entire session.
        plaintext = '';
        parentPort!.postMessage({ type: 'warn', message: `fts-worker: failed to decrypt entry ${row.id} — indexing as empty. ${err}` });
      }
    }
    insertStmt.run(row.id, plaintext, row.timestamp);
  }
})();

parentPort!.postMessage({ type: 'ready', count: rows.length });

// Message handler — search queries and incremental sync from main thread.
parentPort!.on('message', (msg: {
  type: 'search'; query: string; limit: number;
} | {
  type: 'upsert'; id: string; content: string; timestamp: number;
} | {
  type: 'delete'; id: string;
}) => {
  switch (msg.type) {
    case 'search': {
      try {
        const matches = ftsDb.prepare(
          `SELECT id FROM entries_fts_mem WHERE entries_fts_mem MATCH ? ORDER BY timestamp DESC LIMIT ?`
        ).all(msg.query, msg.limit) as { id: string }[];
        parentPort!.postMessage({ type: 'result', ids: matches.map(m => m.id) });
      } catch {
        parentPort!.postMessage({ type: 'result', ids: [] });
      }
      break;
    }
    case 'upsert': {
      // content is plaintext — main thread decrypts before sending
      try {
        ftsDb.prepare('DELETE FROM entries_fts_mem WHERE id = ?').run(msg.id);
        ftsDb.prepare('INSERT INTO entries_fts_mem(id, content, timestamp) VALUES (?, ?, ?)').run(msg.id, msg.content, msg.timestamp);
      } catch { /* non-fatal */ }
      break;
    }
    case 'delete': {
      try {
        ftsDb.prepare('DELETE FROM entries_fts_mem WHERE id = ?').run(msg.id);
      } catch { /* non-fatal */ }
      break;
    }
  }
});
