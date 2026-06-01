import type { S3Config } from "../../../shared/types.js";
import path from "node:path";
import fs from "node:fs";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { initS3MasterIndex } from "./master_index.js";
import { syncStateMachine, SyncState } from "./sync_state.js";
import { logger } from "../logger.js";
import { USER_DATA_PATH } from "./paths.js";

let awsClient: S3Client | null = null;
let awsConfig: S3Config | null = null;
let initializing = false;

export function getAWSClient(): S3Client | null { return awsClient; }
export function getAWSConfig(): S3Config | null { return awsConfig; }

// Loads config, creates and tests the S3 client, and sets sync state. No-ops if already initialized.
export const initS3Client = async (): Promise<void> => {
  if (initializing) {
    logger.debug("initS3Client: S3 client is already initializing, skipping initialization");
    return;
  }
  if (awsClient) {
    logger.debug("initS3Client: S3 client is already initialized, skipping initialization");
    return;
  }

  initializing = true;
  syncStateMachine.setState(SyncState.INITIALIZING);
  const start = Date.now();
  logger.info("initS3Client: initializing");

  let config: S3Config | null;
  try {
    config = getConfig();
  } catch (error) {
    initializing = false;
    syncStateMachine.setState(SyncState.ERROR);
    logger.error("initS3Client: failed to load aws config:", error);
    throw error;
  }

  // no config file = sync is disabled, not an error
  if (!config) {
    initializing = false;
    syncStateMachine.setState(SyncState.DISABLED);
    logger.info("initS3Client: sync disabled (no config)");
    return;
  }

  try {
    await connectClient(config);
  } catch (error) {
    initializing = false;
    syncStateMachine.setState(SyncState.ERROR);
    logger.error("initS3Client: failed to connect aws client:", error);
    throw error;
  }
  initializing = false;
  syncStateMachine.setState(SyncState.READY);
  logger.info(`initS3Client: ready in ${((Date.now() - start) / 1000).toFixed(1)}s`);
};

// Builds, tests, and stores an S3Client from config.
async function connectClient(config: S3Config): Promise<void> {
  const client = new S3Client({
    region: config.aws_region,
    credentials: { accessKeyId: config.aws_access, secretAccessKey: config.aws_secret },
    requestHandler: new NodeHttpHandler({ connectionTimeout: 5000, requestTimeout: 30000 }),
  });
  if (!await testAWSClient(client, config.aws_bucket)) {
    throw new Error("connectClient: testAWSClient failed");
  }
  awsClient = client;
  awsConfig = config;
  await initS3MasterIndex();
}

// Returns true if the client can list objects in the bucket, false otherwise.
export const testAWSClient = async (client: S3Client, bucket: string): Promise<boolean> => {
  try {
    await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    return true;
  } catch {
    return false;
  }
};

// Loads AWS config from config.json. Returns null if not found or invalid.
export const getConfig = (): S3Config | null => {
  const configPath = path.join(USER_DATA_PATH, "config.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return isValidAWSConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

async function saveConfig(config: S3Config, label: string): Promise<S3Config> {
  if (!isValidAWSConfig(config)) {
    throw new Error(`${label}: invalid aws config`);
  }
  syncStateMachine.setState(SyncState.INITIALIZING);
  try {
    await connectClient(config);
  } catch (error) {
    syncStateMachine.setState(SyncState.ERROR);
    logger.error(`${label}: failed to save aws config:`, error);
    throw error;
  }
  fs.writeFileSync(path.join(USER_DATA_PATH, "config.json"), JSON.stringify(config));
  syncStateMachine.setState(SyncState.READY);
  return config;
}

export const createConfig = async (config: S3Config): Promise<S3Config> => {
  logger.info("createConfig: saving new AWS config");
  return saveConfig(config, "createConfig");
};

export const updateConfig = async (config: S3Config): Promise<S3Config> => {
  logger.info("updateConfig: updating AWS config");
  return saveConfig(config, "updateConfig");
};

// Clears the S3 client from memory without removing credentials from disk.
export const disableSync = (): void => {
  awsClient = null;
  awsConfig = null;
  syncStateMachine.setState(SyncState.DISABLED);
};

// Deletes config.json from disk and clears the client from memory.
export const deleteConfig = async (): Promise<void> => {
  logger.info("deleteConfig: deleting AWS config");
  const configPath = path.join(USER_DATA_PATH, "config.json");
  if (fs.existsSync(configPath)) fs.rmSync(configPath);
  awsClient = null;
  awsConfig = null;
  syncStateMachine.setState(SyncState.DISABLED);
  logger.info("deleteConfig: AWS config deleted");
};

// Type guard for S3Config.
const isValidAWSConfig = (config: unknown): config is S3Config => {
  if (typeof config !== "object" || config === null) return false;
  return (
    typeof (config as any).aws_access === "string" && (config as any).aws_access.trim() !== "" &&
    typeof (config as any).aws_secret === "string" && (config as any).aws_secret.trim() !== "" &&
    typeof (config as any).aws_region === "string" && (config as any).aws_region.trim() !== "" &&
    typeof (config as any).aws_bucket === "string" && (config as any).aws_bucket.trim() !== ""
  );
};
