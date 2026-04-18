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
  id: string;
  date: string;
  content: string;
  location?: string;
  timestamp?: number;
  lastModified?: number;
};

export type MasterIndex = Record<string, MasterIndexEntry>;

export type MasterIndexEntry = {
  lastModified: number;
  deleted: boolean;
};

export type Conflict = {
  entryId: string;
  entryDate: string;
  localVersion: string;
  remoteVersion: string;
  localModified: number;
  remoteModified: number;
};

export interface DecodedEntry extends Entry {
  decodedContent: string;
}
