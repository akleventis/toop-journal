/**
 * @file aws_client.ts — AWS client operations for cloud sync.
 *
 * Provides functions for initializing the S3 client and verifying AWS configuration.
 *
 * Overview:
 * - The S3 client is used to interact with the AWS S3 API.
 * - The AWS config authenticates the S3 client.
 * - The S3 client is initialized on app startup and used throughout the cloud sync process.
 */

import { state } from './transact';
import { getConfig } from './aws_config';
import { S3Config } from '../../renderer/lib/types';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { cloudSyncPipeline } from './transact';

let S3ClientInitializing = false; // prevent multiple initialization attempts

/**
 * Initializes the S3 client for AWS operations.
 *
 * - Called upon initial app startup.
 * - Triggers the cloud sync pipeline.
 * - Returns early if already initializing or if the client exists.
 * - Throws an error if the AWS config is invalid.
 *
 * @returns {Promise<void>} Resolves when initialization completes.
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

  try {
    state.AWSConfig = getConfig();
  } catch (error) {
    S3ClientInitializing = false;
    console.error('initS3Client: failed to load aws config:', error);
    throw error;
  }

  try {
    if (!state.AWSConfig) {
      throw new Error('initS3Client: failed to load aws config');
    }
    await setAWSClient(state.AWSConfig);
  } catch (error) {
    S3ClientInitializing = false;
    console.error('initS3Client: failed to set aws client:', error);
    throw error;
  }
  S3ClientInitializing = false;

  try {
    console.log("initS3Client: calling cloudSyncPipeline")
    await cloudSyncPipeline()
  } catch (error) {
    console.error('initS3Client: failed to sync cloud on init:', error);
    throw error;
  }
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