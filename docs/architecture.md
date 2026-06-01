# Architecture

## System Overview

toop-journal is an Electrobun app with two isolated processes that communicate exclusively via RPC:

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer Process (vanilla TypeScript + esbuild, WebKit)        │
│                                                                 │
│  router → List / Edit / New / Calendar / More / ...             │
│               ↕ via window.sqlite.*, window.cloudSync.*, etc.   │
├─────────────────────────────────────────────────────────────────┤
│  RPC Bridge (Electrobun typed RPC)                              │
│  src/mainview/index.ts  ←→  src/bun/index.ts                    │
│  shared/rpc-schema.ts (AppRPC — typed contract)                 │
├─────────────────────────────────────────────────────────────────┤
│  Bun Process (Electrobun)                                       │
│                                                                 │
│  ┌──────────────┐  ┌───────────────────┐  ┌─────────────────┐   │
│  │  SQLite DB   │  │  Cloud Sync       │  │  Logger         │   │
│  │  (db.ts)     │  │  (cloudsync/)     │  │  (logger.ts)    │   │
│  └──────────────┘  └───────────────────┘  └─────────────────┘   │
│                                                                 │
│  ┌──────────────┐  ┌───────────────────┐                        │
│  │  Backup      │  │  Password         │                        │
│  │  (backup.ts) │  │  (security.ts)    │                        │
│  └──────────────┘  └───────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                     AWS S3 (optional)
                     masterIndex.json
                     entries/{id}.json
```

---

## Sync Architecture

### Data Structures

**MasterIndex** (`masterIndex.json` — local + S3):

```
{
  "jun.14.2025": { "lastModified": 1749926155000, "deleted": false },
  "jun.15.2025": { "lastModified": 1749926200000, "deleted": true },
  ...
}
```

**Entry** (SQLite `entries_t` + `entries/{id}.json` on S3):

```
{
  id: "jun.14.2025",
  date: "Jun 14, 2025 at 12:35",
  content: "<p>HTML string</p>",   ← Quill editor format
  location?: "string",
  timestamp: 1749926155000,
  lastModified: 1749926155000
}
```

---

### cloudSyncPipeline Flow

```
cloudSyncPipeline()
│
├── setState(SYNCING)
│
├── loadLocalMasterIndex()       ← reads userData/masterIndex.json
│
├── loadS3MasterIndex()          ← GET s3://{bucket}/masterIndex.json
│
├── syncMasterIndex(local, s3)
│   │
│   │  For each entry ID in union(local keys, s3 keys):
│   │
│   ├── [only in S3]   → fetch entries/{id}.json from S3 → db.createEntry(skipSync)
│   │
│   ├── [only in local] → db.getEntryById(id) → PUT entries/{id}.json to S3
│   │
│   ├── [local newer]
│   │   ├── deleted?  → DELETE entries/{id}.json from S3
│   │   └── updated?  → PUT entries/{id}.json to S3 (local content)
│   │
│   └── [S3 newer]
│       ├── deleted?  → db.deleteEntry(id, skipSync)
│       └── updated?  → fetch entries/{id}.json → db.updateEntry(id, entry, skipSync)
│
├── write merged index → userData/masterIndex.json.tmp
├── PUT masterIndex.json → S3                    ← only commit locally if this succeeds
├── rename .tmp → masterIndex.json               ← atomic local commit
│
└── setState(READY)
```

If any step throws, the temp file is cleaned up and state transitions to `ERROR`.

---

### Sync Triggers


| Trigger                    | Action                                                      |
| -------------------------- | ----------------------------------------------------------- |
| App startup                | `initS3Client()` → `cloudSyncPipeline()`                    |
| App quit (`before-quit`)   | `cloudSyncPipeline()` (with 5s timeout)                     |
| Manual "Sync" button       | `cloudSyncPipeline()`                                       |
| Network restored           | `NetworkManager` → `cloudSyncPipeline()` (if state is READY) |
| Entry create/update/delete | `dbEvents.emit()` → `updateLocalMasterIndex()` (local only) |


---

### Local-only Master Index Updates

Every DB write emits an event via `dbEvents` (in `db.ts`). `sync_coordinator.ts` listens and calls `updateLocalMasterIndex()` — which only writes to the local `masterIndex.json`, without touching S3. This keeps the local index current for the next full `cloudSyncPipeline()` run.

```
db.createEntry()
    └── dbEvents.emit('entry:created', { id, lastModified })
            └── sync_coordinator.ts listener
                    └── updateLocalMasterIndex(id, { lastModified, deleted: false })
```

The `emitEvents = false` flag on `createEntry/updateEntry/deleteEntry` breaks the recursive loop when sync writes entries received from S3.

---

## SyncState Machine

```
              ┌─────────────────────────────────────┐
              │                                     │
         UNINITIALIZED                              │
              │                                     │
              │ initS3Client()                      │
              ▼                                     │
         INITIALIZING ──── error ────► ERROR        │
              │                         │           │
              │ success                 │ retry     │
              ▼                         │           │
           READY ◄───────────────────────           │
              │   ▲                                 │
  cloudSync   │   │ success                         │
  Pipeline()  │   │                                 │
              ▼   │                                 │
           SYNCING ───── error ──────► ERROR        │
                                                    │
  (any state) ──── no network ──────► OFFLINE ──────┘
                                     (network restored → INITIALIZING)

  disableSync() ──────────────────── DISABLED
```

State is owned by `SyncStateMachine` in `src/bun/cloudsync/sync_state.ts`. Changes are pushed to the renderer via `rpc.send.syncStateChanged`. The renderer subscribes via `window.syncState.onStateChange` and displays a colored dot in the navbar and More screen.

---

## Data Flow: Writing an Entry

```
User edits in Quill editor
    │
    │ Save button
    ▼
db.updateEntry(id, entry)      ← renderer/db/db.ts (clears memoized cache)
    │
    │ window.sqlite.updateEntry(id, entry)   ← RPC via shim
    ▼
rpc.request.sqliteUpdateEntry()             ← src/bun/index.ts
    │
    ▼
db.updateEntry(id, entry)                   ← src/bun/db.ts (bun:sqlite)
    │
    ├── writes to entries_t (plain HTML content)
    ├── upserts entries_fts (FTS5 index — same process)
    └── dbEvents.emit('entry:updated', { id, lastModified })
            │
            ▼
        updateLocalMasterIndex()           ← local masterIndex.json only
```

---

## Data Flow: Reading Entries

```
App startup → getDecodedEntries()     ← renderer/db/db.ts (memoized)
    │
    │ window.sqlite.getEntries()      ← RPC
    ▼
db.getEntries()                       ← entries_t ORDER BY timestamp DESC
    │
    ▼
Entry[] returned (plain HTML content)
    │
    ▼
rendered directly by Quill / innerHTML
```

`getDecodedEntries()` is memoized per session. Cache is cleared automatically on create/update/delete.

---

## File Locations (macOS)


| File         | Dev                                       | Prod                                  |
| ------------ | ----------------------------------------- | ------------------------------------- |
| Database     | `com.bookoftoop.app/dev/journal.db`       | `com.bookoftoop.app/stable/journal.db`       |
| Master index | `com.bookoftoop.app/dev/masterIndex.json` | `com.bookoftoop.app/stable/masterIndex.json` |
| AWS config   | `com.bookoftoop.app/dev/config.json`      | `com.bookoftoop.app/stable/config.json`      |
| Backups      | `com.bookoftoop.app/dev/backups/`         | `com.bookoftoop.app/stable/backups/`         |
| Logs         | `com.bookoftoop.app/dev/logs/`            | `com.bookoftoop.app/stable/logs/`            |

All paths are under `~/Library/Application Support/`. The `channel` field in `version.json` (`dev` or `stable`) determines the subdirectory — set automatically by Electrobun.

---

## Key Design Decisions

- **No direct renderer↔SQLite**: all DB access goes through RPC. The renderer never touches `bun:sqlite` directly.
- **Atomic S3 commit**: local `masterIndex.json` is only updated after S3 upload succeeds, preventing local/S3 divergence on network failure.
- **emitEvents = false**: prevents recursive loops when sync writes entries received from S3 back into the DB.
- **Memoized entry cache**: `getDecodedEntries()` fetches all entries once per session. Requires cache clear after any write.
- **FTS5 persistent**: `entries_fts` is a persistent virtual table in the DB file. No rebuild on launch — populated once on first run from `entries_t`, then kept in sync on every write.
- **Dev/prod DB separation**: `Utils.paths.userData` uses the `channel` from `version.json` (`dev` in dev mode, `stable` in packaged builds) — dev never touches the production database.

