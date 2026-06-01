# Development Guide

## Prerequisites

- [Bun](https://bun.sh) (used as runtime and bundler for the bun process)
- Node.js / npm (for renderer build tooling via `renderer/node_modules`)
- macOS arm64

## Setup

```bash
# Install bun-side dependencies (Electrobun, AWS SDK)
bun install
# or: npm install

# Install renderer dependencies (esbuild, tailwindcss, Quill)
npm --prefix renderer install
```

## Running in Dev Mode

```bash
npm run dev
```

This builds the renderer assets (one-shot esbuild + tailwindcss), then launches the Electrobun dev server with file watching and hot reload.

After making changes to:
- **`src/bun/`** — Electrobun rebuilds and relaunches the bun process automatically
- **`renderer/src/`** or **`src/mainview/index.ts`** — re-run `npm run dev` (renderer is not watch-built in dev mode by default; run `npm run build:assets` to rebuild)

## Dev vs Production Database

`Utils.paths.userData` from `electrobun/bun` automatically appends `/dev` when running in dev mode:

| Mode | userData path |
|---|---|
| Dev | `~/Library/Application Support/com.bookoftoop.app/dev/` |
| Production | `~/Library/Application Support/com.bookoftoop.app/stable/` |

No config needed — the switch is automatic.

### Resetting the dev database

```bash
rm ~/Library/Application\ Support/com.bookoftoop.app/dev/journal.db
rm ~/Library/Application\ Support/com.bookoftoop.app/dev/masterIndex.json
```

Relaunch — both are recreated from scratch on startup.

### Seeding the dev database

```bash
cp ~/Library/Application\ Support/com.bookoftoop.app/journal.db \
   ~/Library/Application\ Support/com.bookoftoop.app/dev/journal.db
```

Then relaunch. Do **not** copy `config.json` unless you want S3 sync active in dev.

## Building

```bash
npm run build      # build:assets + electrobun build → build/
npm run package    # build + package → DMG
```

## Project Structure

```
src/bun/              Bun process (main logic)
  index.ts            RPC handlers, app lifecycle, push events
  db.ts               All SQLite ops (bun:sqlite), FTS5, dbEvents
  logger.ts           Logger singleton
  backup.ts           Daily backup logic
  security.ts         PBKDF2 password hashing
  cloudsync/          S3 sync pipeline

src/mainview/         Webview
  index.ts            RPC shim — populates window.* globals
  index.html          Entry point

shared/               Shared types + RPC contract
  types.ts            Entry, MasterIndex, Conflict, SyncState, S3Config, etc.
  rpc-schema.ts       Typed AppRPC interface

renderer/             Renderer source (vanilla TypeScript + Quill)
  src/                Views, components
  lib/                Utilities (dates, entries, nav-guard, etc.)
  db/db.ts            Renderer-side DB wrapper (memoized)

interface.d.ts        Global Window type declarations
electrobun.config.ts  Electrobun build config
```

## Adding a Feature

Every new RPC channel requires exactly 4 edits:

1. **`interface.d.ts`** — add the method signature to the relevant `window.*` interface
2. **`src/mainview/index.ts`** — wire it to `rpc.request.*` or `rpc.send.*`
3. **`shared/rpc-schema.ts`** — add the typed entry to `AppRPC`
4. **`src/bun/index.ts`** — add the handler in `requests` or `messages`

Use `requests` for request/response (renderer `await`s a result). Use `messages` for fire-and-forget.

## Debugging

### Bun process

Logs write to `~/Library/Application Support/com.bookoftoop.app/dev/logs/app-YYYY-MM-DD.log` and also stream to the in-app **More → View Logs** panel.

Use the `logger` singleton — never `console.*`:
```ts
import { logger } from './logger.js';
logger.debug('...');
logger.info('...');
logger.warn('...');
logger.error('...', error);
```

### Renderer process

Use `handleError` from `renderer/lib/error-handler.ts` — never `console.error`. Forwards errors tagged `[renderer]` to the log file.

Right-click → Inspect is available in dev mode via the system WebKit context menu if enabled. Alternatively, add visible DOM output for quick debugging.

### Inspecting the database

```bash
sqlite3 ~/Library/Application\ Support/com.bookoftoop.app/dev/journal.db

.tables
SELECT id, date, length(content) FROM entries_t ORDER BY timestamp DESC LIMIT 10;
SELECT * FROM settings_t;
SELECT COUNT(*) FROM entries_fts;
```

### Inspecting the master index

```bash
cat ~/Library/Application\ Support/com.bookoftoop.app/dev/masterIndex.json | jq . | head -30
```

### Inspecting S3 contents

```bash
aws s3 ls s3://{your-bucket}/entries/
aws s3 cp s3://{your-bucket}/entries/jun.14.2025.json - | jq .
aws s3 cp s3://{your-bucket}/masterIndex.json - | jq . | head -20
```

## Common Pitfalls

### Renderer changes not reflecting

Re-run `npm run build:assets` — the renderer is not watch-built automatically. Then relaunch `npm run dev`.

### TypeScript errors about `window.sqlite` etc.

These globals are declared in `interface.d.ts` at the project root and included in `renderer/tsconfig.json`. If TypeScript can't find them, check that `../interface.d.ts` is in `renderer/tsconfig.json`'s `include` array.

### S3 sync loop / runaway requests

If you see repeated sync calls in the logs, check for a `dbEvents` listener not using `emitEvents = false`. Any `createEntry/updateEntry/deleteEntry` called from within the sync pipeline must pass `false` as the second argument to avoid re-triggering the sync coordinator.

### Backup restore in dev mode

Restore shows a dialog and calls `Utils.quit()` — it does not auto-relaunch (no Electrobun equivalent). Restart manually with `npm run dev` after restoring.
