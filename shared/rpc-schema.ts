import type { RPCSchema } from "electrobun/bun";
import type { Entry, S3Config, SyncState, BackupInfo, HealthCheck } from "./types.js";

export type AppRPC = {
  // renderer -> main
  bun: RPCSchema<{
    requests: {
      // cloud sync
      cloudSyncInitS3Client:  { params: Record<string, never>; response: void };
      cloudSyncPipeline:      { params: Record<string, never>; response: void };
      cloudSyncCreateConfig:  { params: { config: S3Config }; response: S3Config };
      cloudSyncUpdateConfig:  { params: { config: S3Config }; response: S3Config };
      cloudSyncDeleteConfig:  { params: Record<string, never>; response: void };
      cloudSyncDisableSync:   { params: Record<string, never>; response: void };
      cloudSyncGetConfig:     { params: Record<string, never>; response: S3Config | null };
      // sqlite
      sqliteGetEntries:                 { params: { limit?: number }; response: Entry[] };
      sqliteGetEntriesForList:          { params: { limit?: number }; response: Entry[] };
      sqliteGetAdjacentEntry:           { params: { id: string; direction: "prev" | "next" }; response: { id: string } | null };
      sqliteGetEntryById:               { params: { id: string }; response: Entry | null };
      sqliteGetMostRecentEntry:         { params: Record<string, never>; response: Entry | null };
      sqliteGetEntryCount:              { params: Record<string, never>; response: number };
      sqliteSearchEntries:              { params: { query: string; limit?: number }; response: Entry[] };
      sqliteGetEntriesBetweenTimestamps:{ params: { startTs: number; endTs: number }; response: Entry[] };
      sqliteCreateEntry:                { params: { entry: Entry }; response: void };
      sqliteUpdateEntry:                { params: { id: string; entry: Entry }; response: void };
      sqliteDeleteEntry:                { params: { id: string }; response: void };
      sqliteGetPasswordHash:            { params: Record<string, never>; response: string | null };
      sqliteSetPasswordHash:            { params: { passwordHash: string }; response: void };
      sqliteGetPasswordSalt:            { params: Record<string, never>; response: string | null };
      sqliteSetPasswordSalt:            { params: { passwordSalt: string }; response: void };
      sqliteClearPasswordCredentials:   { params: Record<string, never>; response: void };
      sqliteGetSetting:                 { params: { key: string }; response: string | null };
      sqliteSetSetting:                 { params: { key: string; value: string }; response: void };
      // security
      securityHashPassword:   { params: { password: string }; response: { hash: string; salt: string } };
      securityVerifyPassword: { params: { password: string; hash: string; salt: string }; response: boolean };
      // misc
      dialogShowError:  { params: { message: string }; response: void };
      syncStateGetState:{ params: Record<string, never>; response: SyncState };
      backupList:       { params: Record<string, never>; response: BackupInfo[] };
      backupRestore:    { params: { filename: string }; response: void };
      logsGetRecent:    { params: Record<string, never>; response: string[] };
      healthRun:        { params: Record<string, never>; response: HealthCheck };
      utilsSaveToDownloads: { params: { filename: string; content: string; encoding: 'utf8' | 'base64' }; response: { path: string } };
      utilsRevealInFinder:  { params: { path: string }; response: void };
      utilsCompressImage:   { params: { content: string; ext: string }; response: { dataUrl: string } };
    };
    messages: {
      logsError:       { data: string };
      setDirty:        { data: boolean };
      showContextMenu: { data: { isEditable: boolean; hasSelection: boolean } };
    };
  }>;
  // main -> renderer
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: {
      entriesChanged:    { data: Record<string, never> };
      syncStateChanged:  { data: SyncState };
      logsLine:          { data: string };
      maintenanceStatus: { data: boolean };
      quitting:          { data: Record<string, never> };
    };
  }>;
};
