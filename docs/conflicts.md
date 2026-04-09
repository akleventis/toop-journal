# Cloud Sync

See `docs/aws_setup.md` for setup instructions and `docs/architecture.md` for the full sync pipeline diagram.

---

## Conflict Resolution

A conflict is created when the **same entry is modified on two devices before syncing** — i.e., both local and S3 have different `lastModified` timestamps AND the content of the two versions differs.

### Detection (in `syncMasterIndex`)

```
localIndex.lastModified !== s3Index.lastModified
  AND neither is deleted
  AND local content !== s3 content
  → db.createConflict(...)
```

Both versions are preserved in the `conflicts_t` table:

| Column | Description |
|---|---|
| `entryId` | Entry ID (e.g. `jun.14.2025`) |
| `entryDate` | Human-readable date string |
| `localVersion` | Markdown content from local DB |
| `remoteVersion` | Markdown content from S3 |
| `localModified` | `lastModified` timestamp of local version |
| `remoteModified` | `lastModified` timestamp of S3 version |

The local entry is **not modified** during conflict detection. The entry is skipped in sync (local index is kept) until the conflict is resolved.

### Resolution (user-driven)

The user resolves conflicts in **More → Conflicts**:

1. Both versions are shown side-by-side
2. User picks **Keep Local** or **Keep Remote**
3. If remote is chosen: `db.updateEntry(id, remoteContent, skipSync=true)`
4. If local is chosen: local entry is kept as-is
5. `conflicts_t` row is deleted
6. `cloudSyncPipeline()` runs to push the resolved version to S3

### What does NOT trigger a conflict

- Same `lastModified` on both sides (no-op — already in sync)
- Only one side modified (clean update — newer version wins, no conflict)
- Either side is deleted (deletion is applied without conflict)
- Same timestamps but content differs (treated as in-sync — no conflict created)

### Notes

- There is no automatic merge. One version is always chosen in full.
- Unresolved conflicts block that entry from syncing until resolved.
- A conflict badge count is shown in the More nav item when conflicts exist.
