import type { Entry, S3Config, Conflict, SyncState, HealthCheck } from './shared/types';

export interface CloudSyncAPI {
  initS3Client: () => Promise<void>,
  cloudSyncPipeline: () => Promise<boolean>,
  createConfig: (config: S3Config) => Promise<void>,
  updateConfig: (config: S3Config) => Promise<void>,
  deleteConfig: () => Promise<void>,
  disableSync: () => Promise<void>,
  getConfig: () => Promise<S3Config>,
}

export interface SQLiteAPI {
  getEntries: (limit?: number) => Promise<Entry[]>,
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
  batchUpdateContent: (updates: { id: string; content: string }[]) => Promise<void>,
  isFtsReady: () => Promise<boolean>,
  onFtsReady: (callback: () => void) => void,
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

export interface ConflictsAPI {
  getConflicts: () => Promise<Conflict[]>;
  getConflictCount: () => Promise<number>;
  getConflictByEntryId: (entryId: string) => Promise<Conflict | null>;
  resolveConflict: (entryId: string, version: 'local' | 'remote') => Promise<void>;
}

export interface SyncStateAPI {
  getState: () => Promise<SyncState>;
  onStateChange: (callback: (state: SyncState) => void) => void;
}

export interface DialogAPI {
  showError: (message: string) => Promise<void>;
}

export interface BackupInfo {
  filename: string;
  date: string;
  sizeBytes: number;
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

declare global {
  interface Window {
    cloudSync: CloudSyncAPI
    sqlite: SQLiteAPI
    network: NetworkAPI
    security: SecurityAPI
    conflicts: ConflictsAPI
    syncState: SyncStateAPI
    dialog: DialogAPI
    backup: BackupAPI
    logs: LogsAPI
    health: HealthAPI
  }
}