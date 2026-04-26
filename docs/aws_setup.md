# AWS S3 Cloud Sync

This feature enables syncing journal entries with an S3 bucket using a `masterIndex.json` file to track updates.

## Overview

The master index serves as a bidirectional sync index, tracking entries between local and cloud data stores. Conflicts are resolved using `lastModified` timestamps.

**Storage Locations:**

- Local (Dev): `~/Library/Application Support/Electron/masterIndex.json`
- Local (Prod): `~/Library/Application Support/toop-journal/masterIndex.json`
- S3: `{bucket_name}/masterIndex.json`

## Setup

### 1. Configure AWS Credentials

AWS credentials are configured through the UI in the **[More.tsx](/renderer/src/More.tsx)** component. The configuration is stored in the user data directory (`config.json`).

To enable cloud sync:

1. Navigate to the **More** page "AWS Cloud Sync" section
2. Toggle the switch to enable cloud sync
3. Enter your AWS credentials:
  - **Access Key**: AWS Access Key ID
  - **Secret Key**: AWS Secret Access Key
  - **Bucket**: Name of your S3 bucket
  - **Region**: AWS region where the bucket is located
4. Click "Save" to validate and save the configuration
5. Credentials will be tested against your S3 bucket
6. On first sync, your local master index and entries are uploaded to S3
7. Sync will occur upon app start-up or manually by clicking the 'Sync' button

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
2. Skip "Provide user access to the AWS Management Console" — this user only needs programmatic access, never console login
3. On **Set permissions**: choose **Attach policies directly** (do not add to the Administrators group — that grants full AWS access)
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
			"Resource": [
				"arn:aws:s3:::{bucket_name}/*"
			]
		},
		{
			"Effect": "Allow",
			"Action": [
				"s3:ListBucket",
				"s3:GetBucketVersioning"
			],
			"Resource": [
				"arn:aws:s3:::{bucket_name}"
			]
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

### App Startup

On app startup, the following occurs:

1. The local `masterIndex.json` is initialized if it doesn't exist (empty `{}`)
2. The app attempts to read AWS config from the user data directory
3. If found, it validates AWS credentials by checking access to the specified bucket
4. If cloud sync is enabled, automatic sync occurs (merging local and S3 master indexes)
5. If config is missing or misconfigured, cloud sync is disabled but local operations continue normally

### Sync Architecture

**Local-First Master Index**

The master index is maintained locally during database operations and synced to S3. This enables:

1. **Offline-first**: Master index updates happen immediately with database operations, even without internet
2. **First-time sync**: When enabling cloud sync for the first time, the local master index already contains all existing entries
3. **Initial upload**: First sync pushes all local entries to the empty S3 bucket automatically
4. **Consistent state**: Local and S3 master indexes are merged during sync, with the most recent changes winning

**First-Time Cloud Sync Setup:**

When you enable cloud sync for the first time:

- Local `masterIndex.json` already contains metadata for all existing journal entries
- S3 bucket is empty (or contains data from another device)
- First sync merges local and S3 master indexes
- Missing entries are uploaded/downloaded automatically
- Result: Both local and S3 are fully synchronized

**Ongoing Sync Behavior:**

After initial setup:

- Creating/updating/deleting entries updates the local master index immediately
- Master index changes are synced to S3 during the next sync operation
- Conflicts are resolved using `lastModified` timestamp (newest wins)
- Both create/update/delete operations are tracked and synced bidirectionally

## Bucket Structure

Auto-configured upon successful link:

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
  "date": "Jun 14, 2025 at 12:35:55",
  "content": "{markdown string}",
  "timestamp": 1749926155000
}
```

**masterIndex.json** (map of entry_id → metadata):

```json
{
  "oct.17.2025": {
    "lastModified": 1760734211873,
    "deleted": false
  },
  "jun.14.2025": {
    "lastModified": 1749926155000,
    "deleted": false
  }
}
```

## Implementation Files

**aws_client.ts**

- AWS S3 client initialization and validation
- Initializes the S3 client on app startup
- Validates AWS credentials by testing bucket access
- Triggers the cloud sync pipeline after successful initialization

**aws_config.ts**

- Manages AWS configuration (access key, secret key, bucket, region)
- Provides functions to create, update, delete, and load AWS config

**master_index.ts**

- Core master index operations for local and S3 storage
- Handles loading, saving, and syncing master indexes between local filesystem and S3
- Resolves conflicts using `lastModified` timestamps (newest wins)
- Updates journal entries bidirectionally during sync

**transact.ts**

- Exports the shared state object containing AWS client, config, and paths
- Provides `cloudSyncPipeline()` function that orchestrates the full sync process
- Merges local and S3 master indexes and saves to both locations

**masterIndex.json** (.gitignored)

- Local master index file containing metadata for all journal entries
- Tracks `lastModified` timestamp and `deleted` status for each entry
- Auto-created on first app startup if it doesn't exist
- Updated whenever entries are created, modified, or deleted

## Notes

- Versioning protects against accidental overwrites and deletes
- Lifecycle rules prevent long-term storage bloat
- Typical cost for journal-sized data is effectively negligible
