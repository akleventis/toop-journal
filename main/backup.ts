import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { logger } from './logger';
import { getEntryCount, getSetting, setSetting, hasEntriesModifiedSince } from './db/sqlite';
import type { BackupInfo } from '../shared/types';

const isDev = !app.isPackaged;
const dbFilename = isDev ? 'journal-dev.db' : 'journal.db';
const BACKUP_RETENTION = 30; // days

function getDbPath(): string {
  return path.join(app.getPath('userData'), dbFilename);
}

function getBackupDir(): string {
  return path.join(app.getPath('userData'), 'backups');
}

// Creates a daily backup of the DB. Skips if one already exists for today.
// Prunes backups beyond BACKUP_RETENTION days on each run.
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

  const lastBackupTime = getSetting('lastBackupTime');
  if (lastBackupTime && !hasEntriesModifiedSince(parseInt(lastBackupTime, 10))) {
    logger.info('backup: no entries modified since last backup, skipping');
    return;
  }

  fs.copyFileSync(dbPath, backupPath);
  setSetting('lastBackupTime', String(Date.now()));
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

// Returns all backups sorted newest-first.
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

// Copies a backup file over the live DB. Caller is responsible for relaunching the app.
export function restoreBackup(filename: string): void {
  // prevent path traversal
  if (filename.includes('/') || filename.includes('\\') || !filename.endsWith('.db')) {
    throw new Error('Invalid backup filename');
  }

  const backupPath = path.join(getBackupDir(), filename);
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup not found: ${filename}`);
  }

  // reject empty or corrupt backup before overwriting the live DB
  if (fs.statSync(backupPath).size === 0) {
    throw new Error(`Backup file is empty: ${filename}`);
  }
  let backupDb: Database.Database | null = null;
  try {
    backupDb = new Database(backupPath, { readonly: true });
    const row = backupDb.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    if (row.integrity_check !== 'ok') {
      throw new Error(`Backup failed integrity check: ${row.integrity_check}`);
    }
  } finally {
    backupDb?.close();
  }

  // atomic swap: copy to temp then rename so the live DB is never partially overwritten
  const dbPath = getDbPath();
  const tempPath = `${dbPath}.restore-tmp`;
  fs.copyFileSync(backupPath, tempPath);
  fs.renameSync(tempPath, dbPath);
  logger.info(`backup: restored ${filename}`);
}
