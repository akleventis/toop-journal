import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { state } from './cloudsync/transact';
import { logger } from './logger';
import { integrityCheck } from './db/sqlite';
import { HealthCheck } from '../shared/types';

// Runs SQLite PRAGMA integrity_check. Returns false on failure or error.
async function checkDatabaseIntegrity(): Promise<boolean> {
    try {
        return integrityCheck();
    } catch (error) {
        logger.error('Health check: DB integrity check failed:', error);
        return false;
    }
}

// Validates that masterIndex.json exists and parses as a non-null object.
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

// Checks S3 bucket reachability. Returns null if sync is disabled.
async function checkS3Connectivity(): Promise<boolean | null> {
    if (!state.AWSClient || !state.AWSConfig) return null;
    try {
        await state.AWSClient.send(new HeadBucketCommand({ Bucket: state.AWSConfig.aws_bucket }));
        return true;
    } catch {
        return false;
    }
}

// Returns available disk bytes in userData, or -1 on error.
async function checkDiskSpace(): Promise<number> {
    try {
        const userDataPath = app.getPath('userData');
        const stats = await (fs.promises as any).statfs(userDataPath);
        return stats.bavail * stats.bsize;
    } catch (error) {
        logger.error('Health check: disk space check failed:', error);
        return -1;
    }
}

// Runs all health checks in parallel and returns the results.
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
