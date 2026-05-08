import { S3Config } from '../../shared/types';
import path from 'node:path';
import fs from 'node:fs';
import { setAWSClient } from './aws_client';
import { state } from './transact';
import { syncStateMachine, SyncState } from './sync_state';
import { logger } from '../logger';

// Loads the AWS configuration from config.json. Returns null if not found or invalid.
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

// Validates credentials, initializes the AWS client, and writes config.json.
async function saveConfig(config: S3Config, label: string): Promise<S3Config> {
    if (!isValidAWSConfig(config)) {
        throw new Error(`${label}: invalid aws config`);
    }

    syncStateMachine.setState(SyncState.INITIALIZING);
    try {
        await setAWSClient(config);
    } catch (error) {
        syncStateMachine.setState(SyncState.ERROR);
        logger.error(`${label}: failed to save aws config:`, error);
        throw error;
    }

    fs.writeFileSync(path.join(state.UserDataPath, 'config.json'), JSON.stringify(config));
    syncStateMachine.setState(SyncState.READY);
    return config;
}

export const createConfig = async (config: S3Config): Promise<S3Config> => {
    logger.info('createConfig: saving new AWS config');
    return saveConfig(config, 'createConfig');
};

export const updateConfig = async (config: S3Config): Promise<S3Config> => {
    logger.info('updateConfig: updating AWS config');
    return saveConfig(config, 'updateConfig');
};

// Clears the S3 client from memory without removing credentials from disk.
export const disableSync = (): void => {
    state.AWSClient = null;
    state.AWSConfig = null;
    syncStateMachine.setState(SyncState.DISABLED);
};

// Deletes config.json from disk and clears the client from memory.
export const deleteConfig = async (): Promise<void> => {
    logger.info('deleteConfig: deleting AWS config')
    const configPath = path.join(state.UserDataPath, 'config.json');
    if (fs.existsSync(configPath)) {
        fs.rmSync(configPath);
    }
    state.AWSClient = null;
    state.AWSConfig = null;
    syncStateMachine.setState(SyncState.DISABLED);
    logger.info('deleteConfig: AWS config deleted')
};

// Type guard for S3Config.
const isValidAWSConfig = (config: unknown): config is S3Config => {
    if (typeof config !== 'object' || config === null) return false;

    return (
        typeof (config as any).aws_access === 'string' && (config as any).aws_access.trim() !== '' &&
        typeof (config as any).aws_secret === 'string' && (config as any).aws_secret.trim() !== '' &&
        typeof (config as any).aws_region === 'string' && (config as any).aws_region.trim() !== '' &&
        typeof (config as any).aws_bucket === 'string' && (config as any).aws_bucket.trim() !== ''
    );
};
