import type { MasterIndex, Entry, MasterIndexEntry, SyncAction } from "../../../shared/types.js";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getAWSClient, getAWSConfig } from "./aws-connection.js";
import { MASTER_INDEX_PATH, MASTER_INDEX_FILE } from "./paths.js";
import * as db from "../db.js";
import fs from "node:fs";
import { logger } from "../logger.js";

// Creates masterIndex.json in userData if it doesn't exist. Called on startup.
export const initLocalMasterIndex = async (): Promise<void> => {
  if (!fs.existsSync(MASTER_INDEX_PATH)) {
    logger.debug("initLocalMasterIndex: creating new master index file at", MASTER_INDEX_PATH);
    fs.writeFileSync(MASTER_INDEX_PATH, "{}");
  }
};

// Creates masterIndex.json in S3 if it doesn't already exist.
export const initS3MasterIndex = async (): Promise<void> => {
  const awsClient = getAWSClient();
  const awsConfig = getAWSConfig();
  if (!awsClient || !awsConfig) {
    throw new Error("initS3MasterIndex: no s3 client or config found");
  }
  let exists = false;
  try {
    await awsClient.send(new HeadObjectCommand({ Bucket: awsConfig.aws_bucket, Key: MASTER_INDEX_FILE }));
    exists = true;
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      logger.debug("initS3MasterIndex: s3 master index file does not exist, creating it");
    } else {
      logger.error("initS3MasterIndex: failed to check if s3 master index file exists");
      throw error;
    }
  }

  if (!exists) {
    try {
      await awsClient.send(new PutObjectCommand({ Bucket: awsConfig.aws_bucket, Key: MASTER_INDEX_FILE, Body: "{}" }));
    } catch (error) {
      logger.error("initS3MasterIndex: failed to create s3 master index");
      throw error;
    }
  }
};

// Reads and validates masterIndex.json from disk.
export const loadLocalMasterIndex = (): MasterIndex => {
  if (!fs.existsSync(MASTER_INDEX_PATH)) {
    throw new Error("loadLocalMasterIndex: local master index file does not exist");
  }
  try {
    return verifyMasterIndex(JSON.parse(fs.readFileSync(MASTER_INDEX_PATH, "utf-8")) as MasterIndex);
  } catch (error) {
    logger.error("loadLocalMasterIndex: failed to load local master index");
    throw error;
  }
};

// Downloads and validates masterIndex.json from S3.
export const loadS3MasterIndex = async (): Promise<MasterIndex> => {
  logger.debug("loading s3 master index");
  const awsClient = getAWSClient();
  const awsConfig = getAWSConfig();
  if (!awsConfig || !awsClient) {
    throw new Error("loadS3MasterIndex: no s3 client or config found");
  }
  let parsed: MasterIndex;
  try {
    const response = await awsClient.send(
      new GetObjectCommand({ Bucket: awsConfig.aws_bucket, Key: MASTER_INDEX_FILE })
    );
    const body = await response.Body?.transformToByteArray();
    const bodyString = body ? new TextDecoder().decode(body) : "{}";
    parsed = JSON.parse(bodyString) as MasterIndex;
  } catch (error) {
    logger.error("loadS3MasterIndex: failed to load s3 master index");
    throw error;
  }
  return verifyMasterIndex(parsed);
};

// Validates all entries in a parsed MasterIndex; throws if any entry is malformed.
const verifyMasterIndex = (masterIndex: MasterIndex): MasterIndex => {
  if (typeof masterIndex !== "object" || masterIndex === null) {
    throw new Error("verifyMasterIndex: masterIndex is not a valid object");
  }

  const validated: MasterIndex = {};
  for (const [key, value] of Object.entries(masterIndex)) {
    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { lastModified: number }).lastModified === "number" &&
      typeof (value as { deleted: boolean }).deleted === "boolean"
    ) {
      validated[key] = value as { lastModified: number; deleted: boolean };
    } else {
      throw new Error("verifyMasterIndex: masterIndex is not a valid object");
    }
  }
  return validated;
};

// Pure planner: compares two indexes and returns a typed action plan with no I/O.
// Single-writer assumption: last-write-wins, no conflict detection.
export const planSync = (localMasterIndex: MasterIndex, s3MasterIndex: MasterIndex): SyncAction[] => {
  const ids = new Set([...Object.keys(localMasterIndex), ...Object.keys(s3MasterIndex)]);
  const plan: SyncAction[] = [];

  for (const id of ids) {
    const local = localMasterIndex[id];
    const s3 = s3MasterIndex[id];

    if (!local) { plan.push({ action: "download", id }); continue; }
    if (!s3)    { plan.push({ action: local.deleted ? "skip" : "upload", id }); continue; }

    if (local.lastModified > s3.lastModified) {
      plan.push({ action: local.deleted ? "delete-remote" : "upload", id }); continue;
    }
    if (local.lastModified < s3.lastModified) {
      plan.push({ action: s3.deleted ? "delete-local" : "download", id }); continue;
    }

    plan.push({ action: "skip", id });
  }

  return plan;
};

const executeSyncPlan = async (
  plan: SyncAction[],
  localMasterIndex: MasterIndex,
  s3MasterIndex: MasterIndex
): Promise<{ index: MasterIndex; changed: boolean }> => {
  const awsClient = getAWSClient();
  const awsConfig = getAWSConfig();
  if (!awsClient) throw new Error("executeSyncPlan: no s3 client found");
  if (!awsConfig) throw new Error("executeSyncPlan: no aws config found");

  const syncedIndex: MasterIndex = {};
  const total = plan.length;

  let processed = 0;
  let downloaded = 0;
  let uploaded = 0;
  let changed = false;

  const fetchS3Entry = async (id: string): Promise<Entry> => {
    const response = await awsClient.send(new GetObjectCommand({ Bucket: awsConfig.aws_bucket, Key: `entries/${id}.json` }));
    const body = await response.Body?.transformToByteArray();
    const parsed = JSON.parse(body ? new TextDecoder().decode(body) : "{}") as Entry;
    if (!parsed.id || !parsed.date || parsed.content === undefined) {
      throw new Error(`fetchS3Entry: entry ${id} has missing required fields`);
    }
    return parsed;
  };

  for (const item of plan) {
    const { action, id } = item;
    const local = localMasterIndex[id];
    const s3 = s3MasterIndex[id];

    switch (action) {
      case "download": {
        if (db.getEntryById(id) != null) { syncedIndex[id] = { ...s3 }; break; }
        try {
          const entry = await fetchS3Entry(id);
          db.createEntry(entry, false);
          syncedIndex[id] = { ...s3 };
          downloaded++;
          changed = true;
        } catch (error: any) {
          if (error.name === "NoSuchKey") {
            logger.warn(`syncMasterIndex: entry ${id} in masterIndex but missing from S3, removing from index`);
          } else {
            logger.error(`syncMasterIndex: error downloading entry ${id}:`, error);
            throw error;
          }
        }
        break;
      }

      case "upload": {
        const entry = db.getEntryById(id);
        if (!entry) {
          // masterIndex says entry exists but DB has no row — treat as deleted and clean up S3
          logger.warn(`syncMasterIndex: entry ${id} in masterIndex but missing from DB; marking deleted`);
          try {
            await awsClient.send(new DeleteObjectCommand({ Bucket: awsConfig.aws_bucket, Key: `entries/${id}.json` }));
          } catch (e: any) {
            if (e.name !== "NoSuchKey") logger.warn(`syncMasterIndex: could not remove orphaned S3 entry ${id}:`, e);
          }
          syncedIndex[id] = { lastModified: Date.now(), deleted: true };
          changed = true;
          break;
        }
        try {
          await awsClient.send(new PutObjectCommand({ Bucket: awsConfig.aws_bucket, Key: `entries/${id}.json`, Body: JSON.stringify(entry) }));
          syncedIndex[id] = { ...local };
          uploaded++;
          changed = true;
        } catch (error) {
          logger.error(`syncMasterIndex: error uploading entry ${id}:`, error);
          throw error;
        }
        break;
      }

      case "delete-remote": {
        try {
          await awsClient.send(new DeleteObjectCommand({ Bucket: awsConfig.aws_bucket, Key: `entries/${id}.json` }));
          syncedIndex[id] = { ...local };
          changed = true;
        } catch (error) {
          logger.error(`syncMasterIndex: error deleting S3 entry ${id}:`, error);
          throw error;
        }
        break;
      }

      case "delete-local": {
        try {
          logger.info(`sync: deleting local entry ${id} (deleted on remote)`);
          db.deleteEntry(id, false);
          syncedIndex[id] = { ...s3 };
          changed = true;
        } catch (error) {
          logger.error(`syncMasterIndex: error deleting local entry ${id}:`, error);
          throw error;
        }
        break;
      }

      case "skip": {
        if (local && !local.deleted && db.getEntryById(id) == null) {
          logger.warn(`sync: entry ${id} in master index but missing from db — re-downloading`);
          try {
            const entry = await fetchS3Entry(id);
            db.createEntry(entry, false);
            downloaded++;
            changed = true;
          } catch (error) {
            // omit from syncedIndex so next sync retries the download
            logger.warn(`syncMasterIndex: could not re-download missing entry ${id}:`, error);
            break;
          }
        }
        syncedIndex[id] = local ?? s3;
        break;
      }
    }

    processed++;
    if ((downloaded + uploaded) > 0 && processed % 100 === 0) {
      logger.info(`syncMasterIndex: progress ${processed}/${total} — downloaded=${downloaded} uploaded=${uploaded}`);
    }
  }

  if (downloaded > 0 || uploaded > 0) {
    logger.info(`syncMasterIndex: complete — downloaded=${downloaded} uploaded=${uploaded}`);
  }
  return { index: syncedIndex, changed };
};

export const syncMasterIndex = async (localMasterIndex: MasterIndex, s3MasterIndex: MasterIndex): Promise<{ index: MasterIndex; changed: boolean }> =>
  executeSyncPlan(planSync(localMasterIndex, s3MasterIndex), localMasterIndex, s3MasterIndex);

// ensure updates run one at a time
let updateQueue: Promise<void> = Promise.resolve();

export const updateLocalMasterIndex = (id: string, entry: MasterIndexEntry): Promise<void> => {
  const next = updateQueue.then(() => _updateLocalMasterIndex(id, entry));
  updateQueue = next.catch(() => {});
  return next;
};

const _updateLocalMasterIndex = async (id: string, entry: MasterIndexEntry): Promise<void> => {
  let masterIndex: MasterIndex;
  try {
    masterIndex = loadLocalMasterIndex();
    masterIndex[id] = { ...masterIndex[id], ...entry };
  } catch (error) {
    logger.error(`updateLocalMasterIndex: error loading local master index ${id}:`, error);
    throw error;
  }
  try {
    fs.writeFileSync(MASTER_INDEX_PATH, JSON.stringify(masterIndex, null, 2));
  } catch (error) {
    logger.error(`updateLocalMasterIndex: error saving local master index ${id}:`, error);
    throw error;
  }
  logger.debug(`updateLocalMasterIndex: local master index ${id} updated`);
};
