# Personal Journal App

I've been writing to a journal every day since 2018. Over the past year, the app I've been using has become increasingly buggy. Since it wasn't quite built for scale, I decided to create an alternative with cloud sync to persist data with the intention of migrating off my current journal app. 

## Features

- **Local-first storage**: All entries stored in SQLite database
- **Full-text search**: FTS5-powered search across all entries
- **Calendar & List views**: Browse entries by calendar or chronological list
- **Rich text editing**: WYSIWYG editor with Markdown storage
- **Password protection**: Optional app-level password security
- **Cloud sync**: Optional AWS S3 synchronization for cross-device access
- **Automatic backups**: Daily local DB backups, retained for 30 days (More → Backups)
- **Offline-first**: Works without internet connection

## Tech Stack

- **Electron** Desktop app framework
- **React** UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool for renderer process
- **React Router** - Client-side routing
- **better-sqlite3** - Local SQLite database storage
- **AWS SDK v3** - S3 cloud sync
- **electron-builder** - App packaging

## Project Structure

```
toop-journal/
├── main/               # electron main process (node.js)
│   ├── main.ts         # main window setup & ipc handlers
│   ├── db/             # sqlite database operations
│   └── cloudsync/      # aws s3 sync logic
│       ├── aws_client.ts
│       ├── aws_config.ts
│       ├── master_index.ts
│       └── transact.ts
├── renderer/           # react frontend (browser context)
│   ├── src/            # react components & pages
│   ├── db/             # database wrapper functions
│   └── lib/            # utilities, types, hooks
└── preload/            # preload scripts (bridge between main & renderer)
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/akleventis/toop-journal.git
cd toop-journal
```

2. Install dependencies:
```bash
npm install
cd renderer
npm install
cd ..
```

## Development

Start the development environment:

```bash
npm run dev
```

This runs:
- Vite dev server on `http://localhost:5173` with hot-reload for React components
- Electron app with TypeScript compilation for main process
- Changes to renderer (React) hot-reload automatically
- Changes to main process require restart (Ctrl+C, then `npm run dev` again)

## Build & Distribution

### Production Build
Compile all code for production:
```bash
npm run build
```

This creates optimized bundles in `dist/`:
- `dist/renderer/` - Minified React app
- `dist/main/` - Compiled Electron main process and preload scripts

### Package for Distribution
Create a distributable macOS app:
```bash
# Create unpacked app for local testing
npm run package:dir

# Create .dmg installer for distribution
npm run package
```

The packaged app will be in the `release/` directory.

**Note**: In production, the database is stored at `~/Library/Application Support/toop journal/journal.db`

**Logs**: Stored at `~/Library/Application Support/toop journal/logs/app-YYYY-MM-DD.log` — one file per day, retained for 30 days. Viewable in-app via More → View Logs, or open directly in any text editor for post-crash investigation.

**Backups**: Daily automatic backups stored at `~/Library/Application Support/toop journal/backups/`. Retained for 30 days. Restorable via More → Backups (restoring replaces the current DB and restarts the app).

## Cloud Sync Setup

Cloud sync is optional and uses AWS S3 for backup and synchronization. See [main/cloudsync/README.md](main/cloudsync/README.md) for detailed setup instructions.

Quick setup:
1. Configure S3 bucket with appropriate IAM permissions
1. Configure AWS credentials through the app's settings (stored in UserData directory)
1. App will automatically sync entries on create/update/delete

## Scripts

### Development
- `npm run dev` - Start dev environment (Vite dev server + Electron)
- `npm run dev:renderer` - Start only Vite dev server
- `npm run dev:electron` - Build main process and start Electron (requires Vite running)

### Build
- `npm run build` - Build both renderer and main process for production
- `npm run build:renderer` - Build only React app
- `npm run build:main` - Compile only TypeScript for main process

### Distribution
- `npm run package` - Create distributable .dmg installer
- `npm run package:dir` - Create unpacked app for testing
