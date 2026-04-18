import { MasterIndex, Entry, MasterIndexEntry } from '../../shared/types';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { state } from './transact';
import * as db from '../db/sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { logger } from '../logger';

/**
 * Ensures the master index file exists in the user data directory.
 * Creates an empty master index file if it doesn't exist.
 * Called upon app startup.
 *
 * @returns {Promise<void>}
 */
export const initLocalMasterIndex = async (): Promise<void> => {
  const masterIndexPath = path.join(state.UserDataPath, state.MasterIndexFileName);

  if (!fs.existsSync(masterIndexPath)) {
    logger.debug('initLocalMasterIndex: creating new master index file at', masterIndexPath);
    fs.writeFileSync(masterIndexPath, '{}');
  }
};

/**
 * Initializes the master index file in S3.
 *
 * @returns {Promise<void>}
 */
export const initS3MasterIndex = async (): Promise<void> => {
  if (!state.AWSClient || !state.AWSConfig) {
    throw new Error('initS3MasterIndex: no s3 client or config found');
  }
  // first check if master index file exists in s3
  let exists = false;
  try {
    await state.AWSClient.send(new GetObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: state.MasterIndexFileName }));
    exists = true;
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      logger.debug('initS3MasterIndex: s3 master index file does not exist, creating it');
    } else {
      logger.error('initS3MasterIndex: failed to check if s3 master index file exists');
      throw error;
    }
  }

  // if it doesn't exist, create it
  if (!exists) {
    try {
      await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: state.MasterIndexFileName, Body: '{}' }));
    } catch (error) {
      logger.error('initS3MasterIndex: failed to create s3 master index');
      throw error;
    }
  }
};

/**
 * Loads the master index from the local filesystem and returns it as a `MasterIndex` object.
 *
 * @returns {Promise<MasterIndex>} The master index.
 * @throws Will throw an error if the local filesystem is not found, or if the master index is not found.
 */
export const loadLocalMasterIndex = async (): Promise<MasterIndex> => {
  const masterIndexPath = path.join(state.UserDataPath, state.MasterIndexFileName);
  if (!fs.existsSync(masterIndexPath)) {
    throw new Error('loadLocalMasterIndex: local master index file does not exist');
  }
  var raw: string;
  var parsed: MasterIndex;
  try {
    raw = fs.readFileSync(masterIndexPath, 'utf-8');
    parsed = JSON.parse(raw) as MasterIndex;
  } catch (error) {
    logger.error('loadLocalMasterIndex: failed to load local master index');
    throw error;
  }
  // error bubbles up to caller
  return verifyMasterIndex(parsed);
};

/**
 * Loads the master index from S3 and returns it as a `MasterIndex` object.
 *
 * @returns {Promise<MasterIndex>} The master index.
 * @throws Will throw an error if the S3 client or config is not found, or if the master index is not found.
 */
export const loadS3MasterIndex = async (): Promise<MasterIndex> => {
  logger.debug('loading s3 master index');
  if (!state.AWSConfig || !state.AWSClient) {
    throw new Error('loadS3MasterIndex: no s3 client or config found');
  }
  var parsed: MasterIndex;
  try {
    const response = await state.AWSClient.send(
      new GetObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: state.MasterIndexFileName })
    );
    const body = await response.Body?.transformToByteArray();
    const bodyString = body ? new TextDecoder().decode(body) : '{}';

    parsed = JSON.parse(bodyString) as MasterIndex;
  } catch (error) {
    logger.error('loadS3MasterIndex: failed to load s3 master index');
    throw error;
  }
  // error bubbles up to caller
  return verifyMasterIndex(parsed);
};


/**
 * Verifies the master index and returns a valid `MasterIndex` object or an empty object if the input is invalid.
 *
 * @param {MasterIndex} masterIndex - The master index to verify.
 * @returns {MasterIndex} The verified master index.
 * @throws Will throw an error if the master index is not a valid object.
 */
const verifyMasterIndex = (masterIndex: MasterIndex): MasterIndex => {
  if (typeof masterIndex !== 'object' || masterIndex === null) {
    throw new Error('verifyMasterIndex: masterIndex is not a valid object');
  }

  const validated: MasterIndex = {};
  for (const [key, value] of Object.entries(masterIndex)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { lastModified: number }).lastModified === 'number' &&
      typeof (value as { deleted: boolean }).deleted === 'boolean'
    ) {
      validated[key] = value as { lastModified: number; deleted: boolean };
    } else {
      throw new Error('verifyMasterIndex: masterIndex is not a valid object');
    }
  }
  return validated;
};

/**
 * Syncs the master index between local <-> S3 and updates entries in corresponding datastore
 *
 * @param {MasterIndex} localMasterIndex - The local master index.
 * @param {MasterIndex} s3MasterIndex - The S3 master index.
 * @returns {Promise<MasterIndex>} The synced master index.
 * @throws Will throw an error if the S3 client or config is not found.
 */
export const syncMasterIndex = async (localMasterIndex: MasterIndex, s3MasterIndex: MasterIndex): Promise<MasterIndex> => {
  if (!state.AWSClient) {
    throw new Error('syncMasterIndex: no s3 client found');
  }

  if (!state.AWSConfig) {
    throw new Error('syncMasterIndex: no aws config found');
  }

  const syncedIndex: MasterIndex = {};

  const ids = new Set([...Object.keys(localMasterIndex), ...Object.keys(s3MasterIndex)])
  const total = ids.size;
  logger.info(`syncMasterIndex: local=${Object.keys(localMasterIndex).length} entries, S3=${Object.keys(s3MasterIndex).length} entries, total=${total} to reconcile`);

  let processed = 0;
  let downloaded = 0;
  let uploaded = 0;
  let conflicts = 0;

  for (const id of ids) {
    const localIndex = localMasterIndex[id]
    const s3Index = s3MasterIndex[id]

    syncedIndex[id] = localIndex ?? s3Index;

    // local entry does not exist, create it
    if (!localIndex) {
      // if entry already exists in local database, continue
      let localEntryExists = false;
      try {
        if (db.getEntryById(id) !== null) {
          localEntryExists = true;
        }
      } catch (error) {
        logger.error(`syncMasterIndex: error fetching local entry ${id}:`, error);
        throw error;
      }

      if (!localEntryExists) {
        try {
          const response = await state.AWSClient.send(new GetObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
          const body = await response.Body?.transformToByteArray();
          const bodyString = body ? new TextDecoder().decode(body) : '{}';
          const entry = JSON.parse(bodyString) as Entry;
          if (!entry) {
            throw new Error(`syncMasterIndex: error fetching s3 entry ${id}`);
          }
          db.createEntry(entry, true); // skipSync to avoid recursive loop
          syncedIndex[id] = s3Index;
          downloaded++;
        } catch (error: any) {
          if (error.name === 'NoSuchKey') {
            // Entry in masterIndex but missing from S3 — orphaned reference, drop it from the index
            logger.warn(`syncMasterIndex: entry ${id} in masterIndex but missing from S3, removing from index`);
            delete syncedIndex[id];
          } else {
            logger.error(`syncMasterIndex: error creating local entry ${id}:`);
            throw error;
          }
        }
      }
    }

    // s3 index does not exist, create it
    else if (!s3Index) {
      // if entry already exists in s3, continue
      let s3EntryExists = false;
      try {
        await state.AWSClient.send(new GetObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
        s3EntryExists = true;
      } catch (error: any) {
        if (error.name !== 'NoSuchKey') {
          logger.error(`syncMasterIndex: error fetching s3 entry ${id}:`, error);
          throw error;
        }
      }

      if (!s3EntryExists) {
        try {
          // fetch entry from local database and create s3 entry
          const entry = db.getEntryById(id);
          if (!entry) {
            throw new Error(`syncMasterIndex: error fetching local entry ${id}`);
          }
          await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json`, Body: JSON.stringify(entry) }));
          syncedIndex[id] = localIndex;
          uploaded++;
        } catch (error) {
          logger.error(`syncMasterIndex: error creating s3 entry ${id}:`);
          throw error;
        }
      }
    }

    // local index is newer, update s3 bucket entry
    else if (localIndex.lastModified > s3Index.lastModified) {
      if (localIndex.deleted) { // local entry is deleted, delete s3 entry and continue
        try {
          await state.AWSClient.send(new DeleteObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
          syncedIndex[id] = localIndex;
        } catch (error) {
          logger.error(`syncMasterIndex: error deleting s3 entry ${id}:`);
          throw error;
        }
      } else {
        // local entry is not deleted, update s3 entry
        let entry: Entry | null;
        try {
          entry = db.getEntryById(id);
          if (!entry) throw new Error(`syncMasterIndex: error fetching local entry ${id}`);
        } catch (error) {
          logger.error(`syncMasterIndex: error fetching local entry ${id}:`);
          throw error;
        }
        try {
          await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json`, Body: JSON.stringify(entry) }));
          syncedIndex[id] = localIndex;
          uploaded++;
        } catch (error) {
          logger.error(`syncMasterIndex: error updating s3 entry ${id}:`);
          throw error;
        }
      }
    }

    // CONFLICT DETECTION: both modified, check if content differs
    else if (localIndex.lastModified !== s3Index.lastModified && !localIndex.deleted && !s3Index.deleted) {
      // Fetch both versions to compare content
      const localEntry = db.getEntryById(id);
      let s3Entry: Entry;
      try {
        const response = await state.AWSClient.send(new GetObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
        const body = await response.Body?.transformToByteArray();
        const bodyString = body ? new TextDecoder().decode(body) : '{}';
        s3Entry = JSON.parse(bodyString) as Entry;
      } catch (error) {
        logger.error(`syncMasterIndex: error fetching s3 entry for conflict detection ${id}:`, error);
        throw error;
      }

      // If content differs, create conflict and skip sync
      if (localEntry && s3Entry && localEntry.content !== s3Entry.content) {
        logger.warn(`syncMasterIndex: conflict detected for entry ${id}`);
        db.createConflict({
          entryId: id,
          entryDate: localEntry.date,
          localVersion: localEntry.content,
          remoteVersion: s3Entry.content,
          localModified: localIndex.lastModified,
          remoteModified: s3Index.lastModified
        });
        // Keep local index (don't sync until resolved)
        syncedIndex[id] = localIndex;
        conflicts++;
      }
    }

    // s3 index is newer, update local entry
    else if (localIndex.lastModified < s3Index.lastModified) {
      if (s3Index.deleted) { // s3 index is deleted, delete local entry and continue
        try {
          db.deleteEntry(id, true); // skipSync to avoid recursive loop
          syncedIndex[id] = s3Index;
        } catch (error) {
          logger.error(`syncMasterIndex: error deleting local entry ${id}:`, error);
          throw error;
        }
      } else {
        // s3 index is not deleted, update local entry
        let entry: Entry;
        try {
          const response = await state.AWSClient.send(new GetObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
          const body = await response.Body?.transformToByteArray();
          const bodyString = body ? new TextDecoder().decode(body) : '{}';
          entry = JSON.parse(bodyString) as Entry;
        } catch (error) {
          logger.error(`syncMasterIndex: error fetching s3 entry ${id}:`, error);
          throw error;
        }
        try {
          db.updateEntry(id, entry, true); // skipSync to avoid recursive loop
          syncedIndex[id] = s3Index;
          downloaded++;
        } catch (error) {
          logger.error(`syncMasterIndex: error updating local entry ${id}:`, error);
          throw error;
        }
      }
    }

    processed++;
    // only log progress when there's actual work happening (initial sync / large uploads)
    if ((downloaded + uploaded) > 0 && processed % 100 === 0) {
      logger.info(`syncMasterIndex: progress ${processed}/${total} — downloaded=${downloaded} uploaded=${uploaded} conflicts=${conflicts}`);
    }
  }

  logger.info(`syncMasterIndex: complete — downloaded=${downloaded} uploaded=${uploaded} conflicts=${conflicts}`);
  return syncedIndex;
}

/**
 * Updates the local master index for a given entry and saves it to the local filesystem ONLY.
 * Does NOT trigger S3 sync - full sync happens separately via cloudSyncPipeline on app start/close.
 *
 * @param {string} id - The id of the entry to update.
 * @param {MasterIndexEntry} entry - The entry to update.
 * @returns {Promise<void>}
 * @throws Will throw an error if the local master index is not found.
 */
export const updateLocalMasterIndex = async (id: string, entry: MasterIndexEntry): Promise<void> => {
  let masterIndex: MasterIndex;

  // load local index
  try {
    masterIndex = await loadLocalMasterIndex();
    masterIndex[id] = entry;
  } catch (error) {
    logger.error(`updateLocalMasterIndex: error loading local master index ${id}:`, error);
    throw error;
  }

  // save index to local filesystem only (no S3 sync to avoid recursive loop)
  try {
    fs.writeFileSync(path.join(state.UserDataPath, state.MasterIndexFileName), JSON.stringify(masterIndex, null, 2));
  } catch (error) {
    logger.error(`updateLocalMasterIndex: error saving local master index ${id}:`, error);
    throw error;
  }
  logger.debug(`updateLocalMasterIndex: local master index ${id} updated`);
}