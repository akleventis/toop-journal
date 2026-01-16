## entries table schema
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| date | TEXT | NOT NULL |
| content | TEXT | NOT NULL |
| location | TEXT | |
| timestamp | INTEGER | NOT NULL |
| lastModified | INTEGER | |

```bash
sqlite3 journal.db

# describe tables
.tables                    # list all tables
.schema                    # show all table schemas
.schema entries            # show specific table schema
.schema settings           # show settings table schema

# output format
.mode line

# exit
.quit
```