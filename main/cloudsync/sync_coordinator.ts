import { dbEvents } from '../db/sqlite';
import { updateLocalMasterIndex } from './master_index';
import { cloudSyncPipeline, state } from './transact';
import { logger } from '../logger';

let syncInFlight = false;
let dirtyDuringSync = false; // at least one event arrived while a sync was running

function triggerSync() {
  if (!state.AWSClient || !state.AWSConfig) return;

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
dbEvents.on('entry:created', async (event: { id: string; lastModified: number }) => {
  try {
    await updateLocalMasterIndex(event.id, { lastModified: event.lastModified, deleted: false });
    triggerSync();
  } catch (err) {
    logger.error('sync_coordinator: entry:created handler failed:', err);
  }
});

dbEvents.on('entry:updated', async (event: { id: string; lastModified: number }) => {
  try {
    await updateLocalMasterIndex(event.id, { lastModified: event.lastModified, deleted: false });
    triggerSync();
  } catch (err) {
    logger.error('sync_coordinator: entry:updated handler failed:', err);
  }
});

dbEvents.on('entry:deleted', async (event: { id: string; lastModified: number }) => {
  try {
    await updateLocalMasterIndex(event.id, { lastModified: event.lastModified, deleted: true });
    triggerSync();
  } catch (err) {
    logger.error('sync_coordinator: entry:deleted handler failed:', err);
  }
});
