# Encryption at Rest

toop-journal encrypts all journal entry content at the application layer using AES-256-GCM. Encryption is automatic and transparent — no user configuration required.

---

## What is encrypted

| Data | Encrypted |
|---|---|
| `entries_t.content` (journal text) | **Yes** |
| `entries_t.date`, `id`, `location`, `timestamp` | No |
| `settings_t` | No |
| `conflicts_t` | No |
| S3 entries (`entries/{id}.json`) | No |
| `masterIndex.json` (local + S3) | No |

Only entry content is encrypted. Metadata (dates, IDs, locations) and all S3 data remain plaintext. The threat model is local storage: encrypting content prevents a stolen machine's DB file from being read directly.

---

## Key generation and storage

On first launch, the app generates a cryptographically random 32-byte (256-bit) key using Node's `crypto.randomBytes`. It writes the key as a plain hex string to `userData/enc.key` with mode `0o600` (owner-readable only).

On every subsequent launch, the app reads `enc.key` and parses the hex string back into a `Buffer` for use in memory.

**Key path:** `~/Library/Application Support/toop-journal/enc.key`

---

## Encryption algorithm

**AES-256-GCM** with a fresh random IV per write operation.

### The three components

**IV (initialization vector)**
A random 12-byte number generated fresh for every encryption call. It is not secret — it's stored alongside the ciphertext. Its only job is to ensure that encrypting the same journal entry twice produces completely different output, so an attacker cannot detect patterns across entries.

**Ciphertext**
The encrypted bytes. Meaningless without the key.

**Auth tag (16 bytes)**
A fingerprint of the ciphertext computed during encryption. On decryption, GCM recomputes and compares it. If even one byte was changed on disk, this check fails and `decrypt()` throws an error instead of silently returning corrupted text. This is the "authenticated" part of AES-256-GCM.

### Stored format

```
"enc:" + hex(iv) + ":" + hex(ciphertext + authTag)
 └──┘    └──────┘         └─────────────────────────┘
prefix  24 hex chars       variable-length hex
marks   (12 raw bytes)     (encrypted bytes, then
as                          16-byte auth tag
encrypted                   appended at the end)
```

Example: `enc:a3f1c9b204e76d81930f2a11:d4e5f6...`

The `enc:` prefix lets the code safely distinguish encrypted rows from plaintext (used during migration and for idempotency checks).

### Pseudocode

```
encrypt(plaintext):
  iv         = randomBytes(12)
  cipher     = AES-256-GCM(key, iv)
  ciphertext = cipher.update(plaintext) + cipher.final()
  authTag    = cipher.getAuthTag()          // available only after final()
  return "enc:" + hex(iv) + ":" + hex(ciphertext + authTag)

decrypt(stored):
  strip "enc:" prefix
  split on ":" → iv (first part), payload (second part)
  authTag    = last 16 bytes of payload
  ciphertext = payload[0..-16]
  decipher   = AES-256-GCM(key, iv)
  decipher.setAuthTag(authTag)              // GCM verifies during final() below
  return decipher.update(ciphertext) + decipher.final()
  // throws if authTag doesn't match — tampered or wrong key
```

---

## FTS5 search behavior

A **worker thread** (`main/db/fts-worker.ts`) builds and owns an in-memory FTS5 database containing decrypted plaintext. It runs entirely off the main process event loop — the app window opens immediately and is never blocked by the index build.

See **`docs/search.md`** for the full technical details: FTS5 concepts, worker thread architecture, message protocol, and lifecycle.

---

## Multi-device behavior

The encryption key is per-machine (`enc.key` in each machine's userData). S3 sync stores entries **unencrypted** — the DB layer decrypts before upload and the receiving machine re-encrypts after download with its own key.

```
Machine A (key A)                S3                Machine B (key B)
─────────────────               ─────             ─────────────────
entries_t: enc:...    ──────►   plaintext  ──────►  entries_t: enc:...
(encrypted w/ key A)            (no enc)            (encrypted w/ key B)
```

Each machine's local DB is independently encrypted. A backup from Machine A cannot be decrypted on Machine B.

---

## Key loss / recovery

If `enc.key` is lost or deleted, the app will fail to start with a decryption error — all local DB content is unreadable without it.

### Option A — Restore from a local backup

Daily backups are written to `userData/backups/` before any DB changes. Restoring a backup only helps if `enc.key` is still intact — the backup DB is encrypted with the same key, so without it the backup is equally unreadable. Use this option when the DB file itself is corrupted but the key is intact.

If `enc.key` is missing, skip directly to Option B.

### Option B — Re-sync from S3

Use this if no usable backup exists. S3 stores entries as plaintext, so all synced entries are recoverable.

> **Warning:** do not skip step 2. If the local DB is left in place, the sync pipeline will compare `lastModified` timestamps and may push the broken encrypted content to S3, overwriting the good plaintext before it can be recovered.

1. Quit the app.
2. Delete the local DB file:
   - Prod: `~/Library/Application Support/toop-journal/journal.db`
   - Dev: `~/Library/Application Support/toop-journal/journal-dev.db`
3. Delete `~/Library/Application Support/toop-journal/enc.key`.
4. Relaunch the app — a new AES-256 key is generated and written to `enc.key`.
5. The sync pipeline sees all S3 entries as new → pulls them down as plaintext → re-encrypts with the new key.

Any entries that were never synced to S3 (created offline since the last sync) cannot be recovered via this path.
