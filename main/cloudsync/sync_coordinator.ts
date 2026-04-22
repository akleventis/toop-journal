import { dbEvents } from '../db/sqlite';
import { updateLocalMasterIndex } from './master_index';
import { cloudSyncPipeline, state } from './transact';
import { syncStateMachine, SyncState } from './sync_state';
import { logger } from '../logger';

let pendingSync = false;

function triggerSync() {
  if (!state.AWSClient || !state.AWSConfig) return;

  if (syncStateMachine.getState() === SyncState.READY) {
    cloudSyncPipeline().catch(err =>
      logger.error('sync_coordinator: background sync failed:', err)
    );
  } else {
    // a sync is already in flight — queue one follow-up once it settles
    if (!pendingSync) {
      pendingSync = true;
      const unsub = syncStateMachine.onStateChange((newState) => {
        if (newState === SyncState.READY) {
          unsub();
          pendingSync = false;
          cloudSyncPipeline().catch(err =>
            logger.error('sync_coordinator: follow-up sync failed:', err)
          );
        } else if (newState === SyncState.ERROR || newState === SyncState.OFFLINE || newState === SyncState.DISABLED) {
          // terminal state — unsubscribe to avoid listener leak
          unsub();
          pendingSync = false;
        }
      });
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
