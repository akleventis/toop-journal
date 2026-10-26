# Image storage — move images out of entries

Not urgent. A list for a future update, from a read-only look at the live database on Oct 16, 2026
(sizes updated Oct 25).

---

## Where the space goes

| Measure | Value |
|---|---|
| Live database | `com.bookoftoop.app/stable/journal.db`: ~480 MB, 3,164 entries |
| What fills it | 702 base64-encoded images inside 366 entries = ~433 MB. The text, including the full-text index, is under 15 MB. |
| Backups | Daily full-file copies, 30 kept = ~13 GB. The dev build keeps another ~15 GB. |

SQLite isn't the problem; it's the right choice for a single-user, local-first journal. The weight
comes from storing images as base64 text inside `entries_t.content`:

- base64 adds about 33% to every image
- every edit rewrites the whole entry, images included
- every backup copies every image again
- queries that read full content pull the images into memory (`db.ts`: the `SELECT *` over all
  entries at line 70)

## Changes

| Change | Effect |
|---|---|
| Move images into content-addressed files: `userData/media/<sha256>.<ext>` locally and `media/<sha256>` in S3, referenced from the entry as `toop-media://<hash>` and served through a custom protocol | Database goes from ~480 MB to ~15 MB. Images upload once and never change, so later syncs and edits are cheap. |
| Back up with `VACUUM INTO 'backups/journal-YYYY-MM-DD.db'` (or SQLite's backup API) instead of `fs.copyFileSync` (`backup.ts` line 42) | Copying the live file can catch a write half-finished; `VACUUM INTO` gives a consistent, compacted copy |
| Retention: 7 daily + 4 weekly + 6 monthly | About 250 MB in total at ~15 MB per copy |
| Load full content only for the entry being viewed | Lower memory use in Bun and the webview |
| One-time migration script: extract the `data:` URIs, write the files, rewrite and re-upload the 366 affected entries | Reversible if a backup from before the migration is kept |

## Already in place

- New images are downscaled on drop: `compressImage` (`src/bun/image.ts`) converts them to JPEG, max
  2000 px, quality 70. Older entries may still hold full-size images; the migration script can run
  them through the same function.
- S3 bucket versioning is on (Oct 25), so a bad sync can't overwrite the only cloud copy.
- The app's AWS key belongs to a dedicated IAM user that can only reach the journal bucket. A copy
  is in 1Password (Dev › "Book of Toop AWS").
