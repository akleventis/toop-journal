import { state } from '../cloudSync';
import { MasterIndex, Entry } from '../../renderer/lib/types';
import { GetObjectCommand, PutObjectCommand, NoSuchKey, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { idbCreateEntry, idbGetEntryById, idbUpdateEntry, idbDeleteEntry, getMainWindow } from './transact';
import path from 'node:path';
import fs from 'node:fs';

// loadS3MasterIndex loads the masterIndex.json from S3 and returns it in the correct format
// it returns null if the format is incorrect
export const loadS3MasterIndex = async (): Promise<MasterIndex> => {
    console.log('loading s3 master index');
    if (!state.AWSConfig || !state.AWSClient) {
      throw new Error('no s3 client or config found');
    }
    try {
      const response = await state.AWSClient.send(
        new GetObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: state.MasterIndexFileName })
      );
      const body = await response.Body?.transformToByteArray();
      const bodyString = body ? new TextDecoder().decode(body) : '{}';
  
      const parsed = JSON.parse(bodyString);
      return verifyMasterIndex(parsed);
    } catch (error) {
      // if master index does not exist, create it in s3
      if (error instanceof NoSuchKey) {
        console.log('master index does not exist, creating it in s3');
        await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: state.MasterIndexFileName, Body: '{}' }));
        return {};
      }
      console.error('failed to load s3 master index:');
      throw error;
    }
  };
  
  
  // loadLocalMasterIndex loads the masterIndex.json from the local filesystem and returns it in the correct format
  export const loadLocalMasterIndex = async (): Promise<MasterIndex> => {
    const masterIndexPath = path.resolve(process.cwd(), 'cloudsync', state.MasterIndexFileName);
    const raw = fs.readFileSync(masterIndexPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return verifyMasterIndex(parsed);
  };
  
  // verifyMasterIndex typechecks the parsed input and returns a valid MasterIndex object or an empty object if the input is invalid
  const verifyMasterIndex = (parsed: unknown): MasterIndex => {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('masterIndex is not a valid object');
    }
  
    const validated: MasterIndex = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { lastModified: number }).lastModified === 'number' &&
        typeof (value as { deleted: boolean }).deleted === 'boolean'
      ) {
        validated[key] = value as { lastModified: number; deleted: boolean };
      } else {
        throw new Error('masterIndex is not a valid object');
      }
    }
  
    return validated;
  };
  
  // ----- Sync Master Index ----- //
  
  // syncMasterIndex compares local and S3 master indexes and syncs any differences.
  // for each entry that differs between local and S3, it either:
  // - downloads from S3 and updates local database (if S3 is newer)
  // - uploads to S3 (if local is newer)
  // - handles deletions by removing from the appropriate location
  // returns the final synced master index
  export const syncMasterIndex = async (localMasterIndex: MasterIndex, s3MasterIndex: MasterIndex): Promise<MasterIndex> => {
    console.log('syncing master index');
    if (!state.AWSClient) {
      throw new Error('no s3 client found');
    }
  
    if (!state.AWSConfig) {
      throw new Error('no aws config found');
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
            throw new Error(`error creating s3 entry ${id}`);
          }
          console.log('creating local entry', id);
          await idbCreateEntry(id, entry);
          syncedIndex[id] = s3Index;
          continue;
        } catch (error) {
          console.error(`error creating local entry ${id}:`);
          throw error;
        }
      }
  
      // s3 entry does not exist, create it
      if (!s3Index) {
        try {
          const entry = await idbGetEntryById(id) as Entry;
          if (!entry) {
            throw new Error(`error retrieving local entry ${id}`);
          }
          console.log('creating s3 entry', id);
          await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json`, Body: JSON.stringify(entry) }));
          syncedIndex[id] = localIndex;
          continue;
        } catch (error) {
          console.error(`error creating s3 entry ${id}:`);
          throw error;
        }
      }
  
      // local entry is newer, update s3 bucket entry
      if (localIndex.lastModified > s3Index.lastModified) {
        if (localIndex.deleted) {
          console.log(`local entry is deleted, deleting s3 entry ${id}`);
          // local entry is deleted, delete s3 entry
          try {
            await state.AWSClient.send(new DeleteObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
            syncedIndex[id] = localIndex;
            continue;
          } catch (error) {
            console.error(`error deleting s3 entry ${id}:`);
            throw error;
          }
        }
  
        // update s3 entry
        let entry: Entry;
        try {
          entry = await idbGetEntryById(id) as Entry;
          if (!entry) {
            throw new Error(`error retrieving local entry ${id}`);
          }
        } catch (error) {
          console.error(`error retrieving local entry ${id}:`);
          throw error;
        }
        try {
          console.log(`creating s3 entry ${id}`);
          await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: `entries/${id}.json`, Body: JSON.stringify(entry) }));
          syncedIndex[id] = localIndex;
          continue;
        } catch (error) {
          console.error(`error creating s3 entry ${id}`);
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
            console.error(`failed to delete local entry ${id}:`, error);
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