import { MasterIndex, S3Config } from '../../shared/types';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { loadLocalMasterIndex, loadS3MasterIndex, syncMasterIndex } from './master_index';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { syncStateMachine, SyncState } from './sync_state';
import { logger } from '../logger';

// Shared mutable state for all cloudsync modules. AWSClient and AWSConfig are null until initS3Client succeeds.
export const state = {
    AWSClient: null as S3Client | null,
    AWSConfig: null as S3Config | null,
    UserDataPath: app.getPath('userData'),
    MasterIndexFileName: 'masterIndex.json',
    lastSyncTime: 0, // epoch ms; read by health check
}

// Merges local and S3 master indexes, then commits atomically:
// write to temp file → upload to S3 → rename to final (local only commits if S3 succeeds).
export const cloudSyncPipeline = async (): Promise<boolean> => {
    if (!state.AWSConfig) {
        throw new Error('no aws config found');
    }

    if (!state.AWSClient) {
        throw new Error('no s3 client found');
    }

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
        const tempPath = path.join(state.UserDataPath, `${state.MasterIndexFileName}.tmp`);
        const finalPath = path.join(state.UserDataPath, state.MasterIndexFileName);
        const mergedJSON = JSON.stringify(merged, null, 2);

        logger.debug('writing to temporary master index file');
        fs.writeFileSync(tempPath, mergedJSON);

        // upload to S3
        logger.debug('uploading master index to S3');
        await state.AWSClient.send(new PutObjectCommand({
            Bucket: state.AWSConfig.aws_bucket,
            Key: state.MasterIndexFileName,
            Body: JSON.stringify(merged)
        }));

        // only rename if S3 upload succeeded
        logger.debug('committing local master index');
        fs.renameSync(tempPath, finalPath);
    } catch (error) {
        syncStateMachine.setState(SyncState.ERROR);
        logger.error('failed to sync master index:', error);

        // clean up temporary file if it exists
        const tempPath = path.join(state.UserDataPath, `${state.MasterIndexFileName}.tmp`);
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }

        throw error;
    }

    state.lastSyncTime = Date.now();
    const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
    logger.info(`cloudSyncPipeline: sync complete in ${elapsed}s`);
    syncStateMachine.setState(SyncState.READY);
    return true;
}

