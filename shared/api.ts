import { Entry } from './types';

// counts returned by the sync pipeline after a completed sync
export type SyncResult = {
  created: number;
  updated: number;
  deleted: number;
  conflicts: number;
};

// abstract contract for any journal client implementation
export interface JournalAPI {
  listEntries(limit?: number): Promise<Entry[]>;
  getEntry(id: string): Promise<Entry | null>;
  createEntry(entry: Entry): Promise<void>;
  updateEntry(id: string, entry: Partial<Entry>): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  sync(): Promise<SyncResult>;
}
