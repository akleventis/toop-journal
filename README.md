# Book of Toop

I've been writing to a journal every day since 2018. Over the past year, the app I've been using has become increasingly buggy. Since it wasn't quite built for scale, I decided to create an alternative with cloud sync to persist data with the intention of migrating off my current journal app.

## Functionality

Built to last. The app is designed to handle 30+ years of daily entries without degrading — fast search, reliable storage, and no dependency on a third-party service that might disappear. All data lives locally in a SQLite database you own.

Cross-device sync is handled via AWS S3. You'll need an AWS account and an S3 bucket — see [docs/aws_setup.md](docs/aws_setup.md) for setup instructions. Once configured, the app syncs automatically on startup and shutdown, and handles conflicts when the same entry is edited on two machines.

Full-text search (FTS5) makes it easy to find anything across thousands of entries instantly.

## Tech Stack

- **Electron** — desktop app framework
- **React + React Router** — UI and client-side routing
- **TypeScript** — end-to-end type safety
- **Vite** — renderer build tool
- **better-sqlite3** — local SQLite storage
- **@tanstack/react-virtual** — virtual scrolling for the entry list (only ~20 DOM nodes rendered at a time)
- **AWS SDK v3** — S3 cloud sync
- **electron-builder** — app packaging and DMG creation

## Project Structure

```
toop-journal/
├── main/                  # Electron main process (Node.js)
│   ├── main.ts            # window setup, IPC handlers, app lifecycle
│   ├── db/                # SQLite operations + FTS worker thread
│   ├── cloudsync/         # AWS S3 sync pipeline
│   ├── security/          # AES-256-GCM encryption, password hashing
│   ├── backup.ts          # daily backup creation and restore
│   ├── health.ts          # health check system
│   └── logger.ts          # structured logger, streams to in-app viewer
├── renderer/              # React frontend
│   ├── src/               # pages and components
│   ├── db/                # renderer-side DB wrapper
│   └── lib/               # hooks, utilities, date/markdown helpers
├── preload/               # contextBridge IPC bridge
├── shared/                # types and API contracts shared across processes
└── scripts/               # build and maintenance scripts
```

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

Runs the Vite dev server (`localhost:5173`) and Electron concurrently. Renderer changes hot-reload; main process changes require restart.

## Build & Distribution

```bash
./scripts/build.sh
```

Installs dependencies, compiles everything, and produces `release/toop journal-<version>-arm64.dmg`.

### npm scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev environment |
| `npm run build` | Compile renderer + main |
| `npm run package` | Build + create .dmg |
| `npm run package:dir` | Build + create unpacked app |

## Data Locations

All runtime data lives in `~/Library/Application Support/toop-journal/`:

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
