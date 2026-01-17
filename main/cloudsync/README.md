# Sync data to AWS S3

This feature enables syncing journal entries with an S3 bucket using a `masterIndex.json` file to track updates.

- `masterIndex.json` serves as a an index, tracking entries between local & cloud data stores. Uses 'lastModified' to determine which source should be updated.

### Configuration

AWS credentials are configured through the UI in the **More** page. The configuration is stored in the user data directory (`config.json`).

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

On app startup, the following will happen:
1. The local `masterIndex.json` is initialized if it doesn't exist (empty `{}`)
2. The app will attempt to read your AWS config from the user data directory
3. If found, it will validate the AWS credentials by checking access to the specified bucket
4. If cloud sync is enabled, automatic sync will occur (merging local and S3 master indexes)
5. If the config is missing or misconfigured, cloud sync will be disabled but local operations continue normally

### Sync Architecture

**Local-First Master Index (Future)**

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

### Required AWS Policy
The following permissions must be attached to the IAM user associated with your credentials:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::{bucket_name}/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::{bucket_name}"
    }
  ]
}
```

### Bucket Structure (auto-configured upon successful link)

```text
{bucket_name}/
├─ entries/
│  ├─ jun.14.2025.json
│  ├─ oct.17.2025.json
│  └─ ...
└─ masterIndex.json
```

entries/*.json (per-entry file)

```json
{
  "id": "jun.14.2025",
  "date": "Jun 14, 2025 at 12:35:55",
  "content": "{encoded_html}",
  "timestamp": 1749926155000
}
```

masterIndex.json (map of entry_id → metadata)

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