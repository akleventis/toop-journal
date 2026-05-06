// FTS worker thread — builds an in-memory FTS5 index from the journal DB and
// handles search/upsert/delete messages from the main thread off the event loop.

import { workerData, parentPort } from 'worker_threads';
import Database from 'better-sqlite3';
type WorkerData = { dbPath: string };
const { dbPath } = workerData as WorkerData;

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
    insertStmt.run(row.id, row.content, row.timestamp);
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
