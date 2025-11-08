import { state } from '../cloudSync';
import { getConfig } from './aws_config';
import { S3Config } from '../../renderer/lib/types';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

// ----- S3 Initialization Operations ----- //

let S3ClientInitializing = false; // prevent multiple initialization attempts

// initializes the S3 client for aws operations. Returns early if already initializing
// or if client exists. Requires valid aws config.
export const initS3Client = async (): Promise<void> => {
  if (S3ClientInitializing) {
    console.log('S3 client is already initializing, skipping initialization')
    return;
  }

  // if the client is already initialized, skip initialization
  if (state.AWSClient) {
    console.log('S3 client is already initialized, skipping initialization')
    return;
  }

  S3ClientInitializing = true;

  try {
    state.AWSConfig = getConfig();
  } catch (error) {
    S3ClientInitializing = false;
    console.error('failed to load aws config:', error);
    throw error;
  }

  try {
    if (!state.AWSConfig) {
      throw new Error('failed to load aws config');
    }
    state.AWSClient = await getAWSClient(state.AWSConfig);
    if (!state.AWSClient) {
      throw new Error('failed to get initialized s3 client');
    }
  } catch (error) {
    S3ClientInitializing = false;
    console.error('failed to get initialized s3 client:', error);
    throw error;
  }

  S3ClientInitializing = false;

  try {
    console.log("calling cloudSyncPipeline")
    // await cloudSyncPipeline()
  } catch (error) {
    console.error('failed to sync cloud on init:', error);
    throw error;
  }
};

// getAWSClient tests if the AWS config is valid by checking if the bucket exists and returns the S3 client if it is. Throws an error if the config is invalid.
export const getAWSClient = async (config: S3Config): Promise<S3Client> => {
    try {
      const client = new S3Client({
        region: config.aws_region,
        credentials: { accessKeyId: config.aws_access, secretAccessKey: config.aws_secret },
      });
      await client.send(new ListObjectsV2Command({ Bucket: config.aws_bucket, MaxKeys: 1 }));
      return client;
    } catch (error) {
      throw error;
    }
  };