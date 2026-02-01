import { parseJournalDate, decodeHtmlEntities } from '../lib/utils';
import type { Entry, DecodedEntry } from '../lib/types';

// memoized entries per renderer session
let __decodedEntriesMemo: DecodedEntry[] | null = null;

export function clearDecodedCache() {
  __decodedEntriesMemo = null;
}

function getEntryLimitFromStorage(): number | undefined {
  const stored = localStorage.getItem('entryLimit');
  if (!stored) return undefined;
  const parsed = parseInt(stored, 10);
  return isNaN(parsed) ? undefined : parsed;
}

export async function getDecodedEntries(): Promise<DecodedEntry[]> {
  if (__decodedEntriesMemo) return __decodedEntriesMemo;

  const limit = getEntryLimitFromStorage();
  const rows = await window.sqlite.getEntries(limit);

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
  const now = Date.now();
  entry = { ...entry, timestamp: now, lastModified: now };
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

export async function getPasswordSalt(): Promise<string | null> {
  return await window.sqlite.getPasswordSalt();
}

export async function setPasswordSalt(salt: string): Promise<void> {
  await window.sqlite.setPasswordSalt(salt);
}

export async function clearPasswordCredentials(): Promise<void> {
  await window.sqlite.clearPasswordCredentials();
}
