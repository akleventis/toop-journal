import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { state } from './cloudsync/transact';
import { logger } from './logger';
import { integrityCheck } from './db/sqlite';
import { HealthCheck } from '../shared/types';

async function checkDatabaseIntegrity(): Promise<boolean> {
    try {
        return integrityCheck();
    } catch (error) {
        logger.error('Health check: DB integrity check failed:', error);
        return false;
    }
}

async function checkMasterIndexIntegrity(): Promise<boolean> {
    const masterIndexPath = path.join(app.getPath('userData'), 'masterIndex.json');
    try {
        const content = fs.readFileSync(masterIndexPath, 'utf-8');
        const parsed = JSON.parse(content);
        return typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null;
    } catch {
        return false;
    }
}

async function checkS3Connectivity(): Promise<boolean | null> {
    if (!state.AWSClient || !state.AWSConfig) return null;
    try {
        await state.AWSClient.send(new HeadBucketCommand({ Bucket: state.AWSConfig.aws_bucket }));
        return true;
    } catch {
        return false;
    }
}

async function checkDiskSpace(): Promise<number> {
    try {
        const userDataPath = app.getPath('userData');
        // fs.promises.statfs available in Node.js 19.6+ (Electron 28+)
        const stats = await (fs.promises as any).statfs(userDataPath);
        return stats.bavail * stats.bsize;
    } catch (error) {
        logger.error('Health check: disk space check failed:', error);
        return -1;
    }
}

export async function runHealthCheck(): Promise<HealthCheck> {
    const [databaseIntegrity, masterIndexIntegrity, s3Connectivity, diskSpace] = await Promise.all([
        checkDatabaseIntegrity(),
        checkMasterIndexIntegrity(),
        checkS3Connectivity(),
        checkDiskSpace(),
    ]);

    return {
        databaseIntegrity,
        masterIndexIntegrity,
        s3Connectivity,
        diskSpace,
        lastSyncTime: state.lastSyncTime,
    };
}
