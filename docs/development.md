# Development Guide

## Prerequisites

- Node.js 18+
- npm
- macOS (arm64 target; `better-sqlite3` is native and must match the platform)

## Setup

```bash
# Install main process dependencies
npm install

# Install renderer dependencies
npm --prefix renderer install
```

## Running in Dev Mode

```bash
npm run dev
```

This runs two processes concurrently via `concurrently`:
- `npm run dev:renderer` — Vite dev server at `http://localhost:5173` (hot reload)
- `npm run dev:electron` — TypeScript compile + Electron launch (no hot reload; restart required for main process changes)

Renderer changes hot-reload instantly. Main process changes (anything in `main/`) require killing and restarting `npm run dev`.

## Dev vs Production Database

In dev mode, the app uses a **separate database** so you never touch your real journal:

| Mode | Database file |
|---|---|
| Dev (`!app.isPackaged`) | `~/Library/Application Support/toop-journal/journal-dev.db` |
| Production | `~/Library/Application Support/toop-journal/journal.db` |

The switch is automatic — no config needed. `app.isPackaged` is `false` when launched via `npm run dev`.

### Resetting the dev database

```bash
rm ~/Library/Application\ Support/toop-journal/journal-dev.db
```

Relaunch the app — the DB is recreated from scratch with all tables. The master index is also recreated:

```bash
rm ~/Library/Application\ Support/toop-journal/masterIndex.json
```

### Seeding the dev database

To copy production data into dev for testing:

```bash
cp ~/Library/Application\ Support/toop-journal/journal.db \
   ~/Library/Application\ Support/toop-journal/journal-dev.db
```

Then relaunch.

## Testing S3 Sync Without Touching Production Data

Use a separate S3 bucket for development. Steps:

1. Create a new S3 bucket (e.g. `toop-journal-dev`) in your AWS account
2. Give your IAM user `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on it
3. In the running dev app, go to **More → AWS Config** and enter the dev bucket credentials
4. The dev app writes to `journal-dev.db` and syncs to the dev bucket — completely isolated from production

The config is stored at `~/Library/Application Support/toop-journal/config.json`. There is currently no per-environment config; if you have production credentials configured, switching to dev credentials will overwrite them. Use a separate OS user account or keep the dev credentials in a note if you need to switch back.

> **Never commit `aws_config.json`** from the project root (a dev artifact from early development). It is gitignored.

## Building

```bash
npm run build        # compiles renderer (Vite) + main (tsc)
npm run package      # build + electron-builder → release/
```

Output: `release/toop-journal-{version}-arm64.dmg`

The packaged app uses the production DB path and `app.isPackaged === true`.

## Project Structure

```
main/                  Node.js / Electron main process
  main.ts              IPC handlers, app lifecycle
  backup.ts            Daily backup logic
  logger.ts            Logger singleton
  db/sqlite.ts         All SQLite operations
  cloudsync/           S3 sync pipeline
  security/password.ts PBKDF2 password hashing

preload/preload.ts     contextBridge — exposes IPC to renderer

renderer/              React app (Vite)
  src/                 Page components
  lib/                 Utilities (dates, markdown, hooks, etc.)
  db/db.ts             Renderer-side DB wrapper (memoized)

interface.d.ts         Global Window type declarations for all IPC APIs
scripts/               Standalone scripts (import_pdf.py)
```

See `CLAUDE.md` for the full key file map and architecture conventions.

## Adding a Feature

Every new IPC channel requires exactly 4 edits:

1. **`interface.d.ts`** — add the method signature to the relevant API interface
2. **`preload/preload.ts`** — expose it via `contextBridge.exposeInMainWorld`
3. **`main/main.ts`** — add `ipcMain.handle()` handler
4. **Implementation** — the actual logic in `main/db/sqlite.ts`, `main/cloudsync/`, etc.

Use `ipcMain.handle` + `ipcRenderer.invoke` for request/response. Use `ipcMain.on` + `ipcRenderer.send` for fire-and-forget (e.g., log forwarding).

## Debugging

### Main process

The main process logs to `~/Library/Application Support/toop-journal/logs/app-YYYY-MM-DD.log`. In dev mode, logs also print to the terminal running `npm run dev`.

Use the `logger` singleton — never `console.*`:
```ts
import { logger } from './logger';
logger.debug('...');
logger.info('...');
logger.warn('...');
logger.error('...', error);
```

### Renderer process

DevTools open automatically in dev mode (see `main.ts` → `mainWindow.webContents.openDevTools()`).

Use `handleError` from `renderer/lib/error-handler.ts` — never `console.error`. This forwards errors to the log file tagged `[Renderer]`.

### Inspecting the database

```bash
# Open with sqlite3 CLI
sqlite3 ~/Library/Application\ Support/toop-journal/journal-dev.db

# Useful queries
.tables
SELECT id, date, length(content) FROM entries_t ORDER BY timestamp DESC LIMIT 10;
SELECT * FROM settings_t;
SELECT * FROM conflicts_t;
```

Or use a GUI tool like [TablePlus](https://tableplus.com) or [DB Browser for SQLite](https://sqlitebrowser.org).

### Inspecting the master index

```bash
cat ~/Library/Application\ Support/toop-journal/masterIndex.json | jq . | head -30
```

### Inspecting S3 contents

```bash
# List all entries
aws s3 ls s3://{your-bucket}/entries/

# View a specific entry
aws s3 cp s3://{your-bucket}/entries/jun.14.2025.json - | jq .

# View master index
aws s3 cp s3://{your-bucket}/masterIndex.json - | jq . | head -20
```

## Common Pitfalls

### Renderer changes not reflecting

Vite hot-reloads the renderer automatically. If a change isn't visible:
- Check the Vite output in the terminal for build errors
- Hard-reload the renderer: `Cmd+R` in the DevTools window

### Main process changes not reflecting

`npm run dev:electron` compiles TypeScript once and launches. It does **not** watch for changes. After editing anything in `main/` or `preload/`, kill and restart `npm run dev`.

### TypeScript errors about `window.sqlite` etc.

These globals are declared in `interface.d.ts` at the project root. If TypeScript can't find them, check that `interface.d.ts` is included in `renderer/tsconfig.json` (or the root tsconfig). The file declares `interface Window` extensions — it has no imports and is picked up automatically if in scope.

### `better-sqlite3` native module errors after `npm install`

`better-sqlite3` is a native Node addon. It must be compiled for the correct Electron version:

```bash
./node_modules/.bin/electron-rebuild -f -w better-sqlite3
```

This is only needed if you see `NODE_MODULE_VERSION` mismatch errors on launch.

### Backup restore doesn't work in dev mode

This is expected. `app.relaunch()` + `app.exit(0)` kills the Electron process, and `concurrently` tears down the whole dev session. Restart manually with `npm run dev` after restoring. Works correctly in the packaged production app.

### S3 sync loop / runaway requests

If you see repeated sync calls in the logs, check for a `dbEvents` listener that's not using `skipSync = true`. Any `createEntry/updateEntry/deleteEntry` called from within `syncMasterIndex` must pass `skipSync = true` to avoid re-triggering the sync coordinator.
