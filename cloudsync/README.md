# Sync data to AWS S3

This feature enables syncing journal entries with an S3 bucket using a `masterIndex.json` file to track updates.

- `masterIndex.json` serves as a an index, tracking entries between local & cloud data stores. Uses 'lastModified' to determine which source should be updated.

### Configuration

AWS credentials are configured through the UI in the **More** page. The configuration is stored in the user data directory (`config.json`).

To enable cloud sync:
1. Navigate to the **More** page
2. Find the "AWS Cloud Sync" section
3. Toggle the switch to enable cloud sync
4. Enter your AWS credentials:
   - **Access Key**: AWS Access Key ID
   - **Secret Key**: AWS Secret Access Key
   - **Bucket**: Name of your S3 bucket
   - **Region**: AWS region where the bucket is located
5. Click "Save" to validate and save the configuration

On app startup, the following will happen:
1. The app will attempt to read your AWS config from the user data directory
2. If found, it will validate the AWS credentials by checking access to the specified bucket
3. If the file is missing or misconfigured, cloud sync will be disabled
4. `masterIndex.json` & `/entries/*` files are auto-created upon successful configuration

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