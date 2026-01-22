import { parseJournalDate, decodeHtmlEntities } from '../lib/utils';
import type { Entry, DecodedEntry } from '../lib/types';

// memoized entries per renderer session
let __decodedEntriesMemo: DecodedEntry[] | null = null;

function clearDecodedCache() {
  __decodedEntriesMemo = null;
}
                                                                                                                                 
export async function getDecodedEntries(): Promise<DecodedEntry[]> {
  if (__decodedEntriesMemo) return __decodedEntriesMemo;

  const rows = await window.sqlite.getEntries();
  __decodedEntriesMemo = rows.map(entry => ({
    ...entry,
    decodedContent: decodeHtmlEntities(entry.content)
  }));
  return __decodedEntriesMemo;
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
  clearDecodedCache();
  return entry;
}

export async function updateEntry(id: string, updates: Partial<Entry>): Promise<Entry> {
  let entry = await window.sqlite.getEntryById(id);
  if (!entry) throw new Error(`NOT_FOUND: entry with id ${id}`);

  const lastModified = updates.lastModified ?? Date.now();
  entry = { ...entry, ...updates, timestamp: parseJournalDate(updates.date ?? entry.date), lastModified };

  await window.sqlite.updateEntry(id, entry);
  clearDecodedCache();
  return entry;
}

export async function deleteEntry(id: string): Promise<void> {
  await window.sqlite.deleteEntry(id);
  clearDecodedCache();
}

export async function getEntriesBetweenTimestamps(startTs: number, endTs: number): Promise<Entry[]> {
  return await window.sqlite.getEntriesBetweenTimestamps(startTs, endTs);
}

export async function getPasswordHash(): Promise<string | null> {
  return await window.sqlite.getPasswordHash();
}

export async function setPasswordHash(hash: string): Promise<void> {
  await window.sqlite.setPasswordHash(hash);
}
