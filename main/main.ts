import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'node:path';
import { updateConfig, getConfig, createConfig, deleteConfig } from './cloudsync/aws_config';
import { initS3Client } from './cloudsync/aws_client';
import { Entry, S3Config } from '../renderer/lib/types';
import { putEntryCloudSync, deleteEntryCloudSync, cloudSyncPipeline } from './cloudsync/transact';
import * as db from './db/sqlite';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

const iconPath = isDev
  ? path.join(__dirname, '../assets/icon_v1.png')
  : path.join(process.resourcesPath, 'assets/icon_v1.png');

// For the preload script  
const preloadPath = isDev
  ? path.join(__dirname, '../preload/preload.js')
  : path.join(process.resourcesPath, 'app.asar/dist/preload/preload.js');

const indexHtmlPath = isDev
  ? 'http://localhost:5173'
  : path.join(process.resourcesPath, 'app.asar/dist/renderer/index.html');

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  createWindow();
});

function createWindow() {
  console.log("dirname", __dirname)

  mainWindow = new BrowserWindow({
    width: 600,
    height: 750,
    webPreferences: {
      preload: preloadPath,
      webSecurity: false,
      contextIsolation: true,
    },
    icon: iconPath,
  });

  console.log("isDev", isDev)

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(indexHtmlPath);
  }
  mainWindow.webContents.openDevTools()
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// AWS config functions
ipcMain.handle('cloud-sync:createConfig', (_, config: S3Config) => {
  return createConfig(config);
});

ipcMain.handle('cloud-sync:updateConfig', async (_, config: S3Config) => {
  return updateConfig(config);
});

ipcMain.handle('cloud-sync:deleteConfig', async () => {
  return deleteConfig();
});

ipcMain.handle('cloud-sync:getConfig', async () => {
  return getConfig();
});

// aws client functions
ipcMain.handle('cloud-sync:initS3Client', async () => {
  await initS3Client();
});

// cloud sync pipeline functions
ipcMain.handle('cloud-sync:cloudSyncPipeline', async () => {
  return await cloudSyncPipeline();
});

// master index functions
ipcMain.handle('cloud-sync:putEntryCloudSync', async (_, entry: Entry) => {
  await putEntryCloudSync(entry);
});

ipcMain.handle('cloud-sync:deleteEntryCloudSync', async (_, id: string) => {
  await deleteEntryCloudSync(id);
});

// SQLite operations called from main process; errors bubble up to the main process
ipcMain.handle('sqlite:getEntries', () => {
  return db.getEntries();
});

ipcMain.handle('sqlite:getEntryById', (event, id: string) => {
  return db.getEntryById(id);
});

ipcMain.handle('sqlite:getMostRecentEntry', () => {
  return db.getMostRecentEntry();
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
