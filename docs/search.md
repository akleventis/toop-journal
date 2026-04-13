# Full-Text Search

toop-journal uses **SQLite FTS5** for full-text search over journal entries. Because entry content is encrypted at rest (see `docs/encryption.md`), the index is built and queried entirely in a **worker thread** — decrypted plaintext never reaches disk and the main process event loop is never blocked.

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

This is why a plain SQL `LIKE '%morning%'` was not an acceptable fallback — it has no phrase or prefix capability and is O(n) full table scan.

---

## The encryption problem

Every row in `entries_t` has its `content` field stored as ciphertext:

```
enc:a3f1c9b204e76d81930f2a11:d4e5f6...
```

If FTS5 indexed this column, it would tokenize the ciphertext string and produce tokens like `enc`, `a3f1c9b204e76d81930f2a11`, etc. Searching for `"morning walk"` would match nothing. The on-disk FTS table was therefore removed entirely. Phrase and prefix search over encrypted content requires a separate plaintext index that never touches disk.

---

## Worker thread architecture

Node.js is **single-threaded**. Every IPC call from the renderer, every SQLite operation, and every cloud sync pipeline step runs on the same event loop. Building an FTS5 index from ~3,000 journal entries takes roughly 15 seconds of CPU-bound work. Running that on the main thread would freeze the event loop for 15 seconds — all IPC calls from the renderer would queue up and the app would appear dead.

`worker_threads` is a Node.js module that spawns a **real OS thread** running a separate V8 instance and event loop. It shares no memory with the main thread. The two threads communicate exclusively via `postMessage` / `on('message', ...)`. The main thread is never blocked.

```
Main Process (Thread 1)                  FTS Worker (Thread 2)
────────────────────────                 ─────────────────────────────
app.whenReady()
  buildInMemoryFts() ──── spawns ──────► fts-worker.js starts
  returns immediately                    opens DB read-only
                                         reads all entries_t rows
IPC: getEntries()     ← responds fast    decrypts each row (AES-256-GCM)
IPC: getMostRecent()  ← responds fast    builds FTS5 virtual table...
Renderer renders list                    ...still building (~15s total)...
User reads an entry                      posts { type:'ready', count:2919 }
                         ◄─ notifies ──  waits for search / sync messages
```

---

## Worker lifecycle

### 1. Spawn

`buildInMemoryFts()` in `main/db/sqlite.ts` creates the worker immediately after `createWindow()`. Only two values are sent via `workerData` — both small strings:

```typescript
new Worker(workerPath, {
  workerData: {
    dbPath,                              // path to the SQLite file
    encKeyHex: encKey.toString('hex'),   // 64-char hex AES key
  }
});
```

No entry data is copied to the worker. The worker opens its own **read-only** connection to the DB file — SQLite allows concurrent readers alongside the main thread's write connection.

### 2. Build

Inside the worker (synchronous, never blocks main):

```
open DB read-only
SELECT id, content, timestamp FROM entries_t   (all rows)
close read-only connection

CREATE VIRTUAL TABLE entries_fts_mem USING fts5(...)

for each row:
  decrypt content with AES-256-GCM
  INSERT into entries_fts_mem

post { type: 'ready', count: N }
```

The `fts5` virtual table tokenizes each plaintext insertion and builds the inverted index. This is the slow part (~15s for 3,000 entries). It runs entirely on Thread 2.

### 3. Ready signal

When the worker posts `{ type: 'ready' }`:

```
Worker ──► main thread message handler
              sets ftsWorkerReady = true
              calls onReady() callback
                → mainWindow.webContents.send('fts:ready')
                    → renderer ipcRenderer.on('fts:ready')
                        → setFtsReady(true) in List.tsx
                            → search input enabled
```

Before this signal, the search input is disabled with placeholder `"Indexing..."`. After it, the input becomes active and all searches go through FTS5.

### 4. Search query

```
User submits query in List.tsx
  → db.searchEntries(query, limit)      (renderer → IPC → main thread)
      → if a previous search is still pending, resolve it with [] (cancelled)
      → stores Promise { resolve, reject } in pendingSearch
      → worker.postMessage({ type:'search', query, limit })
      → awaits Promise  [main event loop free to handle other IPC]

Worker receives message:
  → FTS5: SELECT id FROM entries_fts_mem WHERE entries_fts_mem MATCH ?
  → worker.postMessage({ type:'result', ids:[...] })

Main thread message handler:
  → pendingSearch.resolve(ids)
  → pendingSearch = null
  → Promise resolves
  → fetch full rows from entries_t by id (main DB connection)
  → decrypt and return Entry[]
```

The round-trip is dominated by the FTS5 lookup (microseconds for any query size) plus the SQLite fetch for matching rows. Only one search is in flight at a time — if a new query arrives before the previous result returns, the previous Promise is resolved with `[]` and discarded.

### 5. Incremental sync

When an entry is created, updated, or deleted in the main thread, a fire-and-forget message keeps the worker's index in sync. The main thread sends **plaintext** content (it has the key; no need for the worker to decrypt again):

```
createEntry  → worker.postMessage({ type:'upsert', id, content, timestamp })
updateEntry  → worker.postMessage({ type:'upsert', id, content, timestamp })
deleteEntry  → worker.postMessage({ type:'delete', id })
```

The worker handles these after completing the initial build (messages queue in its mailbox during the build phase and are processed in order). If an entry is created during the build window, it arrives as an `upsert` after build completes — no entries are lost.

### 6. Shutdown

`closeDb()` calls `ftsWorker.terminate()`, which hard-kills the worker thread and releases its in-memory DB. The `:memory:` database is gone — no plaintext persists after shutdown.

---

## Key properties

| Property | Detail |
|---|---|
| Plaintext on disk | Never — index is in worker's RAM only |
| Main thread blocking | Zero — worker runs on a separate OS thread |
| Search before ready | Not allowed — input disabled until `fts:ready` |
| Concurrent searches | One at a time — new query cancels previous |
| Query syntax | Full FTS5: phrase, prefix, boolean |
| Incremental updates | Yes — upsert/delete messages keep worker in sync |
| Rebuild on launch | Yes — `:memory:` DB is rebuilt each app start |
| Key exposure | `encKeyHex` passed once via `workerData` at spawn; not sent again |

---

## File map

| File | Role |
|---|---|
| `main/db/fts-worker.ts` | Worker thread: opens DB, builds FTS5, handles search/sync messages |
| `main/db/sqlite.ts` | Spawns worker (`buildInMemoryFts`), routes searches (`searchEntries`), sends sync messages on write |
| `main/main.ts` | Calls `buildInMemoryFts(onReady)` after `createWindow()`; pushes `fts:ready` to renderer |
| `renderer/src/List.tsx` | Listens for `fts:ready`, disables search input until received |
