import type { Entry, S3Config } from './renderer/lib/types';

export interface CloudSyncAPI {
  initS3Client: () => Promise<void>,
  cloudSyncPipeline: () => Promise<boolean>,
  createConfig: (config: S3Config) => Promise<void>,
  updateConfig: (config: S3Config) => Promise<void>,
  deleteConfig: () => Promise<void>,
  getConfig: () => Promise<S3Config>,
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