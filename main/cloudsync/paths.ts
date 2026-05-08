import { app } from 'electron';
import path from 'node:path';

export const USER_DATA_PATH = app.getPath('userData');
export const MASTER_INDEX_FILE = 'masterIndex.json';
export const MASTER_INDEX_PATH = path.join(USER_DATA_PATH, MASTER_INDEX_FILE);
