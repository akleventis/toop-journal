import * as db from '../db/sqlite';
import { cloudSyncPipeline, state } from './transact';
import { logger } from '../logger';

// resolves a conflict by applying the chosen version, deleting the conflict record, and syncing
export async function resolveConflict(entryId: string, version: 'local' | 'remote'): Promise<void> {
  const conflict = db.getConflictByEntryId(entryId);
  if (!conflict) {
    throw new Error(`Conflict not found for entry ${entryId}`);
  }

  if (version === 'remote') {
    const entry = db.getEntryById(entryId);
    if (entry) {
      entry.content = conflict.remoteVersion;
      entry.lastModified = conflict.remoteModified;
      db.updateEntryFromRemote(entryId, entry);
    }
  }
  // if version === 'local', local entry is already correct — just delete the record

  db.deleteConflict(entryId);

  if (state.AWSClient && state.AWSConfig) {
    try {
      await cloudSyncPipeline();
    } catch (error) {
      logger.error('resolveConflict: error syncing after resolution:', error);
    }
  }
}
