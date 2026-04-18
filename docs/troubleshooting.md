# Troubleshooting

## Finding Logs

All app activity is logged to daily files at:
```
~/Library/Application Support/toop-journal/logs/app-YYYY-MM-DD.log
```

You can also view logs in-app: **More → View Logs** (streams live, last 200 lines on open).

Renderer errors are forwarded to the log file tagged `[Renderer]`.

---

## Sync Issues

### "Sync error — check your connection or credentials" (red dot in More)

The sync state machine transitioned to `ERROR`. Steps to diagnose:

1. Check **More → View Logs** for the specific error message
2. Verify you have an internet connection
3. Verify AWS credentials: **More → AWS Config → Edit**
   - Access Key and Secret Key must be valid IAM credentials
   - Bucket name must be exact (case-sensitive)
   - Region must match the bucket's actual region (e.g. `us-east-1`)
4. Verify the IAM user has these S3 permissions on the bucket:
   - `s3:GetObject`
   - `s3:PutObject`
   - `s3:DeleteObject`
   - `s3:ListBucket`
5. Try a manual sync: **More → AWS Config → Sync**

### Sync works manually but not on startup

The startup sync runs immediately after `initS3Client()`. If the machine comes online after startup, the `useNetworkSync` hook will re-trigger. If it doesn't:
- Check **More → View Logs** for `initS3Client` or `cloudSyncPipeline` errors around startup time
- Toggling the sync switch off and on in **More → AWS Config** forces a fresh `initS3Client()` call

### Entries missing after sync

1. Check `~/Library/Application Support/toop-journal/masterIndex.json` — if the entry's `deleted` flag is `true`, it was deleted on another device and synced
2. Check the S3 bucket directly (AWS Console or CLI): `aws s3 ls s3://{bucket}/entries/`
3. If the entry exists in S3 but not locally, the masterIndex may be out of sync — check logs for `syncMasterIndex` errors

### Conflicts showing in More

A conflict means the same entry was edited on two devices before syncing. Go to **More → Conflicts**, review each one side-by-side, and pick the version to keep. The other version is discarded.

Conflicts are created conservatively — any timestamp difference with differing content triggers one. After resolving, a sync runs automatically to push the chosen version to S3.

---

## Database Issues

### App won't start / blank screen after crash

The SQLite database may be corrupted. Steps:

1. Check logs: `~/Library/Application Support/toop-journal/logs/`
2. Try restoring a backup: **More → Backups** (if the app launches at all)
3. Manual restore:
   ```bash
   cp ~/Library/Application\ Support/toop-journal/backups/journal-YYYY-MM-DD.db \
      ~/Library/Application\ Support/toop-journal/journal.db
   ```
   Then relaunch the app.
4. If no backup works, check if the masterIndex and S3 entries are intact — you can rebuild the local DB from S3 by deleting `journal.db` and letting a fresh sync recreate entries from S3.

### "No entries found" but entries exist in DB

The renderer memoizes `getDecodedEntries()` per session. If the cache is stale:
- Relaunch the app — the cache is always cleared on startup
- If it happens mid-session after a sync, it's a bug — check logs for DB write errors

### Database locked / SQLITE_BUSY

`better-sqlite3` is synchronous and single-connection. This error shouldn't occur in normal use. If it does:
1. Check for another process accessing the file (e.g. a DB browser app)
2. Check for a crashed process that didn't release the lock: `lsof ~/Library/Application\ Support/toop-journal/journal.db`
3. Relaunch the app

### Entry validation errors

Entries are validated in `main/db/sqlite.ts` before insert. Valid format:
- `id`: lowercase, e.g. `jun.14.2025`
- `date`: e.g. `Jun 14, 2025 at 12:35` (regex-validated)
- `content`: any string (Markdown)
- `timestamp`: milliseconds integer

If importing entries (e.g. via `scripts/import_pdf.py`), malformed dates will be rejected with a validation error in the logs.

---

## Backup and Restore

### Backup not created

Daily backups run on startup. If today's backup is missing:
- The DB file may not have existed yet at startup
- Check logs for `backup:` entries around the startup time
- Backups are skipped (not errors) if one already exists for today

### Restore crashes the app (dev mode only)

In dev mode, `app.relaunch()` + `app.exit(0)` kills the electron process and `concurrently` tears down the entire dev session — this is expected. Restart with `npm run dev` after a restore in dev mode.

In production (packaged), restore works normally: the app relaunches automatically.

### Backups directory

```
~/Library/Application Support/toop-journal/backups/
  journal-2026-04-01.db
  journal-2026-04-02.db
  ...
```

30 most recent backups are retained. Older ones are pruned on startup.

---

## Password Issues

### Forgot password

Password is PBKDF2-SHA512 hashed — it cannot be recovered. To reset:

1. Open a SQLite browser or use the CLI:
   ```bash
   sqlite3 ~/Library/Application\ Support/toop-journal/journal.db \
     "DELETE FROM settings_t WHERE key IN ('passwordHash', 'passwordSalt');"
   ```
2. Relaunch the app — the password overlay will not appear

### Password overlay appears on every launch unexpectedly

The hash/salt is stored in `settings_t`. If a restore was done to a backup that had a password set, the old password will be required. Use the backup that matches when the password was known, or reset via the SQL above.

---

## Log Files

### Logs not appearing in More → View Logs

Logs stream via IPC (`logs:line` channel). If the viewer is blank:
- Check the log file directly: `cat ~/Library/Application\ Support/toop-journal/logs/app-$(date +%Y-%m-%d).log`
- The viewer loads the last 200 lines on open; if no activity has happened today, yesterday's file won't show

### Log files growing too large

Logs are pruned to 30 days on startup. Each day's file is append-only. If a log file is unusually large, check for a repeated error loop in the file.

---

## Common Error Messages

| Message | Cause | Fix |
|---|---|---|
| `no aws config found` | Sync triggered before config was set | Configure AWS in More → AWS Config |
| `no s3 client found` | `initS3Client()` hasn't run yet | Toggle sync off/on in More |
| `loadLocalMasterIndex: local master index file does not exist` | `masterIndex.json` deleted | Relaunch — `initLocalMasterIndex()` recreates it on startup |
| `verifyMasterIndex: masterIndex is not a valid object` | `masterIndex.json` is corrupted | Delete it (`rm .../masterIndex.json`) and relaunch — it will be recreated from S3 on next sync |
| `Entry validation failed` | Entry has malformed date or missing fields | Check the entry format — `date` must match `MMM D, YYYY at HH:MM` |
| `Invalid backup filename` | Attempted path traversal in backup restore | Use the Backups UI, not direct IPC calls |
| `Backup not found` | Backup file was manually deleted | Choose a different backup from the list |
