/**
 * @file aws_config.ts — AWS configuration operations for cloud sync.
 *
 * Handles loading, saving, and deleting AWS configuration data stored in `config.json`.
 *
 * Storage locations:
 * - User data directory: `/Users/{username}/Library/Application Support/Electron/config.json`
 * - Local storage: `/cloudsync/config.json` (gitignored, created after successful cloud sync setup)
 * - S3 storage: `{bucket_name}/config.json` (auto-created upon successful cloud sync configuration)
 *
 * Overview:
 * - Stores AWS access key, secret key, bucket name, and region.
 * - Stored both locally and in S3.
 * - Used to authenticate the AWS client.
 *
 * Example format:
 * ```json
 * {
 *   "aws_access": "your_aws_access_key",
 *   "aws_secret": "your_aws_secret_key",
 *   "aws_bucket": "your_aws_bucket_name",
 *   "aws_region": "your_aws_region"
 * }
 * ```
 */
import { S3Config } from '../../renderer/lib/types';
import path from 'node:path';
import fs from 'node:fs';
import { setAWSClient } from './aws_client';
import { state } from './transact';

/**
 * Loads the AWS configuration from the `config.json` file.
 *
 * @returns {S3Config | null} The loaded configuration, or `null` if not found or invalid.
 * @remarks Callers are responsible for setting `state.AWSConfig` if needed.
 */
export const getConfig = (): S3Config | null => {
    const configPath = path.join(state.UserDataPath, 'config.json');
    if (!fs.existsSync(configPath)) {
        return null;
    }
    const config = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(config);
    if (!isValidAWSConfig(parsed)) {
        return null;
    }
    return parsed;
};

/**
 * Creates a new `config.json` file with the provided AWS configuration.
 * Initializes the AWS client and stores the configuration both in memory and on disk.
 *
 * @param {S3Config} config - The AWS configuration object.
 * @returns {S3Config} The created AWS configuration object.
 */
export const createConfig = async (config: S3Config): Promise<S3Config> => {
    console.log('creating aws config:', config)
    if (!isValidAWSConfig(config)) {
        throw new Error('createConfig: invalid aws config');
    }

    try {
        await setAWSClient(config);
    } catch (error) {
        console.error('createConfig: failed to create aws config:', error);
        throw error;
    }

    const configPath = path.join(state.UserDataPath, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    state.AWSConfig = config;
    return config;
};

/**
 * Updates the existing `config.json` file with the provided AWS configuration.
 * Refreshes the AWS client and updates the configuration in memory and on disk.
 *
 * @param {S3Config} config - The updated AWS configuration object.
 * @returns {S3Config} The updated AWS configuration object.
 */
export const updateConfig = async (config: S3Config): Promise<S3Config> => {
    console.log('updating aws config:', config)
    if (!isValidAWSConfig(config)) {
        throw new Error('updateConfig: invalid aws config');
    }

    try {
        await setAWSClient(config);
    } catch (error) {
        console.error('updateConfig: failed to update aws config:', error);
        throw error;
    }

    const configPath = path.join(state.UserDataPath, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    state.AWSConfig = config;
    return config;
};

/**
 * Deletes the existing `config.json` file from disk.
 *
 * @returns {Promise<void>}
 */
export const deleteConfig = async (): Promise<void> => {
    console.log('deleting aws config')
    const configPath = path.join(state.UserDataPath, 'config.json');
    if (fs.existsSync(configPath)) {
        fs.rmSync(configPath);
    }
    state.AWSClient = null;
    state.AWSConfig = null;
    console.log('aws config deleted')
};

/**
 * Type guard that validates whether the given object conforms to the `S3Config` structure.
 *
 * @param {unknown} config - The object to validate.
 * @returns {config is S3Config} `true` if the object is a valid `S3Config`, otherwise `false`.
 */
const isValidAWSConfig = (config: unknown): config is S3Config => {
    if (typeof config !== 'object' || config === null) return false;

    return (
        typeof (config as any).aws_access === 'string' && (config as any).aws_access.trim() !== '' &&
        typeof (config as any).aws_secret === 'string' && (config as any).aws_secret.trim() !== '' &&
        typeof (config as any).aws_region === 'string' && (config as any).aws_region.trim() !== '' &&
        typeof (config as any).aws_bucket === 'string' && (config as any).aws_bucket.trim() !== ''
    );
};
