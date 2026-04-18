/**
 * FTS worker thread — builds an in-memory FTS5 index from the journal DB and
 * handles search/upsert/delete messages from the main thread off the event loop.
 */

import { workerData, parentPort } from 'worker_threads';
import Database from 'better-sqlite3';
import { ENC_PREFIX, decrypt } from '../security/encryption';

type WorkerData = { dbPath: string; encKeyHex: string | null };
const { dbPath, encKeyHex } = workerData as WorkerData;

const encKey = encKeyHex ? Buffer.from(encKeyHex, 'hex') : null;

// short-lived readonly connection — avoids interfering with the main thread's write connection
const sourceDb = new Database(dbPath, { readonly: true });
const rows = sourceDb.prepare('SELECT id, content, timestamp FROM entries_t').all() as {
  id: string; content: string; timestamp: number;
}[];
sourceDb.close();

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
        // index as empty so one bad row doesn't crash the whole worker
        plaintext = '';
        parentPort!.postMessage({ type: 'warn', message: `fts-worker: failed to decrypt entry ${row.id} — indexing as empty. ${err}` });
      }
    }
    insertStmt.run(row.id, plaintext, row.timestamp);
  }
})();

parentPort!.postMessage({ type: 'ready', count: rows.length });

// message handler — search queries and incremental index updates from main thread
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
