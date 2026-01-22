/**
 * @file master_index.ts — Master index operations for cloud sync.
 *
 * Handles loading, saving, and syncing the master index between local storage and S3.
 *
 * Storage locations:
 * - Development: `~/Users/alexleventis/Library/Application\ Support/Electron/masterIndex.json`
 * - Production: `~/Library/Application Support/toop journal/masterIndex.json`
 * - S3: `{bucket_name}/masterIndex.json` (auto-created after successful cloud sync configuration)
 *
 * Overview:
 * - JSON object containing the last modified time and deleted status of each entry.
 * - Stored in both the user data directory and S3.
 * - Used to synchronize entries between the local database and S3.
 * - Updated whenever an entry is created, modified, or deleted.
 *
 * Example format:
 * ```json
 * {
 *   "jun.12.2025": {
 *     "lastModified": 1753581401007,
 *     "deleted": false
 *   },
 *   ...
 * }
 * ```
 */
import { MasterIndex, Entry, MasterIndexEntry } from '../../renderer/lib/types';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { state } from './transact';
import * as db from '../db/sqlite';
import path from 'node:path';
import fs from 'node:fs';

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
    console.log('initLocalMasterIndex: creating new master index file at', masterIndexPath);
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
      console.log('initS3MasterIndex: s3 master index file does not exist, creating it');
    } else {
      console.error('initS3MasterIndex: failed to check if s3 master index file exists');
      throw error;
    }
  }

  // if it doesn't exist, create it
  if (!exists) {
    try {
      await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: state.MasterIndexFileName, Body: '{}' }));
    } catch (error) {
      console.error('initS3MasterIndex: failed to create s3 master index');
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
    console.error('loadLocalMasterIndex: failed to load local master index');
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
  console.log('loading s3 master index');
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
    console.error('loadS3MasterIndex: failed to load s3 master index');
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
  console.log('syncing master index');
  if (!state.AWSClient) {
    throw new Error('syncMasterIndex: no s3 client found');
  }

  if (!state.AWSConfig) {
    throw new Error('syncMasterIndex: no aws config found');
  }

  const syncedIndex: MasterIndex = {};

  const ids = new Set([...Object.keys(localMasterIndex), ...Object.keys(s3MasterIndex)])

  for (const id of ids) {
    const localIndex = localMasterIndex[id]
    const s3Index = s3MasterIndex[id]

    syncedIndex[id] = localIndex ?? s3Index;

    // local entry does not exist, create it
    if (!localIndex) {
      // if already entry exists in local database, continue
      let localEntryExists = false;
      try {
        if (db.getEntryById(id) !== null) {
          console.log(`syncMasterIndex: local entry ${id} already exists`);
          localEntryExists = true;
        }
      } catch (error) {
        console.error(`syncMasterIndex: error checking if local entry ${id} exists:`, error);
        throw error;
      }

      if (!localEntryExists) {
        try {
          const response = await state.AWSClient.send(new GetObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
          const body = await response.Body?.transformToByteArray();
          const bodyString = body ? new TextDecoder().decode(body) : '{}';
          const entry = JSON.parse(bodyString) as Entry;
          if (!entry) {
            throw new Error(`syncMasterIndex: error creating s3 entry ${id}`);
          }
          console.log('syncMasterIndex: creating local entry', id);
          db.createEntry(entry);
          syncedIndex[id] = s3Index;
          continue;
        } catch (error) {
          console.error(`syncMasterIndex: error creating local entry ${id}:`);
          throw error;
        }
      }
    }

    // s3 index does not exist, create it
    if (!s3Index) {
      // if already entry exists in s3, continue
      let s3EntryExists = false;
      try {
        await state.AWSClient.send(new GetObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
        console.log(`syncMasterIndex: s3 entry ${id} already exists`);
        s3EntryExists = true;
      } catch (error: any) {
        if (error.name === 'NoSuchKey') {
          console.log(`syncMasterIndex: s3 entry ${id} not found, creating local entry`);
        } else {
          console.error(`syncMasterIndex: error retrieving s3 entry ${id}:`, error);
          throw error;
        }
      }

      if (!s3EntryExists) {
        try {
          // fetch entry from local database and create s3 entry
          const entry = db.getEntryById(id);
          if (!entry) {
            throw new Error(`syncMasterIndex: error retrieving local entry ${id}`);
          }
          console.log('syncMasterIndex: creating s3 entry', id); // todo: what happens if entry already exists in s3?
          await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json`, Body: JSON.stringify(entry) }));
          syncedIndex[id] = localIndex;
          continue;
        } catch (error) {
          console.error(`syncMasterIndex: error creating s3 entry ${id}:`);
          throw error;
        }
      }
    }

    // local entry is newer, update s3 bucket entry
    if (s3Index !== undefined && localIndex !== undefined && localIndex.lastModified > s3Index.lastModified) {
      if (localIndex.deleted) {
        console.log(`syncMasterIndex: local entry is deleted, deleting s3 entry ${id}`);
        // local entry is deleted, delete s3 entry
        try {
          await state.AWSClient.send(new DeleteObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
          syncedIndex[id] = localIndex;
          continue;
        } catch (error) {
          console.error(`syncMasterIndex: error deleting s3 entry ${id}:`);
          throw error;
        }
      }

      // update s3 entry
      let entry: Entry | null;
      try {
        entry = db.getEntryById(id);
        if (!entry) {
          throw new Error(`syncMasterIndex: error retrieving local entry ${id}`);
        }
      } catch (error) {
        console.error(`syncMasterIndex: error retrieving local entry ${id}:`);
        throw error;
      }
      try {
        console.log(`syncMasterIndex: creating s3 entry ${id}`);
        await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json`, Body: JSON.stringify(entry) }));
        syncedIndex[id] = localIndex;
        continue;
      } catch (error) {
        console.error(`syncMasterIndex: error creating s3 entry ${id}`);
        throw error;
      }
    }

    // s3 entry is newer, update local entry
    if (s3Index !== undefined && localIndex !== undefined && localIndex.lastModified < s3Index.lastModified) {
      if (s3Index.deleted) {
        console.log(`syncMasterIndex: s3 entry is deleted, deleting local entry ${id}`);
        try {
          db.deleteEntry(id);
          syncedIndex[id] = s3Index;
          continue;
        } catch (error) {
          console.error(`syncMasterIndex: failed to delete local entry ${id}:`, error);
          throw error;
        }
      }

      // update local entry
      let entry: Entry;
      try {
        const response = await state.AWSClient.send(new GetObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
        const body = await response.Body?.transformToByteArray();
        const bodyString = body ? new TextDecoder().decode(body) : '{}';
        entry = JSON.parse(bodyString) as Entry;
      } catch (error) {
        console.error(`error retrieving s3 entry ${id}:`);
        throw error;
      }
      try {
        console.log(`updating local entry ${id}`);
        db.updateEntry(id, entry);
        syncedIndex[id] = s3Index;
        continue;
      } catch (error) {
        console.error(`failed to update S3 entry ${id}:`, error);
        throw error;
      }
    }
  }

  return syncedIndex;
}

export const updateMasterIndex = async (id: string, entry: MasterIndexEntry): Promise<void> => {
  let masterIndex: MasterIndex;
  let s3MasterIndex: MasterIndex;

  // load local index
  try {
    masterIndex = await loadLocalMasterIndex();
    masterIndex[id] = entry;
  } catch (error) {
    console.error(`failed to load local master index ${id}:`, error);
    throw error;
  }

  // if aws is configured, merge local & s3 indexes (updates entries via syncMasterIndex function)
  if (state.AWSClient && state.AWSConfig) { // better aws initialized state variable?
    try {
      s3MasterIndex = await loadS3MasterIndex();
    } catch (error) {
      console.error(`failed to load s3 master index ${id}:`, error);
      throw error;
    }
    try {
      masterIndex = await syncMasterIndex(masterIndex, s3MasterIndex);
    } catch (error) {
      console.error(`failed to sync and save s3 master index ${id}:`, error);
      throw error;
    }
  }

  // save index to local filesystem
  try {
    fs.writeFileSync(path.join(state.UserDataPath, state.MasterIndexFileName), JSON.stringify(masterIndex, null, 2));
  } catch (error) {
    console.error(`failed to save local master index ${id}:`, error);
    throw error;
  }

  // if aws is configured, save s3 master index
  if (state.AWSClient && state.AWSConfig) { // better aws initialized state variable?
    try {
      await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: state.MasterIndexFileName, Body: JSON.stringify(masterIndex) }));
    } catch (error) {
      console.error(`failed to save s3 master index ${id}:`, error);
      throw error;
    }
  }

}