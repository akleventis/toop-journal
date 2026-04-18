import { Entry } from './types';

export type SyncResult = {
  created: number;
  updated: number;
  deleted: number;
  conflicts: number;
};

// Contract for any journal client (Electron, web, CLI).
// Electron implements this via IPC + SQLite; a web client would implement
// it against S3 directly or via an API Gateway + Lambda layer.
export interface JournalAPI {
  listEntries(limit?: number): Promise<Entry[]>;
  getEntry(id: string): Promise<Entry | null>;
  createEntry(entry: Entry): Promise<void>;
  updateEntry(id: string, entry: Partial<Entry>): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  sync(): Promise<SyncResult>;
}
