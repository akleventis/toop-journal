import { app, BrowserWindow, dialog, ipcMain, Menu, session } from 'electron';
import path from 'node:path';
import { updateConfig, getConfig, createConfig, deleteConfig, disableSync, initS3Client } from './cloudsync/aws-connection';
import { Entry, S3Config } from '../shared/types';
import { cloudSyncPipeline, isSyncConfigured, getLastSyncTime } from './cloudsync/transact';
import * as db from './db/sqlite';
import { initLocalMasterIndex } from './cloudsync/master_index';
import { resolveConflict } from './cloudsync/conflict_resolver';
import { createBackup, listBackups, restoreBackup } from './backup';
import { runHealthCheck } from './health';
import { hashPassword, verifyPassword } from './security/password';
import './cloudsync/sync_coordinator';
import { syncStateMachine, SyncState } from './cloudsync/sync_state';
import { logger, LOG_RECENT_LINES } from './logger';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let skipSyncOnQuit = false;
let isDirty = false;
let isQuitting = false;

const iconPath = path.join(__dirname, '../../assets/icon.png');

const indexHtmlPath = isDev
  ? 'http://localhost:5173'
  : path.join(__dirname, '../renderer/index.html');

const preloadPath = path.join(__dirname, '../preload/preload.js');

async function confirmDiscardChanges(detail: string, confirmLabel: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox(mainWindow!, {
    type: 'question',
    buttons: [confirmLabel, 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: 'You have unsaved changes',
    detail,
  });
  return response === 0;
}

function logStartupPaths(): void {
  const userData = app.getPath('userData');
  logger.info('paths: ' + JSON.stringify({
    db:          path.join(userData, isDev ? 'journal-dev.db' : 'journal.db'),
    logFile:     logger.currentLogFile,
    backupDir:   path.join(userData, 'backups'),
    masterIndex: path.join(userData, 'masterIndex.json'),
    awsConfig:   path.join(userData, 'config.json'),
  }, null, 2));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // CSP: allow only local resources; data: URIs needed for base64 images in the WYSIWYG editor
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'"
        ],
      },
    });
  });

  logStartupPaths();
  createBackup();
  await initLocalMasterIndex();

  createWindow();

  syncStateMachine.onStateChange((newState) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync-state:changed', newState);
    }
  });
});

// creates the BrowserWindow with spell check context menu and zoom reset
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 750,
    backgroundColor: '#333',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      spellcheck: true,
    },
    icon: iconPath,
  });

  // block navigation away from the app — clicked links in HTML content must not load external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? 'http://localhost:5173' : `file://${path.resolve(__dirname, '../renderer')}`;
    if (!url.startsWith(allowed)) {
      event.preventDefault();
      logger.warn(`will-navigate: blocked navigation to ${url}`);
    }
  });

  // deny all popup/new-window requests from renderer content
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    logger.warn(`setWindowOpenHandler: blocked new window for ${url}`);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menuTemplate: Electron.MenuItemConstructorOptions[] = [];

    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length > 0) {
        params.dictionarySuggestions.forEach((suggestion) => {
          menuTemplate.push({
            label: suggestion,
            click: () => mainWindow?.webContents.replaceMisspelling(suggestion),
          });
        });
      } else {
        menuTemplate.push({ label: 'No suggestions', enabled: false });
      }
      menuTemplate.push(
        { type: 'separator' },
        {
          label: 'Add to Dictionary',
          click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
        { type: 'separator' }
      );
    }

    if (params.isEditable) {
      menuTemplate.push(
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      );
    } else if (params.selectionText) {
      menuTemplate.push({ role: 'copy' });
    }

    if (menuTemplate.length > 0) {
      Menu.buildFromTemplate(menuTemplate).popup();
    }
  });

  // override any persisted per-origin zoom so dev and prod render identically
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.setZoomLevel(0);
  });

  // route red-X through app.quit() so before-quit handles dirty check + sync
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      isQuitting = true;
      app.quit();
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(indexHtmlPath);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

const QUIT_SYNC_TIMEOUT_MS = 5000;

ipcMain.on('app-state:set-dirty', (_event, dirty: boolean) => {
  isDirty = dirty;
});

// sync before app quits (including reloads)
app.on('before-quit', async (event) => {
  isQuitting = true;
  if (isDirty) {
    event.preventDefault();
    if (await confirmDiscardChanges('Your changes will be lost if you quit now.', 'Discard & Quit')) {
      isDirty = false;
      app.quit();
    } else {
      isQuitting = false;
    }
    return;
  }
  if (isSyncConfigured() && !skipSyncOnQuit) {
    // real-time sync already pushed changes — nothing to do
    if (getLastSyncTime() > 0 && !db.hasEntriesModifiedSince(getLastSyncTime())) {
      logger.info('before-quit: no changes since last sync, skipping');
      return;
    }
    event.preventDefault();
    skipSyncOnQuit = true;
    try {
      logger.info('Syncing before quit...');
      await Promise.race([
        (async () => {
          // wait for any in-flight real-time sync to settle before running ours
          if (syncStateMachine.getState() === SyncState.SYNCING) {
            await new Promise<void>(resolve => {
              const unsub = syncStateMachine.onStateChange(s => {
                if (s !== SyncState.SYNCING) { unsub(); resolve(); }
              });
            });
          }
          await cloudSyncPipeline();
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('sync timeout after 5s')), QUIT_SYNC_TIMEOUT_MS)
        ),
      ]);
      logger.info('Sync complete, quitting...');
    } catch (error) {
      logger.error('Error syncing before quit:', error);
    } finally {
      app.quit();
    }
  }
});

// aws config functions
ipcMain.handle('cloud-sync:createConfig', (_, config: S3Config) => {
  return createConfig(config);
});

ipcMain.handle('cloud-sync:updateConfig', async (_, config: S3Config) => {
  // if secret was omitted (renderer never receives it), merge from stored config
  if (!config.aws_secret) {
    const stored = getConfig();
    if (stored?.aws_secret) config = { ...config, aws_secret: stored.aws_secret };
  }
  return updateConfig(config);
});

ipcMain.handle('cloud-sync:deleteConfig', async () => {
  return deleteConfig();
});

ipcMain.handle('cloud-sync:disableSync', () => {
  return disableSync();
});

ipcMain.handle('cloud-sync:getConfig', async () => {
  const config = getConfig();
  // omit secret from renderer — UI shows placeholder; secret is merged back on update if blank
  if (!config) return null;
  return { ...config, aws_secret: '' };
});


// aws client functions
ipcMain.handle('cloud-sync:initS3Client', async () => {
  await initS3Client();
});

// aws cloud sync pipeline: syncs master indexes & entries between local and S3
ipcMain.handle('cloud-sync:cloudSyncPipeline', async () => {
  const result = await cloudSyncPipeline();
  mainWindow?.webContents.send('sqlite:entries-changed');
  return result;
});

// sqlite operations called from main process; errors bubble up to the renderer process
ipcMain.handle('sqlite:getEntries', (_, limit?: number) => {
  return db.getEntries(limit);
});

ipcMain.handle('sqlite:getEntriesForList', (_, limit?: number) => db.getEntriesForList(limit));

ipcMain.handle('sqlite:getAdjacentEntry', (_, id: string, direction: 'prev' | 'next') => db.getAdjacentEntry(id, direction));

ipcMain.handle('sqlite:getEntryById', (_, id: string) => {
  return db.getEntryById(id);
});

ipcMain.handle('sqlite:getMostRecentEntry', () => {
  return db.getMostRecentEntry();
});

ipcMain.handle('sqlite:getEntryCount', () => db.getEntryCount());

ipcMain.handle('sqlite:searchEntries', (_, query: string, limit?: number) => {
  return db.searchEntries(query, limit);
});

ipcMain.handle('sqlite:getEntriesBetweenTimestamps', (_, startTs: number, endTs: number) => {
  return db.getEntriesBetweenTimestamps(startTs, endTs);
});

ipcMain.handle('sqlite:createEntry', (_, entry: Entry) => {
  return db.createEntry(entry);
});

ipcMain.handle('sqlite:updateEntry', (_, id: string, entry: Entry) => {
  return db.updateEntry(id, entry);
});

ipcMain.handle('sqlite:deleteEntry', (_, id: string) => {
  return db.deleteEntry(id);
});

ipcMain.handle('sqlite:getPasswordHash', () => {
  return db.getPasswordHash();
});

ipcMain.handle('sqlite:setPasswordHash', (_, passwordHash: string) => {
  return db.setPasswordHash(passwordHash);
});

ipcMain.handle('sqlite:getPasswordSalt', () => {
  return db.getPasswordSalt();
});

ipcMain.handle('sqlite:setPasswordSalt', (_, passwordSalt: string) => {
  return db.setPasswordSalt(passwordSalt);
});

ipcMain.handle('sqlite:clearPasswordCredentials', () => {
  return db.clearPasswordCredentials();
});

// security
ipcMain.handle('security:hashPassword', (_, password: string) => {
  return hashPassword(password);
});

ipcMain.handle('security:verifyPassword', (_, password: string, hash: string, salt: string) => {
  return verifyPassword(password, hash, salt);
});

// conflict operations
ipcMain.handle('conflicts:getConflicts', () => {
  return db.getConflicts();
});

ipcMain.handle('conflicts:getConflictCount', () => {
  return db.getConflictCount();
});

ipcMain.handle('conflicts:getConflictByEntryId', (_, entryId: string) => {
  return db.getConflictByEntryId(entryId);
});

// sync state
ipcMain.handle('sync-state:getState', () => {
  return syncStateMachine.getState();
});

// settings
ipcMain.handle('sqlite:getSetting', (_, key: string) => {
  return db.getSetting(key);
});

ipcMain.handle('sqlite:setSetting', (_, key: string, value: string) => {
  return db.setSetting(key, value);
});

// dialog
ipcMain.handle('dialog:showError', async (_, message: string) => {
  await dialog.showMessageBox({
    type: 'error',
    title: 'Something went wrong',
    message,
    buttons: ['Reload'],
    defaultId: 0,
  });
  mainWindow?.webContents.reload();
});

// logs
ipcMain.handle('logs:getRecent', () => {
  return logger.getRecentLines(LOG_RECENT_LINES);
});

ipcMain.on('logs:error', (_, msg: string) => {
  logger.error(`[Renderer] ${msg}`);
});

// health
ipcMain.handle('health:run', () => runHealthCheck());

// backup
ipcMain.handle('backup:list', () => listBackups());
ipcMain.handle('backup:restore', async (_, filename: string) => {
  skipSyncOnQuit = true; // skip before-quit sync so restored DB isn't pushed to S3
  db.closeDb();          // close DB before overwriting the file
  restoreBackup(filename);
  app.relaunch();
  app.exit(0);           // exit(0) skips before-quit, avoiding any DB access after close
});

// conflict resolution
ipcMain.handle('conflicts:resolveConflict', async (_, entryId: string, version: 'local' | 'remote') => {
  await resolveConflict(entryId, version);
  mainWindow?.webContents.send('sqlite:entries-changed');
});
