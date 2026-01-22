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

### settings_t 
| Column | Type | Constraints |
|--------|------|-------------|
| key    | TEXT | PRIMARY KEY |
| value  | TEXT | NOT NULL    |

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