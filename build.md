# Toop Journal - Build Output Structure

## Packaged App Structure

```
release/mac-arm64/toop journal.app/
└── Contents/
    ├── Info.plist
    ├── PkgInfo
    ├── MacOS/
    │   └── toop journal                    # Main executable
    ├── Frameworks/                          # Electron framework and helpers
    │   ├── Electron Framework.framework/
    │   ├── Mantle.framework/
    │   ├── ReactiveObjC.framework/
    │   ├── Squirrel.framework/
    │   ├── toop journal Helper.app/
    │   ├── toop journal Helper (GPU).app/
    │   ├── toop journal Helper (Plugin).app/
    │   └── toop journal Helper (Renderer).app/
    └── Resources/
        ├── app.asar                         # Application code (archived)
        ├── app.asar.unpacked/               # Native modules (better-sqlite3)
        │   └── node_modules/
        ├── icon.icns                        # App icon
        └── *.lproj/                         # Localization resources
```

## app.asar Contents

The `app.asar` file contains the application code in an archived format:

```
app.asar/
├── package.json
├── assets/
│   └── icon_v1.png                          # Window icon
├── dist/
│   ├── main/
│   │   ├── main/                            # Main process (entry point)
│   │   │   ├── main.js                      # __dirname points here in production
│   │   │   ├── cloudsync/
│   │   │   │   ├── aws_client.js
│   │   │   │   ├── aws_config.js
│   │   │   │   ├── master_index.js
│   │   │   │   └── transact.js
│   │   │   └── db/
│   │   │       └── sqlite.js
│   │   ├── preload/                         # Preload scripts
│   │   │   └── preload.js
│   │   └── renderer/                        # Shared types
│   │       └── lib/
│   │           └── types.js
│   └── renderer/                            # Renderer process (UI)
│       ├── index.html                       # Main HTML file
│       └── assets/
│           ├── index-k38OMHaP.js           # Bundled React app
│           └── index-PrveMwbo.css          # Styles
└── node_modules/                            # Dependencies (except native modules)
```

## Path Resolution in Production

When the app runs in production:

```javascript
__dirname = "/path/to/app.asar/dist/main/main"
process.resourcesPath = "/path/to/toop journal.app/Contents/Resources"
```

**Relative paths from `__dirname`:**
- Icon: `path.join(__dirname, '../../assets/icon_v1.png')`
  - Resolves to: `app.asar/assets/icon_v1.png`
- Preload: `path.join(__dirname, '../preload/preload.js')`
  - Resolves to: `app.asar/dist/main/preload/preload.js`
- Renderer: `path.join(__dirname, '../../renderer/index.html')`
  - Resolves to: `app.asar/dist/renderer/index.html`

## User Data Location

The app stores user data in the system's application support directory:

```
macOS: ~/Library/Application Support/toop-journal/
├── journal.db              # SQLite database (entries, metadata)
└── userData/               # Cloud sync data
    └── masterIndex.json    # Master index for sync
    └── config.json         # AWS configuration
```

**Access via Electron API:**
```javascript
app.getPath('userData')
// Returns: /Users/<username>/Library/Application Support/toop-journal
```

## Development vs Production

| Resource      | Development                               | Production                                              |
|---------------|-------------------------------------------|---------------------------------------------------------|
| `__dirname`   | `/path/to/toop-journal/main`             | `.../app.asar/dist/main/main`                          |
| HTML          | `http://localhost:5173`                   | `file://.../app.asar/dist/renderer/index.html`         |
| Preload       | `../preload/preload.js`                   | `../preload/preload.js` (same relative path!)          |
| Icon          | `../assets/icon_v1.png`                   | `../../assets/icon_v1.png`                             |
| User Data     | `~/Library/Application Support/toop-journal` | Same in both environments                           |

