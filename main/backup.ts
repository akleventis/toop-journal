import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger';
import { getEntryCount } from './db/sqlite';

const isDev = !app.isPackaged;
const dbFilename = isDev ? 'journal-dev.db' : 'journal.db';
const BACKUP_RETENTION = 30; // days

function getDbPath(): string {
  return path.join(app.getPath('userData'), dbFilename);
}

function getBackupDir(): string {
  return path.join(app.getPath('userData'), 'backups');
}

/**
 * Creates a daily backup of the DB. Skips if one already exists for today.
 * Prunes backups beyond BACKUP_RETENTION days on each run.
 */
export function createBackup(): void {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    logger.warn('backup: no database found, skipping');
    return;
  }

  const entryCount = getEntryCount();
  if (entryCount === 0) {
    logger.info('backup: no entries found, skipping');
    return;
  }

  const prefix = isDev ? 'journal-dev' : 'journal';
  const today = new Date().toISOString().split('T')[0];
  const backupPath = path.join(backupDir, `${prefix}-${today}.db`);

  if (fs.existsSync(backupPath)) {
    logger.info(`backup: already exists for today, skipping`);
    return;
  }

  fs.copyFileSync(dbPath, backupPath);
  logger.info(`backup: created ${backupPath}`);

  // Prune oldest backups, keep last BACKUP_RETENTION
  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.db'))
    .sort(); // ISO dates sort lexicographically = chronologically

  if (files.length > BACKUP_RETENTION) {
    for (const file of files.slice(0, files.length - BACKUP_RETENTION)) {
      fs.unlinkSync(path.join(backupDir, file));
      logger.info(`backup: pruned old backup ${file}`);
    }
  }
}

export interface BackupInfo {
  filename: string;
  date: string;
  sizeBytes: number;
}

/**
 * Returns all backups sorted newest-first.
 *
 * @returns {BackupInfo[]}
 */
export function listBackups(): BackupInfo[] {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) return [];

  return fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.db'))
    .sort()
    .reverse()
    .map(filename => ({
      filename,
      date: filename.replace(/^journal(-dev)?-/, '').replace('.db', ''),
      sizeBytes: fs.statSync(path.join(backupDir, filename)).size,
    }));
}

/**
 * Copies a backup file over the live DB. Caller is responsible for relaunching the app.
 *
 * @param {string} filename - Backup filename (basename only, no path components).
 * @throws If the filename is invalid or the backup does not exist.
 */
export function restoreBackup(filename: string): void {
  // prevent path traversal
  if (filename.includes('/') || filename.includes('\\') || !filename.endsWith('.db')) {
    throw new Error('Invalid backup filename');
  }

  const backupPath = path.join(getBackupDir(), filename);
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup not found: ${filename}`);
  }

  fs.copyFileSync(backupPath, getDbPath());
  logger.info(`backup: restored ${filename}`);
}
