import { Utils } from "electrobun/bun";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";
import { getEntryCount, getSetting, setSetting, hasEntriesModifiedSince } from "./db.js";
import type { BackupInfo } from "../../shared/types.js";

// Electrobun separates dev/prod via userData path, so journal.db is safe for both
const DB_FILENAME = "journal.db";
const BACKUP_RETENTION = 30;

function getDbPath(): string {
  return path.join(Utils.paths.userData, DB_FILENAME);
}

function getBackupDir(): string {
  return path.join(Utils.paths.userData, "backups");
}

export function createBackup(): void {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) { logger.warn("backup: no database found, skipping"); return; }

  const entryCount = getEntryCount();
  if (entryCount === 0) { logger.info("backup: no entries found, skipping"); return; }

  const today = new Date().toISOString().split("T")[0];
  const backupPath = path.join(backupDir, `journal-${today}.db`);

  if (fs.existsSync(backupPath)) { logger.info("backup: already exists for today, skipping"); return; }

  const lastBackupTime = getSetting("lastBackupTime");
  if (lastBackupTime && !hasEntriesModifiedSince(parseInt(lastBackupTime, 10))) {
    logger.info("backup: no entries modified since last backup, skipping");
    return;
  }

  fs.copyFileSync(dbPath, backupPath);
  setSetting("lastBackupTime", String(Date.now()));
  logger.info(`backup: created ${backupPath}`);

  const files = fs.readdirSync(backupDir).filter(f => f.endsWith(".db")).sort();
  if (files.length > BACKUP_RETENTION) {
    for (const file of files.slice(0, files.length - BACKUP_RETENTION)) {
      fs.unlinkSync(path.join(backupDir, file));
      logger.info(`backup: pruned old backup ${file}`);
    }
  }
}

export function listBackups(): BackupInfo[] {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter(f => f.endsWith(".db"))
    .sort()
    .reverse()
    .map(filename => ({
      filename,
      date: filename.replace(/^journal-/, "").replace(".db", ""),
      sizeBytes: fs.statSync(path.join(backupDir, filename)).size,
    }));
}

export function restoreBackup(filename: string): void {
  if (filename.includes("/") || filename.includes("\\") || !filename.endsWith(".db"))
    throw new Error("Invalid backup filename");

  const backupPath = path.join(getBackupDir(), filename);
  if (!fs.existsSync(backupPath)) throw new Error(`Backup not found: ${filename}`);
  if (fs.statSync(backupPath).size === 0) throw new Error(`Backup file is empty: ${filename}`);

  let backupDb: InstanceType<typeof Database> | null = null;
  try {
    backupDb = new Database(backupPath, { readonly: true });
    const row = backupDb.query("PRAGMA integrity_check").get() as { integrity_check: string };
    if (row.integrity_check !== "ok") throw new Error(`Backup failed integrity check: ${row.integrity_check}`);
  } finally {
    backupDb?.close();
  }

  const dbPath = getDbPath();
  const tempPath = `${dbPath}.restore-tmp`;
  fs.copyFileSync(backupPath, tempPath);
  fs.renameSync(tempPath, dbPath);
  logger.info(`backup: restored ${filename}`);
  // TODO: relaunch app — no Electrobun equivalent yet (Step 5)
}
