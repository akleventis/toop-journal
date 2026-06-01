# Book of Toop

I've been writing to a journal every day since 2018. Over the past year, the app I've been using has become increasingly buggy. Since it wasn't quite built for scale, I decided to create an alternative with cloud sync to persist data with the intention of migrating off my current journal app.

## Functionality

Built to last. The app is designed to handle 30+ years of daily entries without degrading — fast search, reliable storage, and no dependency on a third-party service that might disappear. All data lives locally in a SQLite database you own.

Cross-device sync is handled via AWS S3. You'll need an AWS account and an S3 bucket — see [docs/aws_setup.md](docs/aws_setup.md) for setup instructions. Once configured, the app syncs automatically on startup and shutdown, and handles conflicts when the same entry is edited on two machines.

Full-text search (FTS5) makes it easy to find anything across thousands of entries instantly.

## Tech Stack

- **Electrobun** — desktop app framework (Bun + system WebKit, no Chromium)
- **Bun** — runtime + SQLite (`bun:sqlite`)
- **TypeScript** — end-to-end type safety
- **Vanilla TypeScript + DOM APIs** — renderer UI (no framework)
- **Quill** — rich text editor
- **esbuild** — renderer bundler
- **@tailwindcss/cli** — CSS
- **AWS SDK v3** — S3 cloud sync

## Why No React

Started with React + Vite. The app has 8 views and doesn't really change — there's no state management problem worth solving, no component reuse story. I ripped it out and replaced it with vanilla TypeScript and direct DOM manipulation. Loads faster, easier to trace bugs, and I don't have to think about what React version I'm on in five years.

## Why Electrobun

Switched from Electron. Electrobun uses Bun as the backend runtime and the system WebKit as the renderer — no bundled Chromium, no Node.js. The app is smaller, starts faster, and the `bun:sqlite` driver is significantly faster than `better-sqlite3`. The tradeoff is a smaller ecosystem, but this app doesn't need it.

## Project Structure

```
toop-journal/
├── src/
│   ├── bun/                   # Bun backend process
│   │   ├── index.ts           # RPC handlers, push events, app lifecycle
│   │   ├── db.ts              # SQLite operations + FTS5
│   │   ├── logger.ts          # structured logger
│   │   ├── security.ts        # AES-256-GCM encryption, password hashing
│   │   ├── backup.ts          # daily backup creation and restore
│   │   └── cloudsync/         # AWS S3 sync pipeline
│   └── mainview/              # WebKit renderer entry + built assets
│       ├── index.ts           # webview shim — window.* globals via RPC
│       └── index.html         # renderer shell
├── renderer/                  # vanilla TypeScript frontend (compiled → src/mainview/)
│   ├── src/
│   │   ├── views/             # one file per page (list, edit, new, calendar, more, …)
│   │   ├── components/        # reusable DOM constructors
│   │   ├── router.ts          # hash-based router: navigate(), registerRoutes()
│   │   └── main.ts            # app init, password gate, route registration
│   ├── db/                    # renderer-side DB wrapper
│   └── lib/                   # utilities (dates, entries, error-handler, nav-guard)
├── shared/                    # types and RPC contract shared across processes
│   ├── rpc-schema.ts          # typed RPC contract (AppRPC)
│   └── types.ts
├── electrobun.config.ts       # Electrobun build config
└── scripts/                   # maintenance scripts
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

Builds renderer assets (esbuild + tailwindcss) then launches Electrobun in dev mode. Renderer changes require re-running the build; the Bun process restarts automatically on changes via Electrobun's dev watcher.

## Build & Distribution

```bash
npm run build    # compile renderer assets + Electrobun build
npm run package  # build with stable env → electrobun/release/*.dmg
```

### npm scripts

| Command | Description |
|---|---|
| `npm run dev` | Build assets + start dev environment |
| `npm run build` | Build assets + Electrobun build |
| `npm run package` | Build assets + Electrobun build (stable) → .dmg |
| `npm run build:assets` | Compile renderer JS + jsPDF bundle + CSS only |

## Data Locations

Dev and stable builds use separate data directories:

| Environment | Path |
|---|---|
| Dev | `~/Library/Application Support/com.bookoftoop.app/dev/` |
| Stable | `~/Library/Application Support/com.bookoftoop.app/stable/` |

| File | Description |
|---|---|
| `journal.db` | SQLite database |
| `masterIndex.json` | S3 sync index |
| `config.json` | AWS credentials |

## Cloud Sync

Optional. Uses AWS S3 for cross-device sync. Configure credentials via More → AWS Config. The app syncs on startup, shutdown, and manual trigger. Conflicts are detected per-entry and resolvable via More → Conflicts.
