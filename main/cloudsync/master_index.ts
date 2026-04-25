import { MasterIndex, Entry, MasterIndexEntry, SyncAction } from '../../shared/types';
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

// Pure planner: compares two indexes and returns a typed action plan with no I/O
export const planSync = (localMasterIndex: MasterIndex, s3MasterIndex: MasterIndex): SyncAction[] => {
  const ids = new Set([...Object.keys(localMasterIndex), ...Object.keys(s3MasterIndex)]);
  const plan: SyncAction[] = [];

  for (const id of ids) {
    const local = localMasterIndex[id];
    const s3 = s3MasterIndex[id];

    // local-only: entry exists on S3 but not locally — download it
    if (!local) {
      plan.push({ action: 'download', id });
      continue;
    }

    // S3-only: entry exists locally but not on S3 — upload it
    if (!s3) {
      plan.push({ action: 'upload', id });
      continue;
    }

    // local is newer: push local up, or delete remote if local was deleted
    if (local.lastModified > s3.lastModified) {
      plan.push({ action: local.deleted ? 'delete-remote' : 'upload', id });
      continue;
    }

    // S3 is newer: delete local if S3 deleted, otherwise check content before overwriting
    if (local.lastModified < s3.lastModified) {
      plan.push({ action: s3.deleted ? 'delete-local' : 'check-conflict', id });
      continue;
    }

    // timestamps equal: already in sync
    plan.push({ action: 'skip', id });
  }

  return plan;
};

// Executes a sync plan produced by planSync, performing all I/O and returning the merged index
const executeSyncPlan = async (
  plan: SyncAction[],
  localMasterIndex: MasterIndex,
  s3MasterIndex: MasterIndex
): Promise<MasterIndex> => {
  if (!state.AWSClient) throw new Error('executeSyncPlan: no s3 client found');
  if (!state.AWSConfig) throw new Error('executeSyncPlan: no aws config found');

  const syncedIndex: MasterIndex = {};
  const total = plan.length;
  logger.info(`syncMasterIndex: local=${Object.keys(localMasterIndex).length} entries, S3=${Object.keys(s3MasterIndex).length} entries, total=${total} to reconcile`);

  let processed = 0;
  let downloaded = 0;
  let uploaded = 0;
  let conflicts = 0;

  const fetchS3Entry = async (id: string): Promise<Entry> => {
    const response = await state.AWSClient!.send(new GetObjectCommand({ Bucket: state.AWSConfig!.aws_bucket, Key: `entries/${id}.json` }));
    const body = await response.Body?.transformToByteArray();
    return JSON.parse(body ? new TextDecoder().decode(body) : '{}') as Entry;
  };

  for (const item of plan) {
    const { action, id } = item;
    const local = localMasterIndex[id];
    const s3 = s3MasterIndex[id];

    switch (action) {
      case 'download': {
        // skip if already in local DB (index out of date)
        if (db.getEntryById(id) !== null) {
          syncedIndex[id] = s3;
          break;
        }
        try {
          const entry = await fetchS3Entry(id);
          db.createEntryFromRemote(entry);
          syncedIndex[id] = s3;
          downloaded++;
        } catch (error: any) {
          if (error.name === 'NoSuchKey') {
            // orphaned masterIndex reference — drop it
            logger.warn(`syncMasterIndex: entry ${id} in masterIndex but missing from S3, removing from index`);
          } else {
            logger.error(`syncMasterIndex: error downloading entry ${id}:`, error);
            throw error;
          }
        }
        break;
      }

      case 'upload': {
        // skip if already in S3 (index out of date)
        let s3Exists = false;
        try {
          await state.AWSClient.send(new GetObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
          s3Exists = true;
        } catch (error: any) {
          if (error.name !== 'NoSuchKey') {
            logger.error(`syncMasterIndex: error checking S3 entry ${id}:`, error);
            throw error;
          }
        }
        if (s3Exists) {
          syncedIndex[id] = local;
          break;
        }
        try {
          const entry = db.getEntryById(id);
          if (!entry) throw new Error(`syncMasterIndex: local entry ${id} not found`);
          await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json`, Body: JSON.stringify(entry) }));
          syncedIndex[id] = local;
          uploaded++;
        } catch (error) {
          logger.error(`syncMasterIndex: error uploading entry ${id}:`, error);
          throw error;
        }
        break;
      }

      case 'delete-remote': {
        try {
          await state.AWSClient.send(new DeleteObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
          syncedIndex[id] = local;
        } catch (error) {
          logger.error(`syncMasterIndex: error deleting S3 entry ${id}:`, error);
          throw error;
        }
        break;
      }

      case 'delete-local': {
        try {
          db.deleteEntryFromRemote(id);
          syncedIndex[id] = s3;
        } catch (error) {
          logger.error(`syncMasterIndex: error deleting local entry ${id}:`, error);
          throw error;
        }
        break;
      }

      case 'check-conflict': {
        const localEntry = db.getEntryById(id);
        let s3Entry: Entry;
        try {
          s3Entry = await fetchS3Entry(id);
        } catch (error) {
          logger.error(`syncMasterIndex: error fetching S3 entry for conflict check ${id}:`, error);
          throw error;
        }
        if (localEntry && s3Entry && localEntry.content !== s3Entry.content) {
          logger.warn(`syncMasterIndex: conflict detected for entry ${id}`);
          db.createConflict({
            entryId: id,
            entryDate: localEntry.date,
            localVersion: localEntry.content,
            remoteVersion: s3Entry.content,
            localModified: local.lastModified,
            remoteModified: s3.lastModified,
          });
          syncedIndex[id] = local; // hold local until user resolves
          conflicts++;
        } else {
          // content identical despite timestamp diff — accept S3 index
          db.updateEntryFromRemote(id, s3Entry!);
          syncedIndex[id] = s3;
          downloaded++;
        }
        break;
      }

      case 'skip': {
        syncedIndex[id] = local ?? s3;
        break;
      }
    }

    processed++;
    if ((downloaded + uploaded) > 0 && processed % 100 === 0) {
      logger.info(`syncMasterIndex: progress ${processed}/${total} — downloaded=${downloaded} uploaded=${uploaded} conflicts=${conflicts}`);
    }
  }

  logger.info(`syncMasterIndex: complete — downloaded=${downloaded} uploaded=${uploaded} conflicts=${conflicts}`);
  return syncedIndex;
};

export const syncMasterIndex = async (localMasterIndex: MasterIndex, s3MasterIndex: MasterIndex): Promise<MasterIndex> =>
  executeSyncPlan(planSync(localMasterIndex, s3MasterIndex), localMasterIndex, s3MasterIndex);

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