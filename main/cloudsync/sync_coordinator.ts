import { dbEvents } from '../db/sqlite';
import { updateLocalMasterIndex } from './master_index';
import { cloudSyncPipeline, isSyncConfigured } from './transact';
import { logger } from '../logger';

let syncInFlight = false;
let dirtyDuringSync = false; // at least one event arrived while a sync was running

function triggerSync() {
  if (!isSyncConfigured()) return;

  if (syncInFlight) {
    // mark dirty so runSync schedules a follow-up when the current sync completes
    dirtyDuringSync = true;
    return;
  }

  runSync();
}

async function runSync() {
  syncInFlight = true;
  dirtyDuringSync = false;

  try {
    await cloudSyncPipeline();
  } catch (err) {
    logger.error('sync_coordinator: sync failed:', err);
  } finally {
    syncInFlight = false;
    // if any events arrived during the sync, run one follow-up to capture them
    if (dirtyDuringSync) {
      dirtyDuringSync = false;
      runSync();
    }
  }
}

// await updateLocalMasterIndex before triggerSync — ensures the master index file
// is fully written before the pipeline reads it, preventing a race where the
// pipeline overwrites the update and orphans the entry in the master index
for (const event of ['entry:created', 'entry:updated', 'entry:deleted'] as const) {
  dbEvents.on(event, async (e: { id: string; lastModified: number }) => {
    try {
      await updateLocalMasterIndex(e.id, { lastModified: e.lastModified, deleted: event === 'entry:deleted' });
      triggerSync();
    } catch (err) {
      logger.error(`sync_coordinator: ${event} handler failed:`, err);
    }
  });
}
