# journal.db

### entries_t 
| Column       | Type       | Constraints |
|--------------|------------|-------------|
| id           | TEXT       | PRIMARY KEY |
| date         | TEXT       | NOT NULL    |
| content      | TEXT       | NOT NULL    |
| location     | TEXT       |             |
| timestamp    | INTEGER    | NOT NULL    |
| lastModified | INTEGER    |             |

> **Note:** `content` is stored encrypted (`enc:<iv_hex>:<ciphertext+tag_hex>`) using AES-256-GCM. The app layer decrypts transparently on every read. See [docs/encryption.md](encryption.md) for details.

### settings_t 
| Column | Type | Constraints |
|--------|------|-------------|
| key    | TEXT | PRIMARY KEY |
| value  | TEXT | NOT NULL    |

### conflicts_t
| Column         | Type    | Constraints |
|----------------|---------|-------------|
| entryId        | TEXT    | PRIMARY KEY |
| entryDate      | TEXT    | NOT NULL    |
| localVersion   | TEXT    | NOT NULL    |
| remoteVersion  | TEXT    | NOT NULL    |
| localModified  | INTEGER | NOT NULL    |
| remoteModified | INTEGER | NOT NULL    |

---

```bash
sqlite3 journal.db

# describe tables
.tables                    # list all tables
.schema                    # show all table schemas
.schema entries_t          # show specific table schema
.schema settings_t         # show settings table schema

# output format
.mode line

# exit
.quit
```