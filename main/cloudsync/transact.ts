import { MasterIndex } from '../../shared/types';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { loadLocalMasterIndex, loadS3MasterIndex, syncMasterIndex } from './master_index';
import { getAWSClient, getAWSConfig } from './aws-connection';
import { USER_DATA_PATH, MASTER_INDEX_FILE } from './paths';
import path from 'node:path';
import fs from 'node:fs';
import { syncStateMachine, SyncState } from './sync_state';
import { logger } from '../logger';

let lastSyncTime = 0; // epoch ms; read by health check

export const getLastSyncTime = (): number => lastSyncTime;

// Returns true if an S3 client and config are both ready.
export const isSyncConfigured = (): boolean => !!(getAWSClient() && getAWSConfig());

// Merges local and S3 master indexes, then commits atomically:
// write to temp file → upload to S3 → rename to final (local only commits if S3 succeeds).
export const cloudSyncPipeline = async (): Promise<boolean> => {
    const awsClient = getAWSClient();
    const awsConfig = getAWSConfig();

    if (!awsConfig) throw new Error('no aws config found');
    if (!awsClient) throw new Error('no s3 client found');

    syncStateMachine.setState(SyncState.SYNCING);
    logger.info('cloudSyncPipeline: starting sync');
    const pipelineStart = Date.now();

    let s3MasterIndex: MasterIndex;
    let localMasterIndex: MasterIndex;

    try {
        localMasterIndex = await loadLocalMasterIndex();
    } catch (error) {
        syncStateMachine.setState(SyncState.ERROR);
        logger.error('failed to load master index:', error);
        throw error;
    }

    try {
        s3MasterIndex = await loadS3MasterIndex();
    } catch (error) {
        syncStateMachine.setState(SyncState.ERROR);
        logger.error('failed to load s3 master index:', error);
        throw error;
    }

    // sync & save local and s3 master indexes atomically
    let merged: MasterIndex;
    try {
        merged = await syncMasterIndex(localMasterIndex, s3MasterIndex);

        // write to temporary file first
        const tempPath = path.join(USER_DATA_PATH, `${MASTER_INDEX_FILE}.tmp`);
        const finalPath = path.join(USER_DATA_PATH, MASTER_INDEX_FILE);
        const mergedJSON = JSON.stringify(merged, null, 2);

        logger.debug('writing to temporary master index file');
        fs.writeFileSync(tempPath, mergedJSON);

        // upload to S3
        logger.debug('uploading master index to S3');
        await awsClient.send(new PutObjectCommand({
            Bucket: awsConfig.aws_bucket,
            Key: MASTER_INDEX_FILE,
            Body: JSON.stringify(merged)
        }));

        // only rename if S3 upload succeeded
        logger.debug('committing local master index');
        fs.renameSync(tempPath, finalPath);
    } catch (error) {
        syncStateMachine.setState(SyncState.ERROR);
        logger.error('failed to sync master index:', error);

        // clean up temporary file if it exists
        const tempPath = path.join(USER_DATA_PATH, `${MASTER_INDEX_FILE}.tmp`);
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }

        throw error;
    }

    lastSyncTime = Date.now();
    const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
    logger.info(`cloudSyncPipeline: sync complete in ${elapsed}s`);
    syncStateMachine.setState(SyncState.READY);
    return true;
}

