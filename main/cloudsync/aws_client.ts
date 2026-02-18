import { state } from './transact';
import { getConfig } from './aws_config';
import { S3Config } from '../../renderer/lib/types';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { initS3MasterIndex } from './master_index';
import { syncStateMachine, SyncState } from './sync_state';

let S3ClientInitializing = false; // prevent multiple initialization attempts

/**
 * Initializes the S3 client for AWS operations.
 *
 * - Called upon initial app startup.
 * - Triggers the cloud sync pipeline in the background without blocking.
 * - Returns early if already initializing or if the client exists.
 * - Throws an error if the AWS config is invalid.
 *
 * @returns {Promise<void>} Resolves when client initialization completes (sync runs in background).
 */
export const initS3Client = async (): Promise<void> => {
  if (S3ClientInitializing) {
    console.log('initS3Client: S3 client is already initializing, skipping initialization')
    return;
  }

  // if the client is already initialized, skip initialization
  if (state.AWSClient) {
    console.log('initS3Client: S3 client is already initialized, skipping initialization')
    return;
  }

  S3ClientInitializing = true;
  syncStateMachine.setState(SyncState.INITIALIZING);

  try {
    state.AWSConfig = getConfig();
  } catch (error) {
    S3ClientInitializing = false;
    syncStateMachine.setState(SyncState.ERROR);
    console.error('initS3Client: failed to load aws config:', error);
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
    console.error('initS3Client: failed to set aws client:', error);
    throw error;
  }
  S3ClientInitializing = false;
  syncStateMachine.setState(SyncState.READY);
};

/**
 * Validates the AWS configuration by checking if the specified S3 bucket exists.
 * If valid, sets the S3 client on `state`.
 *
 * @param {S3Config} config - The AWS configuration object.
 * @throws Will throw an error if the AWS configuration is invalid.
 * @returns {Promise<void>}
 */
export const setAWSClient = async (config: S3Config): Promise<void> => {
  var client: S3Client;
    try {
      client = new S3Client({
        region: config.aws_region,
        credentials: { accessKeyId: config.aws_access, secretAccessKey: config.aws_secret },
      });
    } catch (error) {
      throw error;
    }
    if (!await testAWSClient(client, config.aws_bucket)) {
      throw new Error('getAWSClient: testAWSClient failed');
    }
    state.AWSClient = client;
    state.AWSConfig = config;
    await initS3MasterIndex(); // initialize master index file in s3
  };

/**
 * Tests whether the provided AWS S3 client can list objects in the specified bucket.
 *
 * @param {S3Client} client - The initialized AWS S3 client.
 * @param {string} bucket - The S3 bucket name to test.
 * @returns {Promise<boolean>} `true` if the client can list objects, otherwise `false`.
 */
  export const testAWSClient = async (client: S3Client, bucket: string): Promise<boolean> => {
    try {
      await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
      return true;
    } catch (error) {
      return false;
    }
  };