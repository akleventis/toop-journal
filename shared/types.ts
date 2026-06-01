export enum SyncState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  SYNCING = 'syncing',
  ERROR = 'error',
  OFFLINE = 'offline',
  DISABLED = 'disabled',
}

export type S3Config = {
  aws_access: string;
  aws_secret: string;
  aws_bucket: string;
  aws_region: string;
};

export type Entry = {
  id: string;           // format: "jun.14.2025"
  date: string;         // format: "Jun 14, 2025 at 12:35"
  content: string;      // HTML — Quill editor native format
  location?: string;
  timestamp?: number;   // ms
  lastModified?: number; // ms
};

// keyed by entry id — tracks every entry's sync state across devices
export type MasterIndex = Record<string, MasterIndexEntry>;

export type MasterIndexEntry = {
  lastModified: number;
  deleted: boolean;
};

export type SyncAction =
  | { action: 'download';      id: string }
  | { action: 'upload';        id: string }
  | { action: 'delete-remote'; id: string }
  | { action: 'delete-local';  id: string }
  | { action: 'skip';          id: string }

export type BackupInfo = {
  filename: string;
  date: string;
  sizeBytes: number;
};

export type HealthCheck = {
  databaseIntegrity: boolean;
  masterIndexIntegrity: boolean;
  s3Connectivity: boolean | null; // null = not configured
  diskSpace: number; // free bytes, -1 if check failed
  lastSyncTime: number; // ms timestamp, 0 if never synced this session
};
