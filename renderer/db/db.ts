import { parseJournalDate } from '../lib/dates';
import type { Entry, DecodedEntry } from '../../shared/types';

// memoized entries per renderer session
let __decodedEntriesMemo: DecodedEntry[] | null = null;

export function clearDecodedCache() {
  __decodedEntriesMemo = null;
}

// auto-clear when the sync pipeline writes remote entries — no manual calls needed
window.sqlite.onEntriesChanged(() => clearDecodedCache());

export function getEntryLimitFromStorage(): number | undefined {
  const stored = localStorage.getItem('entryLimit');
  if (!stored) return undefined;
  const parsed = parseInt(stored, 10);
  return isNaN(parsed) ? undefined : parsed;
}

export async function getDecodedEntries(): Promise<DecodedEntry[]> {
  if (__decodedEntriesMemo) return __decodedEntriesMemo;

  const limit = getEntryLimitFromStorage();
  const rows = await window.sqlite.getEntries(limit);

  __decodedEntriesMemo = rows.map(entry => ({ ...entry, decodedContent: entry.content }));
  return __decodedEntriesMemo;
}

// truncated content (500 chars) — sufficient for list preview, much smaller IPC payload
export async function getEntriesForList(limitOverride?: number): Promise<DecodedEntry[]> {
  const limit = limitOverride ?? getEntryLimitFromStorage();
  const rows = await window.sqlite.getEntriesForList(limit);
  return rows.map(entry => ({ ...entry, decodedContent: entry.content }));
}

// no limit — calendar always needs all entry dates regardless of entryLimit setting
export async function getEntriesForCalendar(): Promise<DecodedEntry[]> {
  const rows = await window.sqlite.getEntriesForList();
  return rows.map(entry => ({ ...entry, decodedContent: entry.content }));
}

export async function getEntryById(id: string): Promise<Entry | null> {
  return await window.sqlite.getEntryById(id);
}

export async function getMostRecentEntry(): Promise<Entry | null> {
  return await window.sqlite.getMostRecentEntry();
}

export async function getEntryCount(): Promise<number> {
  return await window.sqlite.getEntryCount();
}

export function getSearchLimit(): number | undefined {
  const stored = localStorage.getItem('searchLimit');
  if (!stored) return undefined;
  const parsed = parseInt(stored, 10);
  return isNaN(parsed) || parsed <= 0 ? undefined : parsed;
}

export async function searchEntries(query: string, limit?: number): Promise<Entry[]> {
  return await window.sqlite.searchEntries(query, limit ?? getSearchLimit());
}

// timestamp derives from the entry's date so list ordering matches journal date, not creation time
export async function createEntry(entry: Entry): Promise<Entry> {
  entry = { ...entry, timestamp: parseJournalDate(entry.date), lastModified: Date.now() };
  await window.sqlite.createEntry(entry);
  clearDecodedCache();
  return entry;
}

export async function updateEntry(id: string, updates: Partial<Entry>): Promise<Entry> {
  let entry = await window.sqlite.getEntryById(id);
  if (!entry) throw new Error(`NOT_FOUND: entry with id ${id}`);

  const lastModified = updates.lastModified ?? Date.now();
  // re-derive timestamp from date string since date may have changed
  entry = { ...entry, ...updates, timestamp: parseJournalDate(updates.date ?? entry.date), lastModified };

  await window.sqlite.updateEntry(id, entry);
  clearDecodedCache();
  return entry;
}

export async function deleteEntry(id: string): Promise<void> {
  await window.sqlite.deleteEntry(id);
  clearDecodedCache();
}

export async function getAdjacentEntry(id: string, direction: 'prev' | 'next'): Promise<Entry | null> {
  return await window.sqlite.getAdjacentEntry(id, direction);
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
