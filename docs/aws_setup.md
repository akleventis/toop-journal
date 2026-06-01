# AWS S3 Cloud Sync

This feature enables syncing journal entries with an S3 bucket using a `masterIndex.json` file to track updates.

## Overview

The master index serves as a bidirectional sync index, tracking entries between local and cloud data stores. Sync uses last-write-wins based on `lastModified` timestamps.

**Storage Locations:**

- Local (Dev): `~/Library/Application Support/com.bookoftoop.app/dev/masterIndex.json`
- Local (Prod): `~/Library/Application Support/com.bookoftoop.app/stable/masterIndex.json`
- S3: `{bucket_name}/masterIndex.json`

## Setup

### 1. Configure AWS Credentials

AWS credentials are configured through the UI in the **More** page under "AWS Cloud Sync". The configuration is stored as `config.json` in the userData directory.

To enable cloud sync:

1. Navigate to the **More** page "AWS Cloud Sync" section
2. Enter your AWS credentials:
  - **Access Key**: AWS Access Key ID
  - **Secret Key**: AWS Secret Access Key
  - **Bucket**: Name of your S3 bucket
  - **Region**: AWS region where the bucket is located
3. Click "Save" to validate and save the configuration
4. Credentials will be tested against your S3 bucket
5. On first sync, your local master index and entries are uploaded to S3
6. Sync will occur upon app start-up or manually by clicking the 'Sync' button

### 2. Enable S3 Versioning

Enable versioning as a safety net for cloud sync data.

1. Open **S3** → **Buckets** → `{bucket_name}`
2. Go to the **Properties** tab
3. Find **Bucket Versioning**
4. Click **Edit**
5. Select **Enable**
6. Click **Save changes**

**Verify with AWS CLI:**

```bash
aws s3api get-bucket-versioning --bucket {bucket_name}
```

Expected output:

```json
{ "Status": "Enabled" }
```

### 3. Configure Lifecycle Rule (Recommended)

Keeps recent versions for recovery while preventing unlimited storage growth.

1. Open **S3** → **Buckets** → `{bucket_name}`
2. Go to **Management** tab
3. Under **Lifecycle rules**, click **Create lifecycle rule**
4. Configure:
  - **Rule name:** `journal-version-cleanup`
  - **Rule scope:** Apply to all objects
  - Acknowledge rule applies to all objects
5. Under **Lifecycle rule actions**, enable:
  - **Permanently delete noncurrent versions of objects**
6. Set:
  - **Days after objects become noncurrent:** 90
  - **Number of newer versions to retain:** 5
7. Enable:
  - **Delete expired object delete markers**
8. Click **Create rule**

**Verify with AWS CLI:**

```bash
aws s3api get-bucket-lifecycle-configuration --bucket {bucket_name}
```

### 4. Configure IAM Permissions

1. IAM → Users → **Create user**
2. Skip "Provide user access to the AWS Management Console" — this user only needs programmatic access
3. On **Set permissions**: choose **Attach policies directly**
4. Click **Create policy**, switch to the JSON editor, paste the policy below
5. Name the policy `journal-s3-policy` and save it
6. Attach that policy to the user and finish creation
7. On the user page → **Security credentials → Create access key** → select "Application running outside AWS"
8. Copy the Access Key ID and Secret Access Key into the app (More → AWS)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:ListBucketVersions",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": ["arn:aws:s3:::{bucket_name}/*"]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketVersioning",
        "s3:HeadBucket"
      ],
      "Resource": ["arn:aws:s3:::{bucket_name}"]
    }
  ]
}
```

### 5. Sanity Check

Test versioning is working:

- Upload the same file twice
- In the S3 console, open the object
- Click the **Versions** tab
- Confirm multiple versions exist

## How It Works

See `docs/architecture.md` for the full sync pipeline diagram.

### App Startup

1. Local `masterIndex.json` is initialized if it doesn't exist (empty `{}`)
2. App reads AWS config from `config.json` in userData
3. If found, validates credentials via `HeadBucket`
4. If cloud sync is enabled, automatic sync occurs (merging local and S3 master indexes)
5. If config is missing or misconfigured, cloud sync is disabled but local operations continue

### Sync Architecture

**Local-First Master Index**

The master index is updated locally on every DB write and synced to S3 on the next pipeline run. This enables:

1. **Offline-first**: Index updates happen immediately, even without internet
2. **First-time sync**: Local index already contains all entries when sync is first enabled
3. **Initial upload**: First sync pushes all local entries to the empty S3 bucket automatically

## Bucket Structure

```text
{bucket_name}/
├─ entries/
│  ├─ jun.14.2025.json
│  ├─ oct.17.2025.json
│  └─ ...
└─ masterIndex.json
```

**entries/*.json** (per-entry file):

```json
{
  "id": "jun.14.2025",
  "date": "Jun 14, 2025 at 12:35",
  "content": "<p>HTML string</p>",
  "timestamp": 1749926155000,
  "lastModified": 1749926155000
}
```

**masterIndex.json**:

```json
{
  "oct.17.2025": { "lastModified": 1760734211873, "deleted": false },
  "jun.14.2025": { "lastModified": 1749926155000, "deleted": false }
}
```

## Implementation Files

| File | Role |
|---|---|
| `src/bun/cloudsync/aws-connection.ts` | S3 client init, credential validation, config CRUD |
| `src/bun/cloudsync/master_index.ts` | Load/save/sync master index; execute sync plan |
| `src/bun/cloudsync/transact.ts` | `cloudSyncPipeline()` — orchestrates full sync |
| `src/bun/cloudsync/sync_coordinator.ts` | `dbEvents` listeners — triggers sync on DB writes |
| `src/bun/cloudsync/sync_state.ts` | SyncStateMachine — tracks and broadcasts sync state |
| `src/bun/cloudsync/paths.ts` | userData-relative path constants |

## Notes

- Versioning protects against accidental overwrites and deletes
- Lifecycle rules prevent long-term storage bloat
- Typical cost for journal-sized data is effectively negligible
