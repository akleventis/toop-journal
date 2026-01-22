import { MasterIndex, S3Config } from '../../renderer/lib/types';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { loadLocalMasterIndex, loadS3MasterIndex, syncMasterIndex } from './master_index';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

/**
 * State object to store the AWS variables to be shared between cloudsync files.
 */
export const state = {
    AWSClient: null as S3Client | null,
    AWSConfig: null as S3Config | null,
    UserDataPath: app.getPath('userData'), 
    MasterIndexFileName: 'masterIndex.json',
}

/**
 * Syncs master indexes & entries between local and S3.
 *
 * @returns {Promise<boolean>} True if the sync was successful, false otherwise.
 * @throws Will throw an error if the AWS config or S3 client is not found.
 */
export const cloudSyncPipeline = async (): Promise<boolean> => {
    if (!state.AWSConfig) {
        throw new Error('no aws config found');
    }

    if (!state.AWSClient) {
        throw new Error('no s3 client found');
    }

    let s3MasterIndex: MasterIndex;
    let localMasterIndex: MasterIndex;

    try {
        localMasterIndex = await loadLocalMasterIndex();
    } catch (error) {
        console.error('failed to load master index:', error);
        throw error;
    }

    try {
        s3MasterIndex = await loadS3MasterIndex();
    } catch (error) {
        console.error('failed to load s3 master index:', error);
        throw error;
    }

    // sync & save local and s3 master indexes
    let merged: MasterIndex;
    try {
        merged = await syncMasterIndex(localMasterIndex, s3MasterIndex);
        fs.writeFileSync(path.join(state.UserDataPath, state.MasterIndexFileName), JSON.stringify(merged, null, 2));
        await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: state.MasterIndexFileName, Body: JSON.stringify(merged) }));
    } catch (error) {
        console.error('failed to sync master index:', error);
        throw error;
    }

    // put local & s3 master index
    try {
        console.log('putting local master index');
        fs.writeFileSync(path.join(state.UserDataPath, state.MasterIndexFileName), JSON.stringify(merged, null, 2));
    } catch (error) {
        console.error('failed to put local & s3 master index:', error);
        throw error;
    }

    try {
        console.log('putting s3 master index');
        await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: state.MasterIndexFileName, Body: JSON.stringify(merged) }));
    } catch (error) {
        console.error('failed to put s3 master index:', error);
        throw error;
    }

    return true;
}

