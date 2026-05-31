use rusqlite::params;
use serde_json;

use crate::db::client::Db;
use crate::errors::AppError;

pub fn save_flow_graph(
    db: &Db,
    task_id: &str,
    graph_json: &serde_json::Value,
) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let graph_str = graph_json.to_string();

    conn.execute(
        "INSERT INTO test_flow_graphs (id, task_id, graph_json, version, created_at, updated_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?4)
         ON CONFLICT(task_id) DO UPDATE SET graph_json = ?3, version = version + 1, updated_at = ?4",
        params![id, task_id, graph_str, now],
    )
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(())
}

pub fn load_flow_graph(
    db: &Db,
    task_id: &str,
) -> Result<Option<serde_json::Value>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT graph_json FROM test_flow_graphs WHERE task_id = ?1")
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut rows = stmt
        .query_map(params![task_id], |row| {
            let json_str: String = row.get(0)?;
            Ok(json_str)
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

    match rows.next() {
        Some(Ok(json_str)) => {
            let value: serde_json::Value = serde_json::from_str(&json_str)
                .map_err(|e| AppError::Internal(format!("Invalid graph JSON: {e}")))?;
            Ok(Some(value))
        }
        Some(Err(e)) => Err(AppError::Internal(e.to_string())),
        None => Ok(None),
    }
}

pub fn delete_flow_graph(db: &Db, task_id: &str) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    conn.execute(
        "DELETE FROM test_flow_graphs WHERE task_id = ?1",
        params![task_id],
    )
    .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}
