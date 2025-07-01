import { openDB, IDBPDatabase } from 'idb';
import { parseJournalDate } from '../lib/utils';
import type { Entry } from '../lib/types';

let idb: IDBPDatabase;

// global state to check if IDB is initialized
var isInitialized = false;

export async function initIDB() {
  if (isInitialized) return
  idb = await openDB('journalDB', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('entries')) {
        const store = db.createObjectStore('entries', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      }
    }
  });
  isInitialized = true
}

// memoized entries per renderer session
let __entriesMemo: Entry[] | null = null;

export async function idbGetEntries(): Promise<Entry[]> {
  if (!idb) await initIDB();

  if (__entriesMemo) return __entriesMemo;
  
  const rows = await idb.getAllFromIndex('entries', 'timestamp'); // index scan
  __entriesMemo = rows;
  return rows;
}

export async function idbGetEntryById(id: string): Promise<Entry | null> {
  if (!idb) await initIDB();
  return await idb.get('entries', id);
}

export async function idbGetMostRecentEntry(): Promise<Entry | null> {
  if (!idb) await initIDB();
  const tx = idb.transaction('entries', 'readonly');
  const index = tx.store.index('timestamp');
  const cursor = await index.openCursor(null, 'prev'); // highest timestamp first
  return cursor?.value ?? null;
}

export async function idbCreateEntry(entry: Entry): Promise<Entry> {
  if (!idb) await initIDB();
  const timestamp = parseJournalDate(entry.date);
  const now = Date.now();
  entry = { ...entry, timestamp, lastModified: now };
  await idb.put('entries', entry);

  if (__entriesMemo) {
    __entriesMemo = [entry, ...__entriesMemo].sort((a, b) => b.timestamp - a.timestamp);
  }

  window.cloudSync.putEntryCloudSync(entry);
  return entry;
}

export async function idbUpdateEntry(id: string, updates: Partial<Entry>): Promise<Entry> {
  if (!idb) await initIDB();
  let entry = await idb.get('entries', id);
  if (!entry) throw new Error(`NOT_FOUND: entry with id ${id}`);

  const lastModified = updates.lastModified ?? Date.now();
  entry = { ...entry, ...updates, timestamp: parseJournalDate(updates.date ?? entry.date), lastModified };

  await idb.put('entries', entry);

  if (__entriesMemo) {
    __entriesMemo = __entriesMemo.map(e => e.id === id ? entry : e).sort((a, b) => b.timestamp - a.timestamp);
  }

  // lastModified only provided on sync (check logic)
  if (!updates.lastModified) {
    window.cloudSync.putEntryCloudSync(entry);
  }

  return entry;
}

export async function idbDeleteEntry(id: string): Promise<void> {
  if (!idb) await initIDB();
  await idb.delete('entries', id);

  if (__entriesMemo) {
    console.log("__entriesMemo", __entriesMemo.length);
    __entriesMemo = __entriesMemo.filter(e => e.id !== id).sort((a, b) => b.timestamp - a.timestamp);
    console.log("__entriesMemo", __entriesMemo.length);
  }

  window.cloudSync.deleteEntryCloudSync(id);
}

export async function idbGetEntriesBetweenTimestamps(startTs: number, endTs: number): Promise<Entry[]> {
  if (!idb) await initIDB();
  const all = await idb.getAll('entries');
  return all.filter(e => e.timestamp >= startTs && e.timestamp <= endTs).sort((a, b) => b.timestamp - a.timestamp);
}

// Password functions
export async function idbGetPasswordHash(): Promise<string | null> {
  if (!idb) await initIDB();
  const settings = await idb.get('entries', 'password');
  return settings?.hash || null;
}

export async function idbSetPasswordHash(hash: string): Promise<void> {
  if (!idb) await initIDB();
  await idb.put('entries', { id: 'password', hash });
}

// Backfill function for existing data
// export async function idbBackfillLastModified(): Promise<void> {
//   if (!idb) {
//     await initIDB();
//   }
//   const allEntries = await idb.getAll('entries');
//   const now = Date.now();
  
//   for (const entry of allEntries) {
//     if (!entry.lastModified) {
//       await idb.put('entries', { ...entry, lastModified: now });
//     }
//   }
// }
