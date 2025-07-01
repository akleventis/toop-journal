const { contextBridge, ipcRenderer } = require('electron')
import { Entry } from '../renderer/lib/types';

// cloud sync functions
contextBridge.exposeInMainWorld('network', {
  onStatusChange: (callback: (online: boolean) => void) => {
    window.addEventListener('online', () => callback(true));
    window.addEventListener('offline', () => callback(false));
  },
  isOnline: () => navigator.onLine
})

contextBridge.exposeInMainWorld('cloudSync', {
  initS3Client: (forceRefresh: boolean = false, isDev: boolean = false) => ipcRenderer.invoke('cloud-sync:initS3Client', forceRefresh, isDev),
  putEntryCloudSync: (entry: Entry) => ipcRenderer.invoke('cloud-sync:putEntryCloudSync', entry),
  deleteEntryCloudSync: (id: string) => ipcRenderer.invoke('cloud-sync:deleteEntryCloudSync', id)
})

// no-op: do not import renderer code in preload when sandboxed