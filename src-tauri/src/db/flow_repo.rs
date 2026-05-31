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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::client::Db;
    use std::sync::Arc;
    use std::sync::Mutex;
    use rusqlite::Connection;

    fn setup_db() -> Arc<Db> {
        let conn = Connection::open_in_memory().expect("Failed to create in-memory db");
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS test_flow_graphs (
                id TEXT PRIMARY KEY,
                task_id TEXT UNIQUE NOT NULL,
                graph_json TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );"
        ).expect("Failed to create table");
        Arc::new(Db(Mutex::new(conn)))
    }

    #[test]
    fn test_save_and_load_flow_graph() {
        let db = setup_db();
        let graph = serde_json::json!({
            "nodes": [
                {"id": "start-1", "type": "start", "position": {"x": 0, "y": 0}, "data": {"label": "Start", "enabled": true}},
                {"id": "end-1", "type": "end", "position": {"x": 0, "y": 100}, "data": {"label": "End", "enabled": true}}
            ],
            "edges": [
                {"id": "e-1", "source": "start-1", "target": "end-1", "sourceHandle": "out", "targetHandle": "in"}
            ]
        });

        // Save
        save_flow_graph(&db, "task-1", &graph).unwrap();

        // Load
        let loaded = load_flow_graph(&db, "task-1").unwrap();
        assert!(loaded.is_some());
        let loaded = loaded.unwrap();
        assert_eq!(loaded["nodes"].as_array().unwrap().len(), 2);
        assert_eq!(loaded["edges"].as_array().unwrap().len(), 1);
        assert_eq!(loaded["nodes"][0]["id"], "start-1");
    }

    #[test]
    fn test_load_nonexistent_graph() {
        let db = setup_db();
        let result = load_flow_graph(&db, "nonexistent-task").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_save_overwrites_existing() {
        let db = setup_db();
        let graph1 = serde_json::json!({"nodes": [], "edges": []});
        let graph2 = serde_json::json!({"nodes": [{"id": "n1", "type": "start"}], "edges": []});

        save_flow_graph(&db, "task-1", &graph1).unwrap();
        save_flow_graph(&db, "task-1", &graph2).unwrap();

        let loaded = load_flow_graph(&db, "task-1").unwrap().unwrap();
        assert_eq!(loaded["nodes"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn test_delete_flow_graph() {
        let db = setup_db();
        let graph = serde_json::json!({"nodes": [], "edges": []});

        save_flow_graph(&db, "task-1", &graph).unwrap();
        assert!(load_flow_graph(&db, "task-1").unwrap().is_some());

        delete_flow_graph(&db, "task-1").unwrap();
        assert!(load_flow_graph(&db, "task-1").unwrap().is_none());
    }

    #[test]
    fn test_delete_nonexistent_is_ok() {
        let db = setup_db();
        // Should not error when deleting non-existent graph
        let result = delete_flow_graph(&db, "nonexistent");
        assert!(result.is_ok());
    }

    #[test]
    fn test_version_increments_on_update() {
        let db = setup_db();
        let graph = serde_json::json!({"nodes": [], "edges": []});

        save_flow_graph(&db, "task-1", &graph).unwrap();
        save_flow_graph(&db, "task-1", &graph).unwrap();
        save_flow_graph(&db, "task-1", &graph).unwrap();

        // Check version via direct query
        let conn = db.0.lock().unwrap();
        let version: i32 = conn.query_row(
            "SELECT version FROM test_flow_graphs WHERE task_id = 'task-1'",
            [],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(version, 3, "Version should be 3 after 3 saves");
    }
}
