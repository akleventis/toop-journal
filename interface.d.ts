import type { Entry, S3Config, SyncState, HealthCheck, BackupInfo } from './shared/types';

export interface CloudSyncAPI {
  initS3Client: () => Promise<void>,
  cloudSyncPipeline: () => Promise<void>,
  createConfig: (config: S3Config) => Promise<S3Config>,
  updateConfig: (config: S3Config) => Promise<S3Config>,
  deleteConfig: () => Promise<void>,
  disableSync: () => Promise<void>,
  getConfig: () => Promise<S3Config | null>,
}

export interface SQLiteAPI {
  getEntries: (limit?: number) => Promise<Entry[]>,
  getEntriesForList: (limit?: number) => Promise<Entry[]>,
  getAdjacentEntry: (id: string, direction: 'prev' | 'next') => Promise<{ id: string } | null>,
  getEntryById: (id: string) => Promise<Entry | null>,
  getMostRecentEntry: () => Promise<Entry | null>,
  getEntryCount: () => Promise<number>,
  searchEntries: (query: string, limit?: number) => Promise<Entry[]>,
  getEntriesBetweenTimestamps: (startTs: number, endTs: number) => Promise<Entry[]>,
  createEntry: (entry: Entry) => Promise<void>,
  updateEntry: (id: string, entry: Entry) => Promise<void>,
  deleteEntry: (id: string) => Promise<void>,
  getPasswordHash: () => Promise<string | null>,
  setPasswordHash: (passwordHash: string) => Promise<void>,
  getPasswordSalt: () => Promise<string | null>,
  setPasswordSalt: (passwordSalt: string) => Promise<void>,
  clearPasswordCredentials: () => Promise<void>,
  getSetting: (key: string) => Promise<string | null>,
  setSetting: (key: string, value: string) => Promise<void>,
  onEntriesChanged: (callback: () => void) => () => void,
}

export interface SecurityAPI {
  hashPassword: (password: string) => Promise<{ hash: string; salt: string }>,
  verifyPassword: (password: string, hash: string, salt: string) => Promise<boolean>,
}

export interface NetworkAPI {
  onStatusChange: (callback: (online: boolean) => void) => void;
  isOnline: () => boolean;
}

export interface SyncStateAPI {
  getState: () => Promise<SyncState>;
  onStateChange: (callback: (state: SyncState) => void) => () => void;
}

export interface DialogAPI {
  showError: (message: string) => Promise<void>;
}

export interface BackupAPI {
  list: () => Promise<BackupInfo[]>;
  restore: (filename: string) => Promise<void>;
}

export interface LogsAPI {
  getRecent: () => Promise<string[]>;
  onLine: (callback: (line: string) => void) => () => void;
  error: (msg: string) => void;
}

export interface HealthAPI {
  run: () => Promise<HealthCheck>;
}

export interface AppStateAPI {
  setDirty: (dirty: boolean) => void;
  onQuitting: (callback: () => void) => () => void;
}

export interface MaintenanceAPI {
  onStatus: (callback: (running: boolean) => void) => () => void;
}

export interface UtilsAPI {
  saveToDownloads: (filename: string, content: string, encoding: 'utf8' | 'base64') => Promise<{ path: string }>;
  revealInFinder: (path: string) => Promise<void>;
  compressImage: (content: string, ext: string) => Promise<{ dataUrl: string }>;
}

declare global {
  interface Window {
    cloudSync: CloudSyncAPI
    sqlite: SQLiteAPI
    network: NetworkAPI
    security: SecurityAPI
    syncState: SyncStateAPI
    dialog: DialogAPI
    backup: BackupAPI
    logs: LogsAPI
    health: HealthAPI
    appState: AppStateAPI
    maintenance: MaintenanceAPI
    utils: UtilsAPI
  }
}