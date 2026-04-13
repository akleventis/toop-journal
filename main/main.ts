import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage } from 'electron';
import path from 'node:path';
import { updateConfig, getConfig, createConfig, deleteConfig, disableSync } from './cloudsync/aws_config';
import { initS3Client } from './cloudsync/aws_client';
import { Entry, S3Config } from '../renderer/lib/types';
import { cloudSyncPipeline, state } from './cloudsync/transact';
import * as db from './db/sqlite';
import { initLocalMasterIndex } from './cloudsync/master_index';
import { createBackup, listBackups, restoreBackup } from './backup';
import { hashPassword, verifyPassword } from './security/password';
import { loadOrCreateEncKey } from './security/enc-key';
import './cloudsync/sync_coordinator';
import { syncStateMachine } from './cloudsync/sync_state';
import { logger, LOG_RECENT_LINES } from './logger';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let skipSyncOnQuit = false;

const iconPath = isDev
  ? path.join(__dirname, '../../../assets/icon.png')
  : path.join(__dirname, '../../assets/icon.png');

const indexHtmlPath = isDev
  ? 'http://localhost:5173'
  : path.join(__dirname, '../../renderer/index.html');

const preloadPath = path.join(__dirname, '../preload/preload.js');

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  createBackup();
  await initLocalMasterIndex();

  // Set up content encryption. loadOrCreateEncKey() generates a random 32-byte
  // key on first launch and persists it via Electron safeStorage (macOS Keychain).
  const encKey = loadOrCreateEncKey();
  db.setEncryptionKey(encKey);

  createWindow();

  syncStateMachine.onStateChange((newState) => {
    mainWindow?.webContents.send('sync-state:changed', newState);
  });

  // Spawn the FTS worker thread. Reads the DB and builds the in-memory FTS5
  // index entirely in a background thread — main process is never blocked.
  // Pushes 'fts:ready' to the renderer once the index is built.
  // See main/db/fts-worker.ts and docs/encryption.md.
  db.buildInMemoryFts(() => {
    mainWindow?.webContents.send('fts:ready');
  });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 750,
    backgroundColor: '#333',
    webPreferences: {
      preload: preloadPath,
      webSecurity: false,
      contextIsolation: true,
      spellcheck: true,
    },
    icon: iconPath,
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

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
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

// Sync before app quits (including reloads)
app.on('before-quit', async (event) => {
  if (state.AWSClient && state.AWSConfig && !skipSyncOnQuit) {
    event.preventDefault();
    skipSyncOnQuit = true;
    try {
      logger.info('Syncing before quit...');
      await cloudSyncPipeline();
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
  return updateConfig(config);
});

ipcMain.handle('cloud-sync:deleteConfig', async () => {
  return deleteConfig();
});

ipcMain.handle('cloud-sync:disableSync', () => {
  return disableSync();
});

ipcMain.handle('cloud-sync:getConfig', async () => {
  return getConfig();
});

// aws client functions
ipcMain.handle('cloud-sync:initS3Client', async () => {
  await initS3Client();
  // Trigger initial sync after S3 client is initialized
  if (state.AWSClient && state.AWSConfig) {
    try {
      await cloudSyncPipeline();
    } catch (error) {
      logger.error('Error during initial sync:', error);
      throw error;
    }
  }
});

// aws cloud sync pipeline: syncs master indexes & entries between local and S3
ipcMain.handle('cloud-sync:cloudSyncPipeline', async () => {
  return await cloudSyncPipeline();
});

// sqlite operations called from main process; errors bubble up to the renderer process
ipcMain.handle('sqlite:getEntries', (event, limit?: number) => {
  return db.getEntries(limit);
});

ipcMain.handle('sqlite:getEntryById', (event, id: string) => {
  return db.getEntryById(id);
});

ipcMain.handle('sqlite:getMostRecentEntry', () => {
  return db.getMostRecentEntry();
});

ipcMain.handle('sqlite:getEntryCount', () => db.getEntryCount());
ipcMain.handle('sqlite:isFtsReady', () => db.isFtsReady());

ipcMain.handle('sqlite:searchEntries', async (_, query: string, limit?: number) => {
  return db.searchEntries(query, limit);
});

ipcMain.handle('sqlite:getEntriesBetweenTimestamps', (event, startTs: number, endTs: number) => {
  return db.getEntriesBetweenTimestamps(startTs, endTs);
});

ipcMain.handle('sqlite:createEntry', (event, entry: Entry) => {
  return db.createEntry(entry);
});

ipcMain.handle('sqlite:updateEntry', (event, id: string, entry: Entry) => {
  return db.updateEntry(id, entry);
});

ipcMain.handle('sqlite:deleteEntry', (event, id: string) => {
  return db.deleteEntry(id);
});

ipcMain.handle('sqlite:getPasswordHash', () => {
  return db.getPasswordHash();
});

ipcMain.handle('sqlite:setPasswordHash', (event, passwordHash: string) => {
  return db.setPasswordHash(passwordHash);
});

ipcMain.handle('sqlite:getPasswordSalt', () => {
  return db.getPasswordSalt();
});

ipcMain.handle('sqlite:setPasswordSalt', (event, passwordSalt: string) => {
  return db.setPasswordSalt(passwordSalt);
});

ipcMain.handle('sqlite:clearPasswordCredentials', () => {
  return db.clearPasswordCredentials();
});

ipcMain.handle('security:hashPassword', (event, password: string) => {
  return hashPassword(password);
});

ipcMain.handle('security:verifyPassword', (event, password: string, hash: string, salt: string) => {
  return verifyPassword(password, hash, salt);
});

// conflict operations
ipcMain.handle('conflicts:getConflicts', () => {
  return db.getConflicts();
});

ipcMain.handle('conflicts:getConflictCount', () => {
  return db.getConflictCount();
});

ipcMain.handle('conflicts:getConflictByEntryId', (event, entryId: string) => {
  return db.getConflictByEntryId(entryId);
});

ipcMain.handle('sync-state:getState', () => {
  return syncStateMachine.getState();
});

ipcMain.handle('sqlite:getSetting', (event, key: string) => {
  return db.getSetting(key);
});

ipcMain.handle('sqlite:setSetting', (event, key: string, value: string) => {
  return db.setSetting(key, value);
});

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

ipcMain.handle('logs:getRecent', () => {
  return logger.getRecentLines(LOG_RECENT_LINES);
});

ipcMain.on('logs:error', (_, msg: string) => {
  logger.error(`[Renderer] ${msg}`);
});

ipcMain.handle('backup:list', () => listBackups());
ipcMain.handle('backup:restore', async (_, filename: string) => {
  skipSyncOnQuit = true; // skip before-quit sync so restored DB isn't pushed to S3
  db.closeDb();          // close DB before overwriting the file
  restoreBackup(filename);
  app.relaunch();
  app.exit(0);           // exit(0) skips before-quit, avoiding any DB access after close
});

ipcMain.handle('conflicts:resolveConflict', async (_, entryId: string, version: 'local' | 'remote') => {
  const conflict = db.getConflictByEntryId(entryId);
  if (!conflict) {
    throw new Error(`Conflict not found for entry ${entryId}`);
  }

  if (version === 'remote') {
    // update local entry with remote version
    const entry = db.getEntryById(entryId);
    if (entry) {
      entry.content = conflict.remoteVersion;
      entry.lastModified = conflict.remoteModified;
      db.updateEntry(entryId, entry, true); // skipSync for now
    }
  }
  // if version === 'local', keep local as-is
  // delete the conflict
  db.deleteConflict(entryId);
  // trigger sync to resolve the entry
  if (state.AWSClient && state.AWSConfig) {
    try {
      await cloudSyncPipeline();
    } catch (error) {
      logger.error('Error syncing after conflict resolution:', error);
    }
  }
});
