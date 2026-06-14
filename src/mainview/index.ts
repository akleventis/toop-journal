import Electrobun, { Electroview } from "electrobun/view";
import type { AppRPC } from "../../shared/rpc-schema.js";
import type { SyncState } from "../../shared/types.js";

// callback registries for push events from bun
const entriesChangedCallbacks  = new Set<() => void>();
const syncStateCallbacks        = new Set<(s: SyncState) => void>();
const logsLineCallbacks         = new Set<(line: string) => void>();
const maintenanceCallbacks      = new Set<(running: boolean) => void>();
const quittingCallbacks         = new Set<() => void>();

const rpc = Electroview.defineRPC<AppRPC>({
  maxRequestTime: 15000,
  handlers: {
    requests: {},
    messages: {
      entriesChanged:    ()                          => entriesChangedCallbacks.forEach(cb => cb()),
      syncStateChanged:  ({ data: state })           => syncStateCallbacks.forEach(cb => cb(state as SyncState)),
      logsLine:          ({ data: line })            => logsLineCallbacks.forEach(cb => cb(line as string)),
      maintenanceStatus: ({ data: running })         => maintenanceCallbacks.forEach(cb => cb(running as boolean)),
      quitting:          ()                          => quittingCallbacks.forEach(cb => cb()),
    },
  },
});

new Electrobun.Electroview({ rpc });

// Populate window.* globals matching interface.d.ts — all renderer code runs unchanged
const w = window as any;

w.network = {
  onStatusChange: (callback: (online: boolean) => void) => {
    window.addEventListener("online",  () => callback(true));
    window.addEventListener("offline", () => callback(false));
  },
  isOnline: () => navigator.onLine,
};

w.sqlite = {
  getEntries:                  (limit?: number)                    => rpc.request.sqliteGetEntries({ limit }),
  getEntriesForList:           (limit?: number)                    => rpc.request.sqliteGetEntriesForList({ limit }),
  getAdjacentEntry:            (id: string, direction: string)     => rpc.request.sqliteGetAdjacentEntry({ id, direction: direction as "prev" | "next" }),
  getEntryById:                (id: string)                        => rpc.request.sqliteGetEntryById({ id }),
  getMostRecentEntry:          ()                                  => rpc.request.sqliteGetMostRecentEntry({}),
  getEntryCount:               ()                                  => rpc.request.sqliteGetEntryCount({}),
  searchEntries:               (query: string, limit?: number)     => rpc.request.sqliteSearchEntries({ query, limit }),
  getEntriesBetweenTimestamps: (startTs: number, endTs: number)    => rpc.request.sqliteGetEntriesBetweenTimestamps({ startTs, endTs }),
  createEntry:                 (entry: any)                        => rpc.request.sqliteCreateEntry({ entry }),
  updateEntry:                 (id: string, entry: any)            => rpc.request.sqliteUpdateEntry({ id, entry }),
  deleteEntry:                 (id: string)                        => rpc.request.sqliteDeleteEntry({ id }),
  getPasswordHash:             ()                                  => rpc.request.sqliteGetPasswordHash({}),
  setPasswordHash:             (passwordHash: string)              => rpc.request.sqliteSetPasswordHash({ passwordHash }),
  getPasswordSalt:             ()                                  => rpc.request.sqliteGetPasswordSalt({}),
  setPasswordSalt:             (passwordSalt: string)              => rpc.request.sqliteSetPasswordSalt({ passwordSalt }),
  clearPasswordCredentials:    ()                                  => rpc.request.sqliteClearPasswordCredentials({}),
  getSetting:                  (key: string)                       => rpc.request.sqliteGetSetting({ key }),
  setSetting:                  (key: string, value: string)        => rpc.request.sqliteSetSetting({ key, value }),
  onEntriesChanged: (callback: () => void) => {
    entriesChangedCallbacks.add(callback);
    return () => entriesChangedCallbacks.delete(callback);
  },
};

w.cloudSync = {
  initS3Client:      ()            => rpc.request.cloudSyncInitS3Client({}),
  cloudSyncPipeline: ()            => rpc.request.cloudSyncPipeline({}),
  createConfig:      (config: any) => rpc.request.cloudSyncCreateConfig({ config }),
  updateConfig:      (config: any) => rpc.request.cloudSyncUpdateConfig({ config }),
  deleteConfig:      ()            => rpc.request.cloudSyncDeleteConfig({}),
  disableSync:       ()            => rpc.request.cloudSyncDisableSync({}),
  getConfig:         ()            => rpc.request.cloudSyncGetConfig({}),
};

w.security = {
  hashPassword:   (password: string)                              => rpc.request.securityHashPassword({ password }),
  verifyPassword: (password: string, hash: string, salt: string)  => rpc.request.securityVerifyPassword({ password, hash, salt }),
};

w.syncState = {
  getState: () => rpc.request.syncStateGetState({}),
  onStateChange: (callback: (state: SyncState) => void) => {
    syncStateCallbacks.add(callback);
    return () => syncStateCallbacks.delete(callback);
  },
};

w.dialog  = { showError: (message: string) => rpc.request.dialogShowError({ message }) };
w.backup  = {
  list:    ()                 => rpc.request.backupList({}),
  restore: (filename: string) => rpc.request.backupRestore({ filename }),
};
w.health  = { run: () => rpc.request.healthRun({}) };

w.logs = {
  getRecent: () => rpc.request.logsGetRecent({}),
  onLine: (callback: (line: string) => void) => {
    logsLineCallbacks.add(callback);
    return () => logsLineCallbacks.delete(callback);
  },
  error: (msg: string) => rpc.send.logsError({ data: msg }),
};

w.appState = {
  setDirty: (dirty: boolean) => rpc.send.setDirty({ data: dirty }),
  onQuitting: (callback: () => void) => {
    quittingCallbacks.add(callback);
    return () => quittingCallbacks.delete(callback);
  },
};

document.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement;
  const isEditable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
    (target as HTMLElement).isContentEditable;
  // Let native WKWebView menu handle editable areas — it includes spell-check suggestions,
  // "Add to Dictionary", cut/copy/paste. Showing a custom NSMenu would replace it.
  if (isEditable) return;
  const hasSelection = (window.getSelection()?.toString().length ?? 0) > 0;
  rpc.send.showContextMenu({ data: { isEditable, hasSelection } });
});
w.maintenance = {
  onStatus: (callback: (running: boolean) => void) => {
    maintenanceCallbacks.add(callback);
    return () => maintenanceCallbacks.delete(callback);
  },
};

w.utils = {
  saveToDownloads: (filename: string, content: string, encoding: 'utf8' | 'base64') =>
    rpc.request.utilsSaveToDownloads({ filename, content, encoding }),
  revealInFinder: (path: string) => rpc.request.utilsRevealInFinder({ path }),
};
