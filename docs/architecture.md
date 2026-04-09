# Architecture

## System Overview

toop-journal is an Electron app with two isolated processes that communicate exclusively via IPC:

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer Process (React + Vite)                                │
│                                                                 │
│  App.tsx → Router → List / Edit / New / Calendar / More / ...   │
│               ↕ via window.sqlite.*, window.cloudSync.*, etc.   │
├─────────────────────────────────────────────────────────────────┤
│  Preload (contextBridge)                                        │
│  Exposes: sqlite, cloudSync, security, conflicts,               │
│           syncState, network, logs, backup, dialog              │
├─────────────────────────────────────────────────────────────────┤
│  Main Process (Node.js / Electron)                              │
│                                                                 │
│  ┌──────────────┐  ┌───────────────────┐  ┌─────────────────┐   │
│  │  SQLite DB   │  │  Cloud Sync       │  │  Logger         │   │
│  │  (sqlite.ts) │  │  (cloudsync/)     │  │  (logger.ts)    │   │
│  └──────────────┘  └───────────────────┘  └─────────────────┘   │
│                                                                 │
│  ┌──────────────┐  ┌───────────────────┐                        │
│  │  Backup      │  │  Password         │                        │
│  │  (backup.ts) │  │  (password.ts)    │                        │
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
  content: "markdown string",
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
│   ├── [CONFLICT: both modified, content differs]
│   │   └── db.createConflict() → skip sync, shown in More → Conflicts
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

| Trigger | Action |
|---|---|
| App startup | `initS3Client()` → `cloudSyncPipeline()` |
| App quit (`before-quit`) | `cloudSyncPipeline()` (skipped on backup restore) |
| Manual "Sync" button | `cloudSyncPipeline()` |
| Network restored | `useNetworkSync` hook → `initS3Client()` |
| Entry create/update/delete | `dbEvents.emit()` → `updateLocalMasterIndex()` (local only) |

---

### Local-only Master Index Updates

Every DB write emits an event via `dbEvents` (in `sqlite.ts`). `sync_coordinator.ts` listens and calls `updateLocalMasterIndex()` — which only writes to the local `masterIndex.json`, without touching S3. This keeps the local index current for the next full `cloudSyncPipeline()` run.

```
db.createEntry()
    └── dbEvents.emit('entry:created', { id, lastModified })
            └── sync_coordinator.ts listener
                    └── updateLocalMasterIndex(id, { lastModified, deleted: false })
```

The `skipSync = true` flag on `createEntry/updateEntry/deleteEntry` breaks the recursive loop when sync writes entries received from S3.

---

## SyncState Machine

States and transitions:

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

The state is owned by `SyncStateMachine` singleton in `main/cloudsync/sync_state.ts`. State changes are pushed to the renderer via `webContents.send('sync-state:changed', newState)`. The renderer subscribes via `useSyncState()` hook and displays a colored dot in the navbar and More screen.

---

## Data Flow: Writing an Entry

```
User edits in TextEditor (WYSIWYG HTML)
    │
    │ Save button
    ▼
htmlToMarkdown(html)           ← turndown (renderer/lib/markdown.ts)
    │
    ▼
db.updateEntry(id, entry)      ← renderer/db/db.ts (clears memoized cache)
    │
    │ window.sqlite.updateEntry(id, entry)   ← IPC via preload
    ▼
ipcMain.handle('sqlite:updateEntry')        ← main/main.ts
    │
    ▼
sqlite.updateEntry(id, entry)              ← main/db/sqlite.ts
    │
    ├── writes to entries_t
    ├── updates FTS5 index (via trigger)
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
    │ window.sqlite.getEntries()      ← IPC
    ▼
sqlite.getEntries()                   ← entries_t ORDER BY timestamp DESC
    │
    ▼
entries returned as Entry[]
    │
    ▼
markdownToHtml(entry.content)         ← marked (on display, not stored)
```

`getDecodedEntries()` is memoized per session. Cache is cleared automatically on create/update/delete via `clearDecodedCache()`.

---

## File Locations (macOS)

| File | Path |
|---|---|
| Database (prod) | `~/Library/Application Support/toop-journal/journal.db` |
| Database (dev) | `~/Library/Application Support/toop-journal/journal-dev.db` |
| Master index | `~/Library/Application Support/toop-journal/masterIndex.json` |
| AWS config | `~/Library/Application Support/toop-journal/config.json` |
| Backups | `~/Library/Application Support/toop-journal/backups/` |
| Logs | `~/Library/Application Support/toop-journal/logs/app-YYYY-MM-DD.log` |

---

## Key Design Decisions

- **No direct renderer↔SQLite**: all DB access goes through IPC. The renderer never touches `better-sqlite3` directly.
- **Atomic S3 commit**: local `masterIndex.json` is only updated after S3 upload succeeds, preventing local/S3 divergence on network failure.
- **skipSync flag**: prevents recursive loops when sync writes entries received from S3 back into the DB (which would re-trigger sync).
- **Memoized entry cache**: `getDecodedEntries()` fetches all entries once per session. This keeps navigation fast but requires `clearDecodedCache()` after any write.
- **Dev/prod DB separation**: dev uses `journal-dev.db` so development never touches the real journal data.
