import { PutObjectCommand } from "@aws-sdk/client-s3";
import { loadLocalMasterIndex, loadS3MasterIndex, syncMasterIndex } from "./master_index.js";
import { getAWSClient, getAWSConfig } from "./aws-connection.js";
import { MASTER_INDEX_FILE, MASTER_INDEX_PATH } from "./paths.js";
import fs from "node:fs";
import { syncStateMachine, SyncState } from "./sync_state.js";
import { logger } from "../logger.js";
import { dbEvents } from "../db.js";
import type { MasterIndex } from "../../../shared/types.js";

let lastSyncTime = 0; // epoch ms; read by health check

export const getLastSyncTime = (): number => lastSyncTime;
// Returns true if an S3 client and config are both ready.
export const isSyncConfigured = (): boolean => !!(getAWSClient() && getAWSConfig());

// Merges local and S3 master indexes, then commits atomically:
// write to temp file → upload to S3 → rename to final (local only commits if S3 succeeds).
export const cloudSyncPipeline = async (): Promise<void> => {
  const awsClient = getAWSClient();
  const awsConfig = getAWSConfig();

  if (!awsConfig) throw new Error("no aws config found");
  if (!awsClient) throw new Error("no s3 client found");

  syncStateMachine.setState(SyncState.SYNCING);
  logger.info("cloudSyncPipeline: starting sync");
  const pipelineStart = Date.now();

  let s3MasterIndex: MasterIndex;
  let localMasterIndex: MasterIndex;

  try {
    localMasterIndex = loadLocalMasterIndex();
  } catch (error) {
    syncStateMachine.setState(SyncState.ERROR);
    logger.error("failed to load master index:", error);
    throw error;
  }

  try {
    s3MasterIndex = await loadS3MasterIndex();
  } catch (error) {
    syncStateMachine.setState(SyncState.ERROR);
    logger.error("failed to load s3 master index:", error);
    throw error;
  }

  try {
    const { index: merged, changed } = await syncMasterIndex(localMasterIndex, s3MasterIndex);

    if (changed) {
      const tempPath = `${MASTER_INDEX_PATH}.tmp`;
      const finalPath = MASTER_INDEX_PATH;

      logger.debug("uploading master index to S3");
      await awsClient.send(new PutObjectCommand({
        Bucket: awsConfig.aws_bucket,
        Key: MASTER_INDEX_FILE,
        Body: JSON.stringify(merged),
      }));

      // Re-read disk before committing: updateLocalMasterIndex may have written updates
      // (e.g. a deletion) while the pipeline was running. Merge by keeping whichever
      // version has the newer lastModified so in-flight local changes aren't overwritten.
      logger.debug("committing local master index");
      let currentDisk: MasterIndex = {};
      try { currentDisk = JSON.parse(fs.readFileSync(MASTER_INDEX_PATH, "utf-8")); } catch { /* use empty */ }
      const allIds = new Set([...Object.keys(merged), ...Object.keys(currentDisk)]);
      const finalIndex: MasterIndex = {};
      for (const id of allIds) {
        const m = merged[id];
        const d = currentDisk[id];
        if (m && d) finalIndex[id] = d.lastModified > m.lastModified ? d : m;
        else finalIndex[id] = (m ?? d)!;
      }
      logger.debug("writing to temporary master index file");
      fs.writeFileSync(tempPath, JSON.stringify(finalIndex, null, 2));
      fs.renameSync(tempPath, finalPath);
    } else {
      logger.debug("cloudSyncPipeline: no changes, skipping index upload");
    }
  } catch (error) {
    syncStateMachine.setState(SyncState.ERROR);
    logger.error("failed to sync master index:", error);
    const tempPath = `${MASTER_INDEX_PATH}.tmp`;
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw error;
  }

  lastSyncTime = Date.now();
  const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
  logger.info(`cloudSyncPipeline: sync complete in ${elapsed}s`);
  syncStateMachine.setState(SyncState.READY);
  dbEvents.emit("sync:complete");
};
