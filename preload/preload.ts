const { contextBridge, ipcRenderer } = require('electron')
import { Entry, S3Config, SyncState } from '../shared/types';

// bridges the gap between the main and renderer processes.

contextBridge.exposeInMainWorld('network', {
  onStatusChange: (callback: (online: boolean) => void) => {
    window.addEventListener('online', () => callback(true));
    window.addEventListener('offline', () => callback(false));
  },
  isOnline: () => navigator.onLine
})

contextBridge.exposeInMainWorld('cloudSync', {
  initS3Client: () => ipcRenderer.invoke('cloud-sync:initS3Client'),
  cloudSyncPipeline: (): Promise<boolean> => ipcRenderer.invoke('cloud-sync:cloudSyncPipeline'),
  createConfig: (config: S3Config) => ipcRenderer.invoke('cloud-sync:createConfig', config),
  updateConfig: (config: S3Config) => ipcRenderer.invoke('cloud-sync:updateConfig', config),
  deleteConfig: () => ipcRenderer.invoke('cloud-sync:deleteConfig'),
  disableSync: () => ipcRenderer.invoke('cloud-sync:disableSync'),
  getConfig: () => ipcRenderer.invoke('cloud-sync:getConfig'),
})

contextBridge.exposeInMainWorld('sqlite', {
  getEntries: (limit?: number) => ipcRenderer.invoke('sqlite:getEntries', limit),
  getEntriesForList: (limit?: number) => ipcRenderer.invoke('sqlite:getEntriesForList', limit),
  getAdjacentEntry: (id: string, direction: 'prev' | 'next') => ipcRenderer.invoke('sqlite:getAdjacentEntry', id, direction),
  getEntryById: (id: string) => ipcRenderer.invoke('sqlite:getEntryById', id),
  getMostRecentEntry: () => ipcRenderer.invoke('sqlite:getMostRecentEntry'),
  getEntryCount: () => ipcRenderer.invoke('sqlite:getEntryCount'),
  searchEntries: (query: string, limit?: number) => ipcRenderer.invoke('sqlite:searchEntries', query, limit),
  getEntriesBetweenTimestamps: (startTs: number, endTs: number) => ipcRenderer.invoke('sqlite:getEntriesBetweenTimestamps', startTs, endTs),
  createEntry: (entry: Entry) => ipcRenderer.invoke('sqlite:createEntry', entry),
  updateEntry: (id: string, entry: Entry) => ipcRenderer.invoke('sqlite:updateEntry', id, entry),
  deleteEntry: (id: string) => ipcRenderer.invoke('sqlite:deleteEntry', id),
  getPasswordHash: () => ipcRenderer.invoke('sqlite:getPasswordHash'),
  setPasswordHash: (passwordHash: string) => ipcRenderer.invoke('sqlite:setPasswordHash', passwordHash),
  getPasswordSalt: () => ipcRenderer.invoke('sqlite:getPasswordSalt'),
  setPasswordSalt: (passwordSalt: string) => ipcRenderer.invoke('sqlite:setPasswordSalt', passwordSalt),
  clearPasswordCredentials: () => ipcRenderer.invoke('sqlite:clearPasswordCredentials'),
  getSetting: (key: string) => ipcRenderer.invoke('sqlite:getSetting', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('sqlite:setSetting', key, value),
  onEntriesChanged: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('sqlite:entries-changed', handler);
    return () => ipcRenderer.removeListener('sqlite:entries-changed', handler);
  },
})

contextBridge.exposeInMainWorld('security', {
  hashPassword: (password: string): Promise<{ hash: string; salt: string }> => ipcRenderer.invoke('security:hashPassword', password),
  verifyPassword: (password: string, hash: string, salt: string): Promise<boolean> => ipcRenderer.invoke('security:verifyPassword', password, hash, salt),
})

contextBridge.exposeInMainWorld('conflicts', {
  getConflicts: () => ipcRenderer.invoke('conflicts:getConflicts'),
  getConflictCount: () => ipcRenderer.invoke('conflicts:getConflictCount'),
  getConflictByEntryId: (entryId: string) => ipcRenderer.invoke('conflicts:getConflictByEntryId', entryId),
  resolveConflict: (entryId: string, version: 'local' | 'remote') => ipcRenderer.invoke('conflicts:resolveConflict', entryId, version),
})

contextBridge.exposeInMainWorld('dialog', {
  showError: (message: string) => ipcRenderer.invoke('dialog:showError', message),
})

contextBridge.exposeInMainWorld('syncState', {
  getState: (): Promise<SyncState> => ipcRenderer.invoke('sync-state:getState'),
  onStateChange: (callback: (state: SyncState) => void): (() => void) => {
    const handler = (_event: unknown, state: SyncState) => callback(state);
    ipcRenderer.on('sync-state:changed', handler);
    return () => ipcRenderer.removeListener('sync-state:changed', handler);
  },
})

contextBridge.exposeInMainWorld('backup', {
  list: () => ipcRenderer.invoke('backup:list'),
  restore: (filename: string) => ipcRenderer.invoke('backup:restore', filename),
})

contextBridge.exposeInMainWorld('logs', {
  getRecent: (): Promise<string[]> => ipcRenderer.invoke('logs:getRecent'),
  onLine: (callback: (line: string) => void): (() => void) => {
    const handler = (_event: unknown, line: string) => callback(line);
    ipcRenderer.on('logs:line', handler);
    return () => ipcRenderer.removeListener('logs:line', handler);
  },
  error: (msg: string) => ipcRenderer.send('logs:error', msg),
})

contextBridge.exposeInMainWorld('health', {
  run: () => ipcRenderer.invoke('health:run'),
})

contextBridge.exposeInMainWorld('appState', {
  setDirty: (dirty: boolean) => ipcRenderer.send('app-state:set-dirty', dirty),
})