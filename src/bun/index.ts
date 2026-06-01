import Electrobun, { BrowserView, BrowserWindow, Utils, ContextMenu, ApplicationMenu } from "electrobun/bun";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import type { AppRPC } from "../../shared/rpc-schema.js";
import * as db from "./db.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "./logger.js";
import { createBackup, listBackups, restoreBackup } from "./backup.js";
import { hashPassword, verifyPassword } from "./security.js";
import { syncStateMachine, SyncState } from "./cloudsync/sync_state.js";
import { initS3Client, createConfig, updateConfig, deleteConfig, disableSync, getConfig, getAWSClient, getAWSConfig } from "./cloudsync/aws-connection.js";
import { cloudSyncPipeline, isSyncConfigured, getLastSyncTime } from "./cloudsync/transact.js";
import { initLocalMasterIndex, loadLocalMasterIndex } from "./cloudsync/master_index.js";
import { awaitCurrentSync, isSyncInFlight } from "./cloudsync/sync_coordinator.js"; // registers dbEvents listeners as side effect

ApplicationMenu.setApplicationMenu([
  {
    label: "Book of Toop",
    submenu: [
      { role: "hide" },
      { type: "separator" },
      { label: "Quit", action: "appQuit", accelerator: "cmd+q" },
    ],
  },
  {
    label: "Window",
    submenu: [
      { label: "Close", action: "closeWindow", accelerator: "w" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
]);

ApplicationMenu.on("application-menu-clicked", (event: any) => {
  if (event?.data?.action === "appQuit" || event?.data?.action === "closeWindow") handleClose();
});

const userData = Utils.paths.userData;
logger.info(`userData: ${userData}`);
logger.info(`db: ${userData}/journal.db`);
logger.info(`logs: ${userData}/logs`);
createBackup();
initLocalMasterIndex().catch(err => logger.error("initLocalMasterIndex failed:", err));
initS3Client().catch(err => logger.error("initS3Client failed:", err));

const rpc = BrowserView.defineRPC<AppRPC>({
  maxRequestTime: 120000,
  handlers: {
    requests: {
      // ── cloud sync ────────────────────────────────────────────────────────
      cloudSyncInitS3Client:  async () => initS3Client(),
      cloudSyncPipeline:      async () => cloudSyncPipeline(),
      cloudSyncCreateConfig:  async ({ config }) => createConfig(config),
      cloudSyncUpdateConfig:  async ({ config }) => updateConfig(config),
      cloudSyncDeleteConfig:  async () => deleteConfig(),
      cloudSyncDisableSync:   () => disableSync(),
      cloudSyncGetConfig:     () => getConfig(),

      // ── sqlite ────────────────────────────────────────────────────────────
      sqliteGetEntries:                 ({ limit })               => db.getEntries(limit),
      sqliteGetEntriesForList:          ({ limit })               => db.getEntriesForList(limit),
      sqliteGetAdjacentEntry:           ({ id, direction })       => db.getAdjacentEntry(id, direction),
      sqliteGetEntryById:               ({ id })                  => db.getEntryById(id),
      sqliteGetMostRecentEntry:         ()                        => db.getMostRecentEntry(),
      sqliteGetEntryCount:              ()                        => db.getEntryCount(),
      sqliteSearchEntries:              ({ query, limit })        => db.searchEntries(query, limit),
      sqliteGetEntriesBetweenTimestamps:({ startTs, endTs })      => db.getEntriesBetweenTimestamps(startTs, endTs),
      sqliteCreateEntry:                ({ entry })               => db.createEntry(entry),
      sqliteUpdateEntry:                ({ id, entry })           => db.updateEntry(id, entry),
      sqliteDeleteEntry:                ({ id })                  => db.deleteEntry(id),
      sqliteGetPasswordHash:            ()                        => db.getPasswordHash(),
      sqliteSetPasswordHash:            ({ passwordHash })        => db.setPasswordHash(passwordHash),
      sqliteGetPasswordSalt:            ()                        => db.getPasswordSalt(),
      sqliteSetPasswordSalt:            ({ passwordSalt })        => db.setPasswordSalt(passwordSalt),
      sqliteClearPasswordCredentials:   ()                        => db.clearPasswordCredentials(),
      sqliteGetSetting:                 ({ key })                 => db.getSetting(key),
      sqliteSetSetting:                 ({ key, value })          => db.setSetting(key, value),

      // ── security ──────────────────────────────────────────────────────────
      securityHashPassword:   ({ password })              => hashPassword(password),
      securityVerifyPassword: ({ password, hash, salt })  => verifyPassword(password, hash, salt),

      // ── misc ──────────────────────────────────────────────────────────────
      dialogShowError: async ({ message }) => {
        await Utils.showMessageBox({ type: "error", title: "Error", message, buttons: ["OK"] });
      },
      syncStateGetState: () => syncStateMachine.getState(),
      backupList:   () => listBackups(),
      backupRestore: async ({ filename }) => {
        restoreBackup(filename);
        await Utils.showMessageBox({
          type: "info", title: "Restore Complete",
          message: "Backup restored. Please relaunch the app to apply changes.",
          buttons: ["Quit"],
        });
        Utils.quit();
      },
      logsGetRecent: () => logger.getRecentLines(),
      utilsSaveToDownloads: async ({ filename, content, encoding }) => {
        const safeName = path.basename(filename);
        if (!safeName || safeName.startsWith('.') || safeName.includes('\0')) throw new Error('invalid filename');
        const downloadsDir = path.resolve(os.homedir(), 'Downloads');
        const filePath = path.resolve(downloadsDir, safeName);
        if (path.dirname(filePath) !== downloadsDir) throw new Error('path escapes Downloads');
        const data = encoding === 'base64' ? Buffer.from(content, 'base64') : content;
        await Bun.write(filePath, data);
        return { path: filePath };
      },
      utilsRevealInFinder: ({ path: filePath }) => { Bun.spawn(['open', '-R', filePath]); },
      healthRun: async () => {
        const awsClient = getAWSClient();
        const awsConfig = getAWSConfig();
        const [masterIndexIntegrity, s3Connectivity, diskSpace] = await Promise.all([
          loadLocalMasterIndex().then(() => true).catch(() => false),
          awsClient && awsConfig
            ? awsClient.send(new HeadBucketCommand({ Bucket: awsConfig.aws_bucket })).then(() => true).catch(() => false)
            : Promise.resolve(null),
          (fs.promises as any).statfs(Utils.paths.userData).then((s: any) => s.bavail * s.bsize).catch(() => -1),
        ]);
        return {
          databaseIntegrity: db.integrityCheck(),
          masterIndexIntegrity,
          s3Connectivity,
          diskSpace,
          lastSyncTime: getLastSyncTime(),
        };
      },
    },
    messages: {
      logsError: ({ data }) => logger.error(`[renderer] ${data}`),
      setDirty:  ({ data }) => { isDirty = data; },
      showContextMenu: ({ data: { isEditable, hasSelection } }) => {
        if (!isEditable && !hasSelection) return;
        const items: Parameters<typeof ContextMenu.showContextMenu>[0] = [];
        if (isEditable) {
          items.push({ role: "cut" }, { role: "copy" }, { role: "paste" });
        } else {
          items.push({ role: "copy" });
        }
        ContextMenu.showContextMenu(items);
      },
    },
  },
});

let isDirty = false;
let isQuitting = false;

const mainWindow = new BrowserWindow({
  title: "Book of Toop",
  url: "views://mainview/index.html",
  rpc,
  frame: { width: 600, height: 750, x: 100, y: 100 },
  styleMask: { Closable: false },
});

// guard: webview RPC is unavailable until the view has loaded
function push(fn: () => void): void {
  try { if (mainWindow?.webview?.rpc?.proxy?.send) fn(); } catch { /* webview not ready */ }
}

const send = () => mainWindow.webview!.rpc!.proxy.send;

// wire logger push to renderer
logger.setPushFn(line => push(() => send().logsLine({ data: line })));

// invalidation signal: tells renderer to re-fetch entries; payload is intentionally empty
db.dbEvents.on("entry:created",  () => push(() => send().entriesChanged({ data: {} })));
db.dbEvents.on("entry:updated",  () => push(() => send().entriesChanged({ data: {} })));
db.dbEvents.on("entry:deleted",  () => push(() => send().entriesChanged({ data: {} })));
db.dbEvents.on("sync:complete",  () => push(() => send().entriesChanged({ data: {} })));

// push sync state changes
syncStateMachine.onStateChange(state =>
  push(() => send().syncStateChanged({ data: state }))
);

// maintenance
setTimeout(() => {
  if (!db.isMaintenanceDue()) return;
  push(() => send().maintenanceStatus({ data: true }));
  setTimeout(() => {
    db.runMaintenance();
    push(() => send().maintenanceStatus({ data: false }));
  }, 500);
}, 5000);

const QUIT_SYNC_TIMEOUT_MS = 5000;

Electrobun.events.on("reopen", () => {
  mainWindow.show();
});

// cmd+w / cmd+q: check dirty BEFORE touching the window so it stays open on cancel.
function handleClose(): void {
  if (isQuitting) return;
  if (isDirty) {
    Utils.showMessageBox({
      type: "question",
      title: "Unsaved Changes",
      message: "Your changes will be lost if you quit now.",
      buttons: ["Discard & Quit", "Cancel"],
      cancelId: 1,
    }).then(({ response }: { response: number }) => {
      if (response === 0) { isDirty = false; Utils.quit(); }
      // Cancel: do nothing — window stays open
    });
    return;
  }
  Utils.quit();
}

Electrobun.events.on("before-quit", (event: any) => {
  if (isQuitting) return;

  if (isSyncConfigured()) {
    // skip if no local changes since last sync and no sync currently running
    // note: hasEntriesModifiedSince can't detect deletions (rows are gone), so isSyncInFlight guards that case
    if (getLastSyncTime() > 0 && !db.hasEntriesModifiedSince(getLastSyncTime()) && !isSyncInFlight()) {
      logger.info("before-quit: no changes since last sync, skipping");
      return;
    }
    isQuitting = true;
    event.response = { allow: false };
    logger.info("[SHUTDOWN] shutting down...");
    push(() => send().quitting({ data: {} }));
    const syncWork = isSyncInFlight()
      ? awaitCurrentSync()  // in-flight sync covers the pending change; no extra timeout
      : Promise.race([
          cloudSyncPipeline(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("sync timeout after 5s")), QUIT_SYNC_TIMEOUT_MS)
          ),
        ]);
    syncWork
      .then(() => logger.info("before-quit: sync complete"))
      .catch(err => logger.error("before-quit: sync error:", err))
      .finally(() => Utils.quit());
  }
});

