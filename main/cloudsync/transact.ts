import { state } from '../cloudSync';
import { Entry } from '../../renderer/lib/types';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { loadLocalMasterIndex, loadS3MasterIndex, syncMasterIndex } from './master_index';
import path from 'node:path';
import fs from 'node:fs';
import { BrowserWindow } from 'electron';

// ----- Master Index Operations (called from renderer process) ----- //
// consider adding 'sync' flag to db updates -> don't write to masterIndex on sync

export const putEntryCloudSync = async (entry: Entry) => {
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

export const deleteEntryCloudSync = async (id: string) => {
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

// getMainWindow returns the main window or null if no window is open
export const getMainWindow = (): BrowserWindow | null => {
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
  };
  
  // idbGetEntryById gets an entry from the IndexedDB
  export const idbGetEntryById = async (id: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('No renderer window available');
    return await mainWindow.webContents.executeJavaScript(`window.idbGetEntryById('${id}')`);
  };
  
  // idbCreateEntry creates an entry in the IndexedDB by executing js in the renderer process
  export const idbCreateEntry = async (id: string, entry: Entry) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('No renderer window available');
    return await mainWindow.webContents.executeJavaScript(`window.idbCreateEntry('${id}', ${JSON.stringify(entry)})`);
  }
  
  // idbUpdateEntry updates an entry in the IndexedDB by executing js in the renderer process
  export const idbUpdateEntry = async (id: string, entry: Entry) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('No renderer window available');
    return await mainWindow.webContents.executeJavaScript(`window.idbUpdateEntry('${id}', ${JSON.stringify(entry)})`);
  };
  
  // idbDeleteEntry deletes an entry from the IndexedDB by executing js in the renderer process
  export const idbDeleteEntry = async (id: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error('No renderer window available');
    return await mainWindow.webContents.executeJavaScript(`window.idbDeleteEntry('${id}')`);
  }