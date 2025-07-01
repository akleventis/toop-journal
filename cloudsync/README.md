# Sync data to AWS S3

TODO: This is wrong. We should store user credentials in a user data directory. Add ui component in /more to accept aws credentials

This feature enables syncing journal entries with an S3 bucket using a `masterIndex.json` file to track updates.

- `masterIndex.json` serves as a an index, tracking entries between local & cloud data stores. Uses 'lastModified' to determine which source should be updated.

To enable cloud sync, you must create a `config.json` file under /cloudsync with valid AWS credentials. This file is not provided by default — it is your responsibility to create and populate it:

On app startup, the following will happen:
1.  The app will attempt to read your `/cloudsync/config.json` file.
1.  If found, it will validate the AWS credentials by checking access to the specified bucket.
1.  If the file is missing or misconfigured, cloud sync will be disabled
1.  `masterIndex.json` & `/entries/*` files are auto-created upon successful configuration

### Create `/cloudsync/config.json` file
```json
{
  "aws_access": "AWS Secret Access Key",
  "aws_secret": "AWS Access Key ID",
  "aws_bucket": "Name of your S3 bucket",
  "aws_region": "AWS region where the bucket is located"
}
```

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