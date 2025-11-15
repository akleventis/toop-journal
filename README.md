# Personal Journal App

I've been writing to a journal every day since 2018. Over the past year, the journal app I've been using has become increasingly buggy as I've overloaded it with years of entries. Since it wasn't built for scale, I decided to create an alternative with cloud syncing to persist my entries and fully eventually migrate off the current app. 

## Features

- **Local-first storage**: All entries stored in browser IndexedDB
- **Calendar & List views**: Browse entries by calendar or chronological list
- **Rich text editing**: WYSIWYG editor for journal entries
- **Password protection**: Optional app-level password security
- **Cloud sync**: Optional AWS S3 synchronization for backup and cross-device access
- **Offline-first**: Works without internet connection

## Tech Stack

- **Electron** Desktop app framework
- **React** UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool for renderer process
- **React Router** - Client-side routing
- **IndexedDB** - Local database storage
- **AWS SDK v3** - S3 cloud sync
- **electron-builder** - App packaging

## Project Structure

```
toop-journal/
├── main/               # electron main process (node.js)
│   ├── main.ts         # main window setup & ipc handlers
│   └── cloudsync/      # aws s3 sync logic
│       ├── aws_client.ts
│       ├── aws_config.ts
│       ├── master_index.ts
│       └── transact.ts
├── renderer/           # react frontend (browser context)
│   ├── src/            # react components & pages
│   ├── db/             # indexeddb operations
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
npm start
```

This runs:
- Electron app with hot-reload
- Vite dev server on `http://localhost:5173`
- TypeScript compilation for main process

## Build
todo

## Cloud Sync Setup

Cloud sync is optional and uses AWS S3 for backup and synchronization. See [main/cloudsync/README.md](main/cloudsync/README.md) for detailed setup instructions.

Quick setup:
1. Configure S3 bucket with appropriate IAM permissions
1. Configure AWS credentials through the app's settings (stored in UserData directory)
1. App will automatically sync entries on create/update/delete

## Scripts

- `npm start` - Start dev environment (Electron + Vite)
- todo

## License

ISC

## TODO
- [ ] Add proper way to build project & resolve filepaths

