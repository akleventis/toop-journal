import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow } from 'electron';

import { S3Config, Entry, MasterIndex } from '../renderer/lib/types';
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, NoSuchKey } from '@aws-sdk/client-s3';

const MasterIndexFileName = 'masterIndex.json';

let AWSClient: S3Client | null = null;
let AWSConfig: S3Config | null = null;

// used to prevent multiple initialization attempts
let s3ClientInitializing = false;

// ----- AWS Configuration ----- //
export const createDefaultConfig = (isDev: boolean) => {
  const { app } = require('electron');
  let configPath: string;
  if (isDev) {
    configPath = path.join(process.cwd(), 'cloudsync', 'config.json');
  } else {
    const userDataPath = app.getPath('userData');
    configPath = path.join(userDataPath, 'config.json');
  }

  if (fs.existsSync(configPath)) {
    console.log('Config file already exists, skipping creation');
    return;
  }

  const defaultConfig = {
    aws_access: '',
    aws_secret: '',
    aws_bucket: '',
    aws_region: ''
  };

  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log('Created default config at:', configPath);
};

export const updateConfig = (isDev: boolean, config: S3Config) => {
  if (!isValidAWSConfig(config)) {
    throw new Error('invalid aws config');
  }
  const { app } = require('electron');
  let configPath: string;
  if (isDev) {
    configPath = path.join(process.cwd(), 'cloudsync', 'config.json');
  } else {
    const userDataPath = app.getPath('userData');
    configPath = path.join(userDataPath, 'config.json');
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('Updated config at:', configPath);
};

// ----- S3 Initialization Operations ----- //

// initializes the S3 client for aws operations. Returns early if already initializing
// or if client exists. Requires valid aws config.
export const initS3Client = async (isDev: boolean): Promise<void> => {
  if (s3ClientInitializing) {
    console.log('S3 client is already initializing, skipping initialization')
    return;
  }

  // if the client is already initialized, skip initialization
  if (AWSClient) {
    console.log('S3 client is already initialized, skipping initialization')
    return;
  }

  AWSConfig = loadConfig(isDev);
  if (!AWSConfig) {
    throw new Error('invalid aws config');
  }
  console.log("AWSConfig", AWSConfig)

  s3ClientInitializing = true;
  try {
    const client = new S3Client({
      region: AWSConfig.aws_region,
      credentials: { accessKeyId: AWSConfig.aws_access, secretAccessKey: AWSConfig.aws_secret },
    });

    await client.send(new ListObjectsV2Command({ Bucket: AWSConfig.aws_bucket, MaxKeys: 1 }));
    AWSClient = client;
  } catch (err) {
    throw err;
  } finally {
    s3ClientInitializing = false;
  }
  try {
    console.log("calling cloudSyncPipeline")
    // await cloudSyncPipeline()
  } catch (error) {
    console.error('failed to sync cloud on init:', error);
    throw error;
  }
};

// loadConfig loads the AWS config from the config.json file
const loadConfig = (isDev: boolean): S3Config | null => {
  const { app } = require('electron');
  let configPath: string;
  if (isDev) {
    configPath = path.join(process.cwd(), 'cloudsync', 'config.json');
  } else {
    const userDataPath = app.getPath('userData');
    configPath = path.join(userDataPath, 'config.json');
  }

  console.log("configPath", configPath)

  if (!fs.existsSync(configPath)) {
    console.error('config.json not found');
    return null;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  if (!raw || raw.trim() === '') {
    console.error('config.json is empty');
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isValidAWSConfig(parsed)) {
      console.error('config.json invalid aws config');
      return null;
    }
    return parsed;
  } catch {
    console.error('config.json parse error');
    return null;
  }
};


// isValidAWSConfig is a type guard to validate AWSConfig structure
const isValidAWSConfig = (config: unknown): config is S3Config => {
  if (typeof config !== 'object' || config === null) return false;

  return (
    typeof (config as any).aws_access === 'string' && (config as any).aws_access.trim() !== '' &&
    typeof (config as any).aws_secret === 'string' && (config as any).aws_secret.trim() !== '' &&
    typeof (config as any).aws_region === 'string' && (config as any).aws_region.trim() !== '' &&
    typeof (config as any).aws_bucket === 'string' && (config as any).aws_bucket.trim() !== ''
  );
};

// ----- Cloud Sync Pipeline ----- //

// cloudSyncPipeline syncs master indexes & entries between local and S3
export const cloudSyncPipeline = async () => {
  if (!AWSConfig) {
    throw new Error('no aws config found');
  }

  if (!AWSClient) {
    throw new Error('no s3 client found');
  }

  let s3MasterIndex: MasterIndex;
  let localMasterIndex: MasterIndex;

  try {
    localMasterIndex = await loadLocalMasterIndex();
    await AWSClient.send(new PutObjectCommand({ Bucket: AWSConfig.aws_bucket, Key: MasterIndexFileName, Body: JSON.stringify(localMasterIndex) }));
    s3MasterIndex = await loadS3MasterIndex();
  } catch (error) {
    console.error('failed to load master index:', error);
    throw error;
  }

  // sync local and s3 master indexes
  let merged: MasterIndex;
  try {
    merged = await syncMasterIndex(localMasterIndex, s3MasterIndex);
    fs.writeFileSync(path.resolve(process.cwd(), 'cloudsync', MasterIndexFileName), JSON.stringify(merged, null, 2));
    await AWSClient.send(new PutObjectCommand({ Bucket: AWSConfig.aws_bucket, Key: MasterIndexFileName, Body: JSON.stringify(merged) }));
  } catch (error) {
    console.error('failed to sync master index:', error);
    throw error;
  }

  // put local & s3 master index
  try {
    console.log('putting local master index');
    fs.writeFileSync(path.resolve(process.cwd(), 'cloudsync', MasterIndexFileName), JSON.stringify(merged, null, 2));
  } catch (error) {
    console.error('failed to put local & s3 master index:', error);
    throw error;
  }

  try {
    console.log('putting s3 master index');
    await AWSClient.send(new PutObjectCommand({ Bucket: AWSConfig.aws_bucket, Key: MasterIndexFileName, Body: JSON.stringify(merged) }));
  } catch (error) {
    console.error('failed to put s3 master index:', error);
    throw error;
  }
}

// loadS3MasterIndex loads the masterIndex.json from S3 and returns it in the correct format
// it returns null if the format is incorrect
const loadS3MasterIndex = async (): Promise<MasterIndex> => {
  console.log('loading s3 master index');
  if (!AWSConfig || !AWSClient) {
    throw new Error('no s3 client or config found');
  }
  try {
    const response = await AWSClient.send(
      new GetObjectCommand({ Bucket: AWSConfig.aws_bucket, Key: MasterIndexFileName })
    );
    const body = await response.Body?.transformToByteArray();
    const bodyString = body ? new TextDecoder().decode(body) : '{}';

    const parsed = JSON.parse(bodyString);
    return verifyMasterIndex(parsed);
  } catch (error) {
    // if master index does not exist, create it in s3
    if (error instanceof NoSuchKey) {
      console.log('master index does not exist, creating it in s3');
      await AWSClient.send(new PutObjectCommand({ Bucket: AWSConfig.aws_bucket, Key: MasterIndexFileName, Body: '{}' }));
      return {};
    }
    console.error('failed to load s3 master index:');
    throw error;
  }
};


// loadLocalMasterIndex loads the masterIndex.json from the local filesystem and returns it in the correct format
const loadLocalMasterIndex = async (): Promise<MasterIndex> => {
  const masterIndexPath = path.resolve(process.cwd(), 'cloudsync', MasterIndexFileName);
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
const syncMasterIndex = async (localMasterIndex: MasterIndex, s3MasterIndex: MasterIndex): Promise<MasterIndex> => {
  console.log('syncing master index');
  if (!AWSClient) {
    throw new Error('no s3 client found');
  }

  if (!AWSConfig) {
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
        const response = await AWSClient.send(new GetObjectCommand({ Bucket: AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
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
        await AWSClient.send(new PutObjectCommand({ Bucket: AWSConfig.aws_bucket, Key: `entries/${id}.json`, Body: JSON.stringify(entry) }));
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
          await AWSClient.send(new DeleteObjectCommand({ Bucket: AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
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
        await AWSClient.send(new PutObjectCommand({ Bucket: AWSConfig.aws_bucket, Key: `entries/${id}.json`, Body: JSON.stringify(entry) }));
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
        const response = await AWSClient.send(new GetObjectCommand({ Bucket: AWSConfig.aws_bucket, Key: `entries/${id}.json` }));
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

// ----- Master Index Operations (called from renderer process) ----- //
// consider adding 'sync' flag to db updates -> don't write to masterIndex on sync

export const putEntryCloudSync = async (entry: Entry) => {
  console.log(`putting entry s3 ${entry.id}`);
  if (!AWSClient) {
    throw new Error('no s3 client found');
  }

  if (!AWSConfig) {
    throw new Error('no aws config found');
  }

  if (!entry.lastModified) {
    throw new Error('entry lastModified is required');
  }

  // push entry to s3
  await AWSClient.send(new PutObjectCommand({
    Bucket: AWSConfig.aws_bucket,
    Key: `entries/${entry.id}.json`,
    Body: JSON.stringify(entry)
  }));

  // update local master index
  const masterIndex = await loadLocalMasterIndex();
  masterIndex[entry.id] = {
    lastModified: entry.lastModified,
    deleted: false,
  };

  // sync master indexes
  const mergedMasterIndex = await syncMasterIndex(masterIndex, await loadS3MasterIndex());

  // push updated master index to s3
  try {
    console.log('pushing updated master index to s3');
    await AWSClient.send(new PutObjectCommand({
      Bucket: AWSConfig.aws_bucket,
      Key: MasterIndexFileName,
      Body: JSON.stringify(mergedMasterIndex)
    }));
  } catch (error) {
    console.error('failed to sync master indexes:', error);
    throw error;
  }

  // write master index to local filesystem
  try {
    console.log('writing local master index');
    fs.writeFileSync(path.resolve(process.cwd(), 'cloudsync', MasterIndexFileName), JSON.stringify(mergedMasterIndex, null, 2));
  } catch (error) {
    console.error('failed to write local master index:', error);
    throw error;
  }
};

export const deleteEntryCloudSync = async (id: string) => {
  console.log(`deleting entry s3 ${id}`);
  if (!AWSClient) {
    throw new Error('no s3 client found');
  }

  if (!AWSConfig) {
    throw new Error('no aws config found');
  }


  // delete entry from s3
  await AWSClient.send(new DeleteObjectCommand({
    Bucket: AWSConfig.aws_bucket,
    Key: `entries/${id}.json`
  }));

  // update local master index
  const masterIndex = await loadLocalMasterIndex();
  masterIndex[id] = {
    lastModified: Date.now(),
    deleted: true,
  };

  // sync master indexes
  const mergedMasterIndex = await syncMasterIndex(masterIndex, await loadS3MasterIndex());

  // push updated master index to s3
  try {
    console.log('pushing updated master index to s3');
    await AWSClient.send(new PutObjectCommand({
      Bucket: AWSConfig.aws_bucket,
      Key: MasterIndexFileName,
      Body: JSON.stringify(mergedMasterIndex)
    }));
  } catch (error) {
    console.error('failed to sync master indexes:', error);
    throw error;
  }

  // write master index to local filesystem
  try {
    console.log('writing local master index');
    fs.writeFileSync(path.resolve(process.cwd(), 'cloudsync', MasterIndexFileName), JSON.stringify(mergedMasterIndex, null, 2));
  } catch (error) {
    console.error('failed to write local master index:', error);
    throw error;
  }
};

// ----- Local IDB Database operations (db located on the renderer process) ----- //

// getMainWindow returns the main window or null if no window is open
const getMainWindow = (): BrowserWindow | null => {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
};

// idbGetEntryById gets an entry from the IndexedDB
const idbGetEntryById = async (id: string) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) throw new Error('No renderer window available');
  return await mainWindow.webContents.executeJavaScript(`window.idbGetEntryById('${id}')`);
};

// idbCreateEntry creates an entry in the IndexedDB by executing js in the renderer process
const idbCreateEntry = async (id: string, entry: Entry) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) throw new Error('No renderer window available');
  return await mainWindow.webContents.executeJavaScript(`window.idbCreateEntry('${id}', ${JSON.stringify(entry)})`);
}

// idbUpdateEntry updates an entry in the IndexedDB by executing js in the renderer process
const idbUpdateEntry = async (id: string, entry: Entry) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) throw new Error('No renderer window available');
  return await mainWindow.webContents.executeJavaScript(`window.idbUpdateEntry('${id}', ${JSON.stringify(entry)})`);
};

// idbDeleteEntry deletes an entry from the IndexedDB by executing js in the renderer process
const idbDeleteEntry = async (id: string) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) throw new Error('No renderer window available');
  return await mainWindow.webContents.executeJavaScript(`window.idbDeleteEntry('${id}')`);
}