import { S3Config } from '../../renderer/lib/types';
import path from 'node:path';
import fs from 'node:fs';
import { state } from '../cloudSync';
import { getAWSClient } from './aws_client';

// ----- AWS Configuration ----- //
// /Users/alexleventis/Library/Application Support/Electron/config.json

// getConfig loads the AWS config from the config.json file and returns null if the config is not found or invalid.
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
    return parsed as S3Config;
};

export const createConfig = async (config: S3Config) => {
    if (!isValidAWSConfig(config)) {
        throw new Error('invalid aws config');
    }

    try {
        await getAWSClient(config);
    } catch (error) {
        console.error('failed to create aws config:', error);
        throw error;
    }

    const configPath = path.join(state.UserDataPath, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    return config;
};

export const updateConfig = async (config: S3Config) => {
    console.log('updating aws config:', config)
    if (!isValidAWSConfig(config)) {
        throw new Error('invalid aws config');
    }

    try {
        await getAWSClient(config);
    } catch (error) {
        console.error('failed to update aws config:', error);
        throw error;
    }

    const configPath = path.join(state.UserDataPath, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    return config;
};

export const deleteConfig = async () => {
    const configPath = path.join(state.UserDataPath, 'config.json');
    if (fs.existsSync(configPath)) {
        fs.rmSync(configPath);
    }
    state.AWSClient = null;
    state.AWSConfig = null;
    console.log('aws config deleted')
};

// isValidAWSConfig is a type guard to validate AWSConfig structure
const isValidAWSConfig = (config: unknown): config is S3Config => {
    if (typeof config !== 'object' || config === null) return false;

    return (
        typeof (config as any).aws_access === 'string' && (config as any).aws_access.trim() !== '' &&
        typeof (config as any).aws_secret === 'string' && (config as any).aws_secret.trim() !== '' &&
        typeof (config as any).aws_region === 'string' && (config as any).aws_region.trim() !== '' &&
        typeof (config as any).aws_bucket === 'string' && (config as any).aws_bucket.trim() !== ''
    );
};
