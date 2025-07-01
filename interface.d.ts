import type { Entry } from './renderer/lib/types';

export interface CloudSyncAPI {
  initS3Client: (isDev?: boolean) => Promise<void>,
  putEntryCloudSync: (entry: Entry) => Promise<void>,
  deleteEntryCloudSync: (id: string) => Promise<void>,
}

export interface NetworkAPI {
  onStatusChange: (callback: (online: boolean) => void) => void;
  isOnline: () => boolean;
}

declare global {
  interface Window {
    cloudSync: CloudSyncAPI
    network: NetworkAPI
  }
}