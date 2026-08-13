import type { MasterIndex, Entry, MasterIndexEntry, SyncAction } from "../../../shared/types.js";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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

// Entry ids that actually have a file in the bucket — one request per 1000 entries.
export const listS3EntryIds = async (): Promise<Set<string>> => {
  const awsClient = getAWSClient();
  const awsConfig = getAWSConfig();
  if (!awsClient || !awsConfig) {
    throw new Error("listS3EntryIds: no s3 client or config found");
  }
  const ids = new Set<string>();
  let token: string | undefined = undefined;
  do {
    const page: any = await awsClient.send(new ListObjectsV2Command({
      Bucket: awsConfig.aws_bucket,
      Prefix: "entries/",
      ContinuationToken: token,
    }));
    for (const object of page.Contents ?? []) {
      if (object.Key?.endsWith(".json")) ids.add(object.Key.slice("entries/".length, -".json".length));
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return ids;
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

// Pure planner: compares two indexes plus the files present in the bucket, returns a plan with no I/O.
// s3Files === null means the listing couldn't be trusted — drift repair is skipped, never guessed.
// Single-writer assumption: last-write-wins, no conflict detection.
export const planSync = (localMasterIndex: MasterIndex, s3MasterIndex: MasterIndex, s3Files: Set<string> | null): SyncAction[] => {
  const ids = new Set([...Object.keys(localMasterIndex), ...Object.keys(s3MasterIndex)]);
  const plan: SyncAction[] = [];

  for (const id of ids) {
    const local = localMasterIndex[id];
    const s3 = s3MasterIndex[id];

    // Live here but no file in the bucket — re-upload regardless of timestamps, since an index
    // that drifted ahead of the bucket is otherwise invisible. A newer remote tombstone still wins.
    if (s3Files && local && !local.deleted && !s3Files.has(id)) {
      const remoteDeletedNewer = s3 && s3.deleted && s3.lastModified > local.lastModified;
      if (!remoteDeletedNewer) { plan.push({ action: "upload", id }); continue; }
    }

    if (!local) { plan.push({ action: s3.deleted ? "skip" : "download", id }); continue; }
    if (!s3)    { plan.push({ action: "upload", id }); continue; }

    if (local.lastModified > s3.lastModified) {
      plan.push({ action: local.deleted ? "delete-remote" : "upload", id }); continue;
    }
    if (local.lastModified < s3.lastModified) {
      plan.push({ action: s3.deleted ? "delete-local" : "download", id }); continue;
    }

    // Same timestamp, disagreeing tombstones: live wins, else both sides skip each other forever.
    if (local.deleted !== s3.deleted) {
      plan.push({ action: local.deleted ? "download" : "upload", id }); continue;
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
        // Compare against the row we actually hold, not the index. Skipping the fetch whenever the
        // id existed dropped every edit made on another device while still adopting its timestamp,
        // so both sides then believed they were in sync.
        const localLastModified = db.getEntryLastModified(id);
        if (localLastModified !== null && s3.lastModified <= localLastModified) {
          // Our row is the newer one — record its own version, not S3's, so it uploads next sync
          // rather than being silently pinned to an older remote timestamp.
          syncedIndex[id] = { lastModified: localLastModified, deleted: false };
          changed = true;
          break;
        }
        try {
          const entry = await fetchS3Entry(id);
          if (localLastModified === null) db.createEntry(entry, false);
          else db.updateEntry(id, entry, false);
          syncedIndex[id] = { ...s3 };
          downloaded++;
          changed = true;
        } catch (error: any) {
          if (error.name === "NoSuchKey") {
            // Failing to fetch says nothing about whether the entry exists elsewhere — keep the
            // row as-is, since a tombstone here would propagate "deleted" to every other device.
            logger.warn(`syncMasterIndex: entry ${id} file missing from S3; leaving index row live, will retry`);
            syncedIndex[id] = { ...s3 };
            changed = true;
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
          // masterIndex says it exists but this DB has no row — pull it back from S3 rather than
          // deleting, which would destroy the last remaining copy.
          try {
            const remote = await fetchS3Entry(id);
            logger.warn(`syncMasterIndex: entry ${id} in masterIndex but missing from DB; restored from S3`);
            db.createEntry(remote, false);
            syncedIndex[id] = { ...(local ?? s3) };
            downloaded++;
            changed = true;
            break;
          } catch (error: any) {
            if (error.name !== "NoSuchKey") throw error;
          }
          // Gone from both, but another device may still hold it — leave the row untouched and
          // retry. Only a real user delete may write a tombstone.
          logger.warn(`syncMasterIndex: entry ${id} missing from both DB and S3; leaving index row live, will retry`);
          syncedIndex[id] = { ...(local ?? s3) };
          break;
        }
        try {
          await awsClient.send(new PutObjectCommand({ Bucket: awsConfig.aws_bucket, Key: `entries/${id}.json`, Body: JSON.stringify(entry) }));
          syncedIndex[id] = { ...(local ?? s3) };
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
        if (local && !local.deleted && !db.entryExists(id)) {
          logger.warn(`sync: entry ${id} in master index but missing from db — re-downloading`);
          try {
            const entry = await fetchS3Entry(id);
            db.createEntry(entry, false);
            downloaded++;
            changed = true;
          } catch (error) {
            // Keep the row (retry is driven by the db-missing check, not index absence).
            logger.warn(`syncMasterIndex: could not re-download missing entry ${id}:`, error);
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

export const syncMasterIndex = async (localMasterIndex: MasterIndex, s3MasterIndex: MasterIndex): Promise<{ index: MasterIndex; changed: boolean }> => {
  let s3Files: Set<string> | null = await listS3EntryIds();

  // An index full of live rows over an empty listing means the listing failed, not that every
  // file vanished. Distrust it rather than re-uploading the whole journal off a bad read.
  const liveS3Rows = Object.values(s3MasterIndex).filter((row) => !row.deleted).length;
  if (s3Files.size === 0 && liveS3Rows > 0) {
    logger.error(`syncMasterIndex: S3 listed 0 entry files but the index claims ${liveS3Rows} live — skipping drift repair this sync`);
    s3Files = null;
  }

  const plan = planSync(localMasterIndex, s3MasterIndex, s3Files);

  // Index/bucket drift is never normal — log it, capped so a first sync can't dump 3000 ids.
  const repairs = s3Files === null ? [] : plan.filter((p) => p.action === "upload" && !s3Files!.has(p.id) && localMasterIndex[p.id] && s3MasterIndex[p.id]);
  if (repairs.length > 0) {
    const shown = repairs.slice(0, 20).map((p) => p.id).join(", ");
    const more = repairs.length > 20 ? `, +${repairs.length - 20} more` : "";
    logger.warn(`syncMasterIndex: ${repairs.length} indexed entries have no file in S3; re-uploading: ${shown}${more}`);
  }

  return executeSyncPlan(plan, localMasterIndex, s3MasterIndex);
};

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
