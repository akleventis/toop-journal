/**
 * @file master_index.ts — Master index operations for cloud sync.
 *
 * Handles loading, saving, and syncing the master index between local storage and S3.
 *
 * Storage locations:
 * - Local: `/cloudsync/masterIndex.json` (gitignored, created after successful cloud sync setup)
 * - S3: `{bucket_name}/masterIndex.json` (auto-created after successful cloud sync configuration)
 *
 * Overview:
 * - JSON object containing the last modified time and deleted status of each entry.
 * - Stored in both S3 and the local database.
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

import { state } from './transact';
import { MasterIndex, Entry } from '../../renderer/lib/types';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { idbCreateEntry, idbGetEntryById, idbUpdateEntry, idbDeleteEntry } from './transact';
import path from 'node:path';
import fs from 'node:fs';

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
   * Loads the master index from the local filesystem and returns it as a `MasterIndex` object.
   *
   * @returns {Promise<MasterIndex>} The master index.
   * @throws Will throw an error if the local filesystem is not found, or if the master index is not found.
   */
  // Throws an error on nil local filesystem, does not exist, or invalid format.
  export const loadLocalMasterIndex = async (): Promise<MasterIndex> => {
    console.log('loading local master index');
    const masterIndexPath = path.resolve(process.cwd(), 'cloudsync', state.MasterIndexFileName);
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
   * Syncs the master index between local and S3.
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
        try {
          const response = await state.AWSClient.send(new GetObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
          const body = await response.Body?.transformToByteArray();
          const bodyString = body ? new TextDecoder().decode(body) : '{}';
          const entry = JSON.parse(bodyString) as Entry;
          if (!entry) {
            throw new Error(`syncMasterIndex: error creating s3 entry ${id}`);
          }
          console.log('syncMasterIndex: creating local entry', id);
          await idbCreateEntry(id, entry);
          syncedIndex[id] = s3Index;
          continue;
        } catch (error) {
          console.error(`syncMasterIndex: error creating local entry ${id}:`);
          throw error;
        }
      }
  
      // s3 entry does not exist, create it
      if (!s3Index) {
        try {
          const entry = await idbGetEntryById(id);
          if (!entry) {
            throw new Error(`syncMasterIndex: error retrieving local entry ${id}`);
          }
          console.log('syncMasterIndex: creating s3 entry', id);
          await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json`, Body: JSON.stringify(entry) }));
          syncedIndex[id] = localIndex;
          continue;
        } catch (error) {
          console.error(`syncMasterIndex: error creating s3 entry ${id}:`);
          throw error;
        }
      }
  
      // local entry is newer, update s3 bucket entry
      if (localIndex.lastModified > s3Index.lastModified) {
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
          entry = await idbGetEntryById(id);
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
      if (localIndex.lastModified < s3Index.lastModified) {
        if (s3Index.deleted) {
          try {
            await idbDeleteEntry(id);
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
          console.log(`retrieving s3 entry ${id}`);
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
          await idbUpdateEntry(id, entry);
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