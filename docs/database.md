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

> `content` is stored as raw HTML (Quill editor format). No encryption.

### settings_t 
| Column | Type | Constraints |
|--------|------|-------------|
| key    | TEXT | PRIMARY KEY |
| value  | TEXT | NOT NULL    |

### entries_fts (FTS5 virtual table)
| Column    | Notes |
|-----------|-------|
| id        | UNINDEXED — used to join back to entries_t |
| content   | Full-text indexed (HTML stripped at query time by SQLite tokenizer) |
| timestamp | UNINDEXED — used for ORDER BY |

Populated once on first launch from `entries_t`. Kept in sync on every create/update/delete. Periodically optimized via `INSERT INTO entries_fts(entries_fts) VALUES('optimize')` (weekly maintenance).

---

```bash
# dev
sqlite3 ~/Library/Application\ Support/com.bookoftoop.app/dev/journal.db
# prod
sqlite3 ~/Library/Application\ Support/com.bookoftoop.app/stable/journal.db

# describe tables
.tables
.schema entries_t
.schema settings_t

# output format
.mode line

# exit
.quit
```
