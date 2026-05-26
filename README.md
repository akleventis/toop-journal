# Book of Toop

I've been writing to a journal every day since 2018. Over the past year, the app I've been using has become increasingly buggy. Since it wasn't quite built for scale, I decided to create an alternative with cloud sync to persist data with the intention of migrating off my current journal app.

## Functionality

Built to last. The app is designed to handle 30+ years of daily entries without degrading — fast search, reliable storage, and no dependency on a third-party service that might disappear. All data lives locally in a SQLite database you own.

Cross-device sync is handled via AWS S3. You'll need an AWS account and an S3 bucket — see [docs/aws_setup.md](docs/aws_setup.md) for setup instructions. Once configured, the app syncs automatically on startup and shutdown, and handles conflicts when the same entry is edited on two machines.

Full-text search (FTS5) makes it easy to find anything across thousands of entries instantly.

## Tech Stack

- **Electron** — desktop app framework
- **TypeScript** — end-to-end type safety
- **Vanilla TypeScript + DOM APIs** — renderer UI (no framework)
- **Quill** — rich text editor
- **esbuild** — renderer bundler
- **@tailwindcss/cli** — CSS
- **better-sqlite3** — local SQLite storage
- **AWS SDK v3** — S3 cloud sync
- **electron-builder** — app packaging and DMG creation

## Why No React

Started with React + Vite. The app has 8 views and doesn't really change — there's no state management problem worth solving, no component reuse story. I ripped it out and replaced it with vanilla TypeScript and direct DOM manipulation. Loads faster, easier to trace bugs, and I don't have to think about what React version I'm on in five years.

## Project Structure

```
toop-journal/
├── main/                  # Electron main process (Node.js)
│   ├── main.ts            # window setup, IPC handlers, app lifecycle
│   ├── db/                # SQLite operations + FTS5
│   ├── cloudsync/         # AWS S3 sync pipeline
│   ├── security/          # AES-256-GCM encryption, password hashing
│   ├── backup.ts          # daily backup creation and restore
│   ├── health.ts          # health check system
│   └── logger.ts          # structured logger, streams to in-app viewer
├── renderer/              # vanilla TypeScript frontend
│   ├── src/
│   │   ├── views/         # one file per page (list, edit, new, calendar, more, …)
│   │   ├── components/    # reusable DOM constructors (navbar, modal, quill-editor, …)
│   │   ├── router.ts      # hash-based router: navigate(), registerRoutes(), initRouter()
│   │   └── main.ts        # app init, password gate, route registration
│   ├── db/                # renderer-side DB wrapper
│   ├── lib/               # utilities (dates, entries, error-handler, network-manager)
│   └── scripts/           # esbuild build scripts (dev.js, build.js)
├── preload/               # contextBridge IPC bridge
├── shared/                # types and API contracts shared across processes
└── scripts/               # maintenance scripts
```

## Download

Download the latest `Book of Toop-x.x.x-arm64.dmg` from [Releases](https://github.com/akleventis/toop-journal/releases). Open the DMG, drag the app to Applications, then run:

```bash
xattr -cr "/Applications/Book of Toop.app"
```

macOS blocks unsigned apps downloaded from the internet — this removes the quarantine flag.

## Installation

```bash
git clone https://github.com/akleventis/toop-journal.git
cd toop-journal
npm install
npm --prefix renderer install
```

## Development

```bash
npm run dev
```

Starts esbuild in watch/serve mode and tailwindcss in watch mode concurrently with Electron. The renderer is served from `dist/renderer/` via esbuild's built-in dev server; Electron loads `dist/renderer/index.html` directly. Renderer changes rebuild automatically; main process changes require restart.

Build scripts: `renderer/scripts/dev.js` (esbuild watch + tailwindcss watch) and `renderer/scripts/build.js` (esbuild + tailwindcss, outputs to `dist/renderer/`).

## Build & Distribution

```bash
npm run build    # compile renderer (esbuild + tailwindcss) + main process
npm run package  # build + electron-builder → release/*.dmg
```

### npm scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev environment |
| `npm run build` | Compile renderer + main |
| `npm run package` | Build + create .dmg |
| `npm run package:dir` | Build + create unpacked app |

## Data Locations

All runtime data lives in `~/Library/Application Support/Book of Toop/`:

| Path | Description |
|---|---|
| `journal.db` | SQLite database |
| `masterIndex.json` | S3 sync index |
| `backups/` | Daily DB snapshots (30-day retention) |
| `logs/` | Log files — one per session, cleared on each launch |
| `config.json` | AWS credentials |

Logs are viewable in-app via More → View Logs.
Backups are restorable via More → Backups (replaces DB and restarts app).

## Cloud Sync

Optional. Uses AWS S3 for cross-device sync. Configure credentials via More → AWS Config. The app syncs on startup, shutdown, and manual trigger. Conflicts are detected per-entry and resolvable via More → Conflicts.
