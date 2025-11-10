/**
 * @file transact.ts — Transaction operations for cloud sync.
 *
 * Contains main pipeline & functions for syncing master indexes & entries between local and S3.
 *
 * Overview:
 * - Transactions are the operations that are performed on s3 & local db, master index, and entries.
 */

import { Entry, MasterIndex, S3Config } from '../../renderer/lib/types';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { loadLocalMasterIndex, loadS3MasterIndex, syncMasterIndex } from './master_index';
import path from 'node:path';
import fs from 'node:fs';
import { app, BrowserWindow } from 'electron';

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
        await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: state.MasterIndexFileName, Body: JSON.stringify(localMasterIndex) }));
        s3MasterIndex = await loadS3MasterIndex();
    } catch (error) {
        console.error('failed to load master index:', error);
        throw error;
    }

    // sync local and s3 master indexes
    let merged: MasterIndex;
    try {
        merged = await syncMasterIndex(localMasterIndex, s3MasterIndex);
        fs.writeFileSync(path.resolve(process.cwd(), 'cloudsync', state.MasterIndexFileName), JSON.stringify(merged, null, 2));
        await state.AWSClient.send(new PutObjectCommand({ Bucket: state.AWSConfig.aws_bucket, Key: state.MasterIndexFileName, Body: JSON.stringify(merged) }));
    } catch (error) {
        console.error('failed to sync master index:', error);
        throw error;
    }

    // put local & s3 master index
    try {
        console.log('putting local master index');
        fs.writeFileSync(path.resolve(process.cwd(), 'cloudsync', state.MasterIndexFileName), JSON.stringify(merged, null, 2));
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

// ----- Master Index Operations (called from renderer process) ----- //

/**
 * Pushes an entry to S3 and updates the local master index.
 *
 * @param {Entry} entry - The entry to push to S3.
 * @returns {Promise<void>}
 * @throws Will throw an error if the S3 client or AWS config is not found, or if the entry is malformed.
 */
export const putEntryCloudSync = async (entry: Entry): Promise<void> => {
    console.log(`putting entry s3 ${entry.id}`);
    if (!state.AWSClient) {
        throw new Error('no s3 client found');
    }

    if (!state.AWSConfig) {
        throw new Error('no aws config found');
    }

    if (!entry.lastModified) {
        throw new Error('entry lastModified is required');
    }

    // push entry to s3
    await state.AWSClient.send(new PutObjectCommand({
        Bucket: state.AWSConfig.aws_bucket,
        Key: `entries/${entry.id}.json`,
        Body: JSON.stringify(entry)
    }));

    // update local master index
    const masterIndex = await loadLocalMasterIndex();
    masterIndex[entry.id] = {
        lastModified: entry.lastModified,
        deleted: false,
    };

    // sync master indexes
    const mergedMasterIndex = await syncMasterIndex(masterIndex, await loadS3MasterIndex());

    // push updated master index to s3
    try {
        console.log('pushing updated master index to s3');
        await state.AWSClient.send(new PutObjectCommand({
            Bucket: state.AWSConfig.aws_bucket,
            Key: state.MasterIndexFileName,
            Body: JSON.stringify(mergedMasterIndex)
        }));
    } catch (error) {
        console.error('failed to sync master indexes:', error);
        throw error;
    }

    // write master index to local filesystem
    try {
        console.log('writing local master index');
        fs.writeFileSync(path.resolve(process.cwd(), 'cloudsync', state.MasterIndexFileName), JSON.stringify(mergedMasterIndex, null, 2));
    } catch (error) {
        console.error('failed to write local master index:', error);
        throw error;
    }
};

/**
 * Deletes an entry from S3 and updates the local master index.
 *
 * @param {string} id - The ID of the entry to delete.
 * @returns {Promise<void>}
 * @throws Will throw an error if the S3 client or AWS config is not found.
 */
export const deleteEntryCloudSync = async (id: string): Promise<void> => {
    console.log(`deleting entry s3 ${id}`);
    if (!state.AWSClient) {
        throw new Error('no s3 client found');
    }

    if (!state.AWSConfig) {
        throw new Error('no aws config found');
    }


    // delete entry from s3
    await state.AWSClient.send(new DeleteObjectCommand({
        Bucket: state.AWSConfig.aws_bucket,
        Key: `entries/${id}.json`
    }));

    // update local master index
    const masterIndex = await loadLocalMasterIndex();
    masterIndex[id] = {
        lastModified: Date.now(),
        deleted: true,
    };

    // sync master indexes
    const mergedMasterIndex = await syncMasterIndex(masterIndex, await loadS3MasterIndex());

    // push updated master index to s3
    try {
        console.log('pushing updated master index to s3');
        await state.AWSClient.send(new PutObjectCommand({
            Bucket: state.AWSConfig.aws_bucket,
            Key: state.MasterIndexFileName,
            Body: JSON.stringify(mergedMasterIndex)
        }));
    } catch (error) {
        console.error('failed to sync master indexes:', error);
        throw error;
    }

    // write master index to local filesystem
    try {
        console.log('writing local master index');
        fs.writeFileSync(path.resolve(process.cwd(), 'cloudsync', state.MasterIndexFileName), JSON.stringify(mergedMasterIndex, null, 2));
    } catch (error) {
        console.error('failed to write local master index:', error);
        throw error;
    }
};

// ----- Local IDB Database operations (db located on the renderer process) ----- //

/**
 * Gets the main window or null if no window is open.
 *
 * @returns {BrowserWindow | null} The main window, or null if no window is open.
 */
export const getMainWindow = (): BrowserWindow | null => {
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
};

/**
 * Gets an entry from the IndexedDB.
 *
 * @param {string} id - The ID of the entry to get.
 * @returns {Promise<Entry | null>} The entry, or null if not found.
 * @throws Will throw an error if the main window is not found.
 */
export const idbGetEntryById = async (id: string): Promise<Entry | null> => {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('No renderer window available');
    const entry = await mainWindow.webContents.executeJavaScript(`window.idbGetEntryById('${id}')`);
    return entry as Entry | null;
};

/**
 * Creates an entry in the IndexedDB by executing js in the renderer process.
 *
 * @param {string} id - The ID of the entry to create.
 * @param {Entry} entry - The entry to create.
 * @returns {Promise<void>}
 * @throws Will throw an error if the main window is not found.
 */
export const idbCreateEntry = async (id: string, entry: Entry): Promise<void> => {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('No renderer window available');
    return await mainWindow.webContents.executeJavaScript(`window.idbCreateEntry('${id}', ${JSON.stringify(entry)})`);
}

/**
 * Updates an entry in the IndexedDB by executing js in the renderer process.
 *
 * @param {string} id - The ID of the entry to update.
 * @param {Entry} entry - The entry to update.
 * @returns {Promise<void>}
 * @throws Will throw an error if the main window is not found.
 */
export const idbUpdateEntry = async (id: string, entry: Entry): Promise<void> => {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('No renderer window available');
    return await mainWindow.webContents.executeJavaScript(`window.idbUpdateEntry('${id}', ${JSON.stringify(entry)})`);
};

/**
 * Deletes an entry from the IndexedDB by executing js in the renderer process.
 *
 * @param {string} id - The ID of the entry to delete.
 * @returns {Promise<void>}
 * @throws Will throw an error if the main window is not found.
 */
export const idbDeleteEntry = async (id: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('No renderer window available');
    return await mainWindow.webContents.executeJavaScript(`window.idbDeleteEntry('${id}')`);
}