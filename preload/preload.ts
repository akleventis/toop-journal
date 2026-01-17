const { contextBridge, ipcRenderer } = require('electron')
import { Entry, S3Config } from '../renderer/lib/types';

// cloud sync functions
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
  getEntries: () => ipcRenderer.invoke('sqlite:getEntries'),
  getEntryById: (id: string) => ipcRenderer.invoke('sqlite:getEntryById', id),
  getMostRecentEntry: () => ipcRenderer.invoke('sqlite:getMostRecentEntry'),
  getEntriesBetweenTimestamps: (startTs: number, endTs: number) => ipcRenderer.invoke('sqlite:getEntriesBetweenTimestamps', startTs, endTs),
  createEntry: (entry: Entry) => ipcRenderer.invoke('sqlite:createEntry', entry),
  updateEntry: (id: string, entry: Entry) => ipcRenderer.invoke('sqlite:updateEntry', id, entry),
  deleteEntry: (id: string) => ipcRenderer.invoke('sqlite:deleteEntry', id),
  getPasswordHash: () => ipcRenderer.invoke('sqlite:getPasswordHash'),
  setPasswordHash: (passwordHash: string) => ipcRenderer.invoke('sqlite:setPasswordHash', passwordHash),
})