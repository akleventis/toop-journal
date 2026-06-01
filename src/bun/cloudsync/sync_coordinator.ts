import { dbEvents } from "../db.js";
import { updateLocalMasterIndex } from "./master_index.js";
import { cloudSyncPipeline, isSyncConfigured } from "./transact.js";
import { logger } from "../logger.js";

// event listeners for DB writes; await master index update before triggering sync to prevent
// a race where the pipeline reads a stale index and orphans the entry
for (const event of ["entry:created", "entry:updated", "entry:deleted"] as const) {
  dbEvents.on(event, async (e: { id: string; lastModified: number }) => {
    try {
      await updateLocalMasterIndex(e.id, { lastModified: e.lastModified, deleted: event === "entry:deleted" });
      triggerSync();
    } catch (err) {
      logger.error(`sync_coordinator: ${event} handler failed:`, err);
    }
  });
}

let syncInFlight = false;
let dirtyDuringSync = false; // at least one event arrived while a sync was running
let currentSyncPromise: Promise<void> | null = null;

export function isSyncInFlight(): boolean { return syncInFlight; }
// Resolves when the current in-flight sync finishes, or immediately if none.
export function awaitCurrentSync(): Promise<void> {
  return currentSyncPromise ?? Promise.resolve();
}

function triggerSync() {
  if (!isSyncConfigured()) return;
  if (syncInFlight) { dirtyDuringSync = true; return; }
  runSync();
}

async function runSync() {
  syncInFlight = true;
  dirtyDuringSync = false;
  currentSyncPromise = (async () => {
    try {
      await cloudSyncPipeline();
    } catch (err) {
      logger.error("sync_coordinator: sync failed:", err);
    }
  })();
  await currentSyncPromise;
  syncInFlight = false;
  currentSyncPromise = null;
  if (dirtyDuringSync) { dirtyDuringSync = false; runSync(); }
}


