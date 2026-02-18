import type { Entry, S3Config, Conflict, SyncState } from './renderer/lib/types';

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
  getEntriesBetweenTimestamps: (startTs: number, endTs: number) => Promise<Entry[]>,
  createEntry: (entry: Entry) => Promise<void>,
  updateEntry: (id: string, entry: Entry) => Promise<void>,
  deleteEntry: (id: string) => Promise<void>,
  getPasswordHash: () => Promise<string | null>,
  setPasswordHash: (passwordHash: string) => Promise<void>,
  getPasswordSalt: () => Promise<string | null>,
  setPasswordSalt: (passwordSalt: string) => Promise<void>,
  clearPasswordCredentials: () => Promise<void>,
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

declare global {
  interface Window {
    cloudSync: CloudSyncAPI
    sqlite: SQLiteAPI
    network: NetworkAPI
    security: SecurityAPI
    conflicts: ConflictsAPI
    syncState: SyncStateAPI
  }
}