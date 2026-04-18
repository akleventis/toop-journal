# Web Client Architecture

This document covers how a future web client (a separate, independently deployed app) could sync with the same S3 bucket used by the Electron app. The two would have no direct connection — each syncs with S3 independently, the same way two Electron installs on different machines do today.

---

## S3 Bucket Structure

```
bucket/
  masterIndex.json          # sync manifest — always load this first
  entries/
    jun.14.2025.json        # one file per entry, keyed by Entry.id
    jun.13.2025.json
    ...
```

### masterIndex.json

```json
{
  "jun.14.2025": { "lastModified": 1718380500000, "deleted": false },
  "jun.13.2025": { "lastModified": 1718294100000, "deleted": true }
}
```

Type: `MasterIndex` from `shared/types.ts`.

### entries/{id}.json

```json
{
  "id": "jun.14.2025",
  "date": "Jun 14, 2025 at 12:35",
  "content": "# Journal entry\n\nMarkdown content here.",
  "location": "New York",
  "timestamp": 1718380500000,
  "lastModified": 1718380500000
}
```

Type: `Entry` from `shared/types.ts`. **Content is stored as plain Markdown — no encryption on S3.**

---

## Shared Types

`shared/types.ts` defines the canonical domain types used in this repo. A web client would live in its own repo and would either copy these types or consume them from a published package.

Core types:
- `Entry` — core journal entry
- `MasterIndex` / `MasterIndexEntry` — sync manifest
- `Conflict` — unresolved edit conflict
- `SyncState` — sync machine states
- `S3Config` — AWS credentials shape

`shared/api.ts` — `JournalAPI` interface any client should implement:

```ts
interface JournalAPI {
  listEntries(limit?: number): Promise<Entry[]>;
  getEntry(id: string): Promise<Entry | null>;
  createEntry(entry: Entry): Promise<void>;
  updateEntry(id: string, entry: Partial<Entry>): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  sync(): Promise<SyncResult>;
}
```

---

## Authentication

A Lambda layer wraps all S3 operations. The web client authenticates against the API (e.g. JWT) and never holds AWS credentials directly.

```
Browser → HTTPS → API Gateway → Lambda → S3
```

---

## Sync Implementation

The web client sync logic mirrors the Electron `cloudSyncPipeline`, with all S3 access going through the API:

1. **Load local state** — from IndexedDB or localStorage (`masterIndex` + entries)
2. **Fetch remote masterIndex** — `GET /api/masterIndex`
3. **Diff** — compare `lastModified` timestamps entry by entry
4. **Pull new/updated entries** — `GET /api/entries/{id}` for anything newer on the server
5. **Push local changes** — `PUT /api/entries/{id}`; `PUT /api/masterIndex`
6. **Handle conflicts** — when both sides modified the same entry and content differs, create a `Conflict` record; surface to user

The `MasterIndex` format is intentionally simple so any client can implement this without needing to understand the full Electron codebase.

---

## Encryption

S3 entries are stored as **plaintext Markdown** — the Electron app decrypts before upload and re-encrypts after download. Transit is secured by HTTPS (API Gateway enforces TLS). A web client can read/write entries without any additional decryption.

---

## Entry ID and Date Format

- **Entry ID** (`Entry.id`): `"jun.14.2025"` — lowercase month abbreviation, no zero-padding
- **Entry date** (`Entry.date`): `"Jun 14, 2025 at 12:35"` — validated by regex at DB layer
- Use `journalDateToId()` and `formatCurrentDate()` from `renderer/lib/dates.ts` (or port the logic) to produce conforming IDs and dates

A web client must generate IDs and dates in the same formats or the Electron app will reject imported entries.
