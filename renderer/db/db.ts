import { parseJournalDate } from '../lib/utils';
import type { Entry } from '../lib/types';

// memoized entries per renderer session
let __entriesMemo: Entry[] | null = null;

export async function getEntries(): Promise<Entry[]> {
  if (__entriesMemo) return __entriesMemo;

  const rows = await window.sqlite.getEntries();
  __entriesMemo = rows;
  return rows;
}

export async function getEntryById(id: string): Promise<Entry | null> {
  return await window.sqlite.getEntryById(id);
}

export async function getMostRecentEntry(): Promise<Entry | null> {
  return await window.sqlite.getMostRecentEntry();
}

export async function createEntry(entry: Entry): Promise<Entry> {
  const timestamp = parseJournalDate(entry.date);
  const now = Date.now();
  entry = { ...entry, timestamp, lastModified: now };
  await window.sqlite.createEntry(entry);

  if (__entriesMemo) {
    __entriesMemo = [entry, ...__entriesMemo].sort((a, b) => b.timestamp - a.timestamp);
  }

  return entry;
}

export async function updateEntry(id: string, updates: Partial<Entry>): Promise<Entry> {
  let entry = await window.sqlite.getEntryById(id);
  if (!entry) throw new Error(`NOT_FOUND: entry with id ${id}`);

  const lastModified = updates.lastModified ?? Date.now();
  entry = { ...entry, ...updates, timestamp: parseJournalDate(updates.date ?? entry.date), lastModified };

  await window.sqlite.updateEntry(id, entry);

  if (__entriesMemo) {
    __entriesMemo = __entriesMemo.map(e => e.id === id ? entry : e).sort((a, b) => b.timestamp - a.timestamp);
  }
  
  return entry;
}

export async function deleteEntry(id: string): Promise<void> {
  await window.sqlite.deleteEntry(id);

  if (__entriesMemo) {
    __entriesMemo = __entriesMemo.filter(e => e.id !== id).sort((a, b) => b.timestamp - a.timestamp);
  }
}

export async function getEntriesBetweenTimestamps(startTs: number, endTs: number): Promise<Entry[]> {
  const all = await window.sqlite.getEntriesBetweenTimestamps(startTs, endTs);
  return all.sort((a, b) => b.timestamp - a.timestamp);
}

// Password functions
export async function getPasswordHash(): Promise<string | null> {
  return await window.sqlite.getPasswordHash();
}

export async function setPasswordHash(hash: string): Promise<void> {
  await window.sqlite.setPasswordHash(hash);
}
