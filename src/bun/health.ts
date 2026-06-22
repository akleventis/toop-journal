import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { Utils } from "electrobun/bun";
import fs from "node:fs";
import type { HealthCheck } from "../../shared/types.js";
import * as db from "./db.js";
import { getAWSClient, getAWSConfig } from "./cloudsync/aws-connection.js";
import { getLastSyncTime } from "./cloudsync/transact.js";
import { loadLocalMasterIndex } from "./cloudsync/master_index.js";

export async function healthRun(): Promise<HealthCheck> {
  const awsClient = getAWSClient();
  const awsConfig = getAWSConfig();
  const [masterIndexIntegrity, s3Connectivity, diskSpace] = await Promise.all([
    Promise.resolve().then(() => { loadLocalMasterIndex(); return true; }).catch(() => false),
    awsClient && awsConfig
      ? awsClient.send(new HeadBucketCommand({ Bucket: awsConfig.aws_bucket })).then(() => true).catch(() => false)
      : Promise.resolve(null),
    (fs.promises as any).statfs(Utils.paths.userData).then((s: any) => s.bavail * s.bsize).catch(() => -1),
  ]);
  return {
    databaseIntegrity: db.integrityCheck(),
    masterIndexIntegrity,
    s3Connectivity,
    diskSpace,
    lastSyncTime: getLastSyncTime(),
  };
}
