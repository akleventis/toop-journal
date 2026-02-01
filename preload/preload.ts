const { contextBridge, ipcRenderer } = require('electron')
import { Entry, S3Config } from '../renderer/lib/types';

// Used to bridge the gap between the main and renderer processes.

contextBridge.exposeInMainWorld('network', {
  onStatusChange: (callback: (online: boolean) => void) => {
    window.addEventListener('online', () => callback(true));
    window.addEventListener('offline', () => callback(false));
  },
  isOnline: () => navigator.onLine
})

contextBridge.exposeInMainWorld('cloudSync', {
  initS3Client: (forceRefresh: boolean = false) => ipcRenderer.invoke('cloud-sync:initS3Client', forceRefresh),
  cloudSyncPipeline: (): Promise<boolean> => ipcRenderer.invoke('cloud-sync:cloudSyncPipeline'),
  createConfig: (config: S3Config) => ipcRenderer.invoke('cloud-sync:createConfig', config),
  updateConfig: (config: S3Config) => ipcRenderer.invoke('cloud-sync:updateConfig', config),
  deleteConfig: () => ipcRenderer.invoke('cloud-sync:deleteConfig'),
  getConfig: () => ipcRenderer.invoke('cloud-sync:getConfig'),
  putEntryCloudSync: (entry: Entry) => ipcRenderer.invoke('cloud-sync:putEntryCloudSync', entry),
  deleteEntryCloudSync: (id: string) => ipcRenderer.invoke('cloud-sync:deleteEntryCloudSync', id),
})

contextBridge.exposeInMainWorld('sqlite', {
  getEntries: (limit?: number) => ipcRenderer.invoke('sqlite:getEntries', limit),
  getEntryById: (id: string) => ipcRenderer.invoke('sqlite:getEntryById', id),
  getMostRecentEntry: () => ipcRenderer.invoke('sqlite:getMostRecentEntry'),
  getEntriesBetweenTimestamps: (startTs: number, endTs: number) => ipcRenderer.invoke('sqlite:getEntriesBetweenTimestamps', startTs, endTs),
  createEntry: (entry: Entry) => ipcRenderer.invoke('sqlite:createEntry', entry),
  updateEntry: (id: string, entry: Entry) => ipcRenderer.invoke('sqlite:updateEntry', id, entry),
  deleteEntry: (id: string) => ipcRenderer.invoke('sqlite:deleteEntry', id),
  getPasswordHash: () => ipcRenderer.invoke('sqlite:getPasswordHash'),
  setPasswordHash: (passwordHash: string) => ipcRenderer.invoke('sqlite:setPasswordHash', passwordHash),
  getPasswordSalt: () => ipcRenderer.invoke('sqlite:getPasswordSalt'),
  setPasswordSalt: (passwordSalt: string) => ipcRenderer.invoke('sqlite:setPasswordSalt', passwordSalt),
  clearPasswordCredentials: () => ipcRenderer.invoke('sqlite:clearPasswordCredentials'),
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