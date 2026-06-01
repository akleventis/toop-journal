# Full-Text Search

toop-journal uses **SQLite FTS5** for full-text search over journal entries. The index lives in the database file itself (`entries_fts` virtual table) and is kept in sync with `entries_t` on every write — no rebuild on launch.

---

## Why FTS5

FTS5 is a full-text search extension built into SQLite. It maintains an **inverted index** — a mapping from every word to the set of rows that contain it. For a query like `"great morning"`, SQLite intersects those word sets and returns matching rows in microseconds, regardless of total entry count.

Supported query syntax:

| Syntax | Example | Meaning |
|---|---|---|
| Phrase | `"great morning"` | Words adjacent, in order |
| Prefix | `morn*` | Any word starting with `morn` |
| AND (implicit) | `great morning` | Both words present (any order) |
| NOT | `great NOT morning` | First term without the second |

---

## Architecture

FTS5 runs in the same bun process as all other DB operations — no worker thread. Since `bun:sqlite` is synchronous, search queries execute inline. For a 3000-entry journal, FTS5 lookups complete in microseconds; the only latency is the subsequent `SELECT * FROM entries_t WHERE id IN (...)` fetch.

```
searchEntries(query, limit?)        ← src/bun/db.ts
    │
    ├── SELECT id FROM entries_fts WHERE entries_fts MATCH ? ORDER BY timestamp DESC [LIMIT ?]
    │       ↑ FTS5 inverted index lookup — microseconds
    │
    └── for each id: SELECT * FROM entries_t WHERE id = ?
            ↑ primary key lookup — negligible
    │
    └── return Entry[]
```

---

## Index Lifecycle

### Initial population

On first launch (or after DB reset), `entries_fts` is empty. `db.ts` detects this at startup and populates it from `entries_t` in a single transaction:

```typescript
const ftsCount = db.query("SELECT COUNT(*) as c FROM entries_fts").get().c;
if (ftsCount === 0) {
  // bulk insert all existing entries
}
```

This runs synchronously at startup. For 3000 entries it completes in ~1s.

### Incremental updates

Every `createEntry`, `updateEntry`, and `deleteEntry` upserts `entries_fts` in the same transaction as `entries_t`:

```
createEntry  → INSERT INTO entries_fts(id, content, timestamp)
updateEntry  → DELETE FROM entries_fts WHERE id = ?
               INSERT INTO entries_fts(id, content, timestamp)
deleteEntry  → DELETE FROM entries_fts WHERE id = ?
```

The FTS index is always consistent with `entries_t` — no drift.

### Maintenance

Weekly: `INSERT INTO entries_fts(entries_fts) VALUES('optimize')` — merges FTS5 internal segments for faster queries. Runs as part of the scheduled maintenance task (triggered 5s after startup if due).

---

## Result Limit

Configurable in **More → Search Result Limit**. Empty = all results. When a limit is set and results fill it exactly, a "Load more" button appears in the list footer — clicking it re-queries with `limit × page`.

---

## File Map

| File | Role |
|---|---|
| `src/bun/db.ts` | FTS5 table DDL, initial population, `searchEntries`, write-path upserts, maintenance |
| `renderer/src/views/list.ts` | Search input, debounce, result display |
