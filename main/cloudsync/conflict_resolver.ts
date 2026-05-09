import * as db from '../db/sqlite';
import { cloudSyncPipeline, isSyncConfigured } from './transact';
import { updateLocalMasterIndex } from './master_index';
import { logger } from '../logger';

// resolves a conflict by applying the chosen version, deleting the conflict record, and syncing
export async function resolveConflict(entryId: string, version: 'local' | 'remote'): Promise<void> {
  const conflict = db.getConflictByEntryId(entryId);
  if (!conflict) {
    throw new Error(`Conflict not found for entry ${entryId}`);
  }

  if (version === 'remote') {
    const entry = db.getEntryById(entryId);
    if (!entry) throw new Error(`resolveConflict: local entry ${entryId} not found`);
    entry.content = conflict.remoteVersion;
    entry.lastModified = conflict.remoteModified;
    db.updateEntry(entryId, entry, false);
    // stamp local masterIndex with remote timestamp so follow-up sync uploads remote content as truth
    await updateLocalMasterIndex(entryId, { lastModified: conflict.remoteModified, deleted: false });
  } else {
    // local DB content is already correct; bump masterIndex timestamp above remote's so the
    // follow-up sync uploads local content to S3 and overwrites any stale remote copy
    await updateLocalMasterIndex(entryId, { lastModified: Date.now(), deleted: false });
  }

  db.deleteConflict(entryId);

  if (isSyncConfigured()) {
    try {
      await cloudSyncPipeline();
    } catch (error) {
      logger.error('resolveConflict: error syncing after resolution:', error);
    }
  }
}
