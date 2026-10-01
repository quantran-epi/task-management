use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

const ALLOWED_TABLES: &[&str] = &[
    "projects",
    "milestones",
    "tasks",
    "capacityRules",
    "capacityOverrides",
    "plannedAllocations",
    "workSessions",
    "settings",
    "backupMetadata",
    "activeTimers",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteChange {
    table_name: String,
    row_id: String,
    payload_json: Option<String>,
    deleted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteRow {
    table_name: String,
    row_id: String,
    payload_json: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteFileStatus {
    exists: bool,
    is_file: bool,
}

fn validate_table(table_name: &str) -> Result<(), String> {
    if ALLOWED_TABLES.contains(&table_name) {
        Ok(())
    } else {
        Err("SQLITE_INVALID_TABLE".into())
    }
}

fn validate_row_id(row_id: &str) -> Result<(), String> {
    if row_id.trim().is_empty() {
        Err("SQLITE_INVALID_ROW_ID".into())
    } else {
        Ok(())
    }
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS planner_rows (
            table_name TEXT NOT NULL,
            row_id TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (table_name, row_id)
        );
        CREATE TABLE IF NOT EXISTS planner_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )
    .map_err(|e| e.to_string())
}

fn open_existing(path: &str) -> Result<Connection, String> {
    if !Path::new(path).is_file() {
        return Err("SQLITE_PATH_MISSING".into());
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    ensure_schema(&conn)?;
    Ok(conn)
}

#[tauri::command]
pub fn select_sqlite_path() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .add_filter("SQLite", &["sqlite", "db", "sqlite3"])
        .set_file_name("task-planner.sqlite")
        .save_file()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn sqlite_file_status(path: String) -> Result<SqliteFileStatus, String> {
    let p = Path::new(&path);
    Ok(SqliteFileStatus {
        exists: p.exists(),
        is_file: p.is_file(),
    })
}

#[tauri::command]
pub fn sqlite_init(path: String) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    ensure_schema(&conn)
}

#[tauri::command]
pub fn sqlite_apply_changes(path: String, changes: Vec<SqliteChange>) -> Result<(), String> {
    let mut conn = open_existing(&path)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for change in changes {
        validate_table(&change.table_name)?;
        validate_row_id(&change.row_id)?;

        if change.deleted {
            tx.execute(
                "DELETE FROM planner_rows WHERE table_name = ?1 AND row_id = ?2",
                params![change.table_name, change.row_id],
            )
            .map_err(|e| e.to_string())?;
            continue;
        }

        let payload = change.payload_json.ok_or("SQLITE_MISSING_PAYLOAD")?;
        serde_json::from_str::<Value>(&payload).map_err(|_| "SQLITE_INVALID_JSON".to_string())?;
        tx.execute(
            "INSERT INTO planner_rows (table_name, row_id, payload_json, updated_at)
             VALUES (?1, ?2, ?3, datetime('now'))
             ON CONFLICT(table_name, row_id) DO UPDATE SET
               payload_json = excluded.payload_json,
               updated_at = excluded.updated_at",
            params![change.table_name, change.row_id, payload],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sqlite_read_rows(path: String) -> Result<Vec<SqliteRow>, String> {
    let conn = open_existing(&path)?;
    let mut stmt = conn
        .prepare(
            "SELECT table_name, row_id, payload_json, updated_at
             FROM planner_rows
             ORDER BY table_name, row_id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SqliteRow {
                table_name: row.get(0)?,
                row_id: row.get(1)?,
                payload_json: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_changes_upserts_and_deletes_rows_transactionally() {
        let mut path = std::env::temp_dir();
        path.push(format!("task-planner-test-{}.sqlite", std::process::id()));
        let path = path.to_string_lossy().to_string();
        let _ = std::fs::remove_file(&path);

        sqlite_init(path.clone()).unwrap();
        sqlite_apply_changes(
            path.clone(),
            vec![
                SqliteChange {
                    table_name: "tasks".into(),
                    row_id: "task-1".into(),
                    payload_json: Some("{\"id\":\"task-1\"}".into()),
                    deleted: false,
                },
                SqliteChange {
                    table_name: "projects".into(),
                    row_id: "project-1".into(),
                    payload_json: Some("{\"id\":\"project-1\"}".into()),
                    deleted: false,
                },
            ],
        )
        .unwrap();
        sqlite_apply_changes(
            path.clone(),
            vec![SqliteChange {
                table_name: "projects".into(),
                row_id: "project-1".into(),
                payload_json: None,
                deleted: true,
            }],
        )
        .unwrap();

        let rows = sqlite_read_rows(path.clone()).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].table_name, "tasks");
        assert_eq!(rows[0].row_id, "task-1");
        let _ = std::fs::remove_file(path);
    }
}
