import { state } from './transact';
import { getConfig } from './aws_config';
import { S3Config } from '../../shared/types';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { initS3MasterIndex } from './master_index';
import { syncStateMachine, SyncState } from './sync_state';
import { logger } from '../logger';

let S3ClientInitializing = false; // prevent multiple initialization attempts

// Loads config, creates and tests the S3 client, and sets sync state. No-ops if already initialized.
export const initS3Client = async (): Promise<void> => {
  if (S3ClientInitializing) {
    logger.debug('initS3Client: S3 client is already initializing, skipping initialization')
    return;
  }

  // if the client is already initialized, skip initialization
  if (state.AWSClient) {
    logger.debug('initS3Client: S3 client is already initialized, skipping initialization')
    return;
  }

  S3ClientInitializing = true;
  syncStateMachine.setState(SyncState.INITIALIZING);

  try {
    state.AWSConfig = getConfig();
  } catch (error) {
    S3ClientInitializing = false;
    syncStateMachine.setState(SyncState.ERROR);
    logger.error('initS3Client: failed to load aws config:', error);
    throw error;
  }

  // no config file = sync is disabled, not an error
  if (!state.AWSConfig) {
    S3ClientInitializing = false;
    syncStateMachine.setState(SyncState.DISABLED);
    return;
  }

  try {
    await setAWSClient(state.AWSConfig);
  } catch (error) {
    S3ClientInitializing = false;
    syncStateMachine.setState(SyncState.ERROR);
    logger.error('initS3Client: failed to set aws client:', error);
    throw error;
  }
  S3ClientInitializing = false;
  syncStateMachine.setState(SyncState.READY);
};

// Builds and tests an S3Client from config, then sets it on state.
export const setAWSClient = async (config: S3Config): Promise<void> => {
  const client = new S3Client({
    region: config.aws_region,
    credentials: { accessKeyId: config.aws_access, secretAccessKey: config.aws_secret },
  });
  if (!await testAWSClient(client, config.aws_bucket)) {
      throw new Error('getAWSClient: testAWSClient failed');
    }
    state.AWSClient = client;
    state.AWSConfig = config;
    await initS3MasterIndex(); // initialize master index file in s3
  };

// Returns true if the client can list objects in the bucket, false otherwise.
  export const testAWSClient = async (client: S3Client, bucket: string): Promise<boolean> => {
    try {
      await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
      return true;
    } catch (error) {
      return false;
    }
  };