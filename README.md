# Personal Journal App

I've been writing to a journal every day since 2018. Over the past year, the journal app I've been using has become increasingly buggy as I believe I've been overloading it with years of entries. Since it wasn't built for scale, I decided to create a robust, bulletproof alternative with cloud syncing to persist my entries and fully migrate off the current app. 

Electron-based application built with React, featuring local IndexedDB storage and optional AWS S3 cloud synchronization for reliable, long-term data persistence.

## Features

- **Local-first storage**: All entries stored in browser IndexedDB
- **Calendar & List views**: Browse entries by calendar or chronological list
- **Rich text editing**: WYSIWYG editor for journal entries
- **Password protection**: Optional app-level password security
- **Cloud sync**: Optional AWS S3 synchronization for backup and cross-device access
- **Offline-first**: Works without internet connection

## Tech Stack

- **Electron** (v37.1.0) - Desktop app framework
- **React** (v19.1.0) - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool for renderer process
- **React Router** - Client-side routing
- **IndexedDB** - Local database storage
- **AWS SDK v3** - S3 cloud sync
- **electron-builder** - App packaging

## Project Structure

```
toop-journal/
├── main/              # Electron main process (Node.js)
│   ├── main.ts       # Main window setup & IPC handlers
│   └── cloudSync.ts  # AWS S3 sync logic
├── renderer/          # React frontend (browser context)
│   ├── src/          # React components & pages
│   ├── db/           # IndexedDB operations
│   └── lib/          # Utilities, types, hooks
├── preload/          # Preload scripts (bridge between main & renderer)
└── cloudsync/        # Cloud sync configuration files
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
npm start
```

This runs:
- Electron app with hot-reload
- Vite dev server on `http://localhost:5173`
- TypeScript compilation for main process

## Building

### Build main process:
```bash
npm run build:main
```

### Build renderer:
```bash
cd renderer
npm run build
```

### Package application:
```bash
npm run app:dir    # Build app directory (for testing)
npm run app:dist   # Create distributable (DMG on macOS)
```

Built files are output to `release/` directory.

## Cloud Sync Setup

Cloud sync is optional and uses AWS S3 for backup and synchronization. See [cloudsync/README.md](cloudsync/README.md) for detailed setup instructions.

Quick setup:
1. Create `/cloudsync/config.json` with your AWS credentials
2. Configure S3 bucket with appropriate IAM permissions
3. App will automatically sync entries on create/update/delete

## Scripts

- `npm start` - Start dev environment (Electron + Vite)
- `npm run electron` - Run Electron with built main process
- `npm run build:main` - Compile TypeScript main process
- `npm run app:dir` - Build app directory for testing
- `npm run app:dist` - Create distributable package

## License

ISC

## TODO
- [ ] Add proper way to build project & resolve filepaths

