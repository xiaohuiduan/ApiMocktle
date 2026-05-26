use rusqlite::params;
use uuid::Uuid;

use crate::db::client::Db;
use crate::models::RequestHistoryItem;

pub fn save_history(
    db: &Db,
    project_id: &str,
    menu_item_id: &str,
    request_json: &serde_json::Value,
    response_json: &serde_json::Value,
    status_code: i32,
    duration_ms: i64,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO request_history (id, project_id, menu_item_id, request_json, response_json, status_code, duration_ms, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            project_id,
            menu_item_id,
            request_json.to_string(),
            response_json.to_string(),
            status_code,
            duration_ms,
            now,
        ],
    )?;

    // Keep only the latest 10 records per menu_item_id
    conn.execute(
        "DELETE FROM request_history WHERE menu_item_id = ?1 AND id NOT IN (
            SELECT id FROM request_history WHERE menu_item_id = ?1 ORDER BY created_at DESC LIMIT 10
        )",
        params![menu_item_id],
    )?;

    Ok(())
}

pub fn list_history(
    db: &Db,
    project_id: &str,
    menu_item_id: &str,
) -> Result<Vec<RequestHistoryItem>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, menu_item_id, request_json, response_json, status_code, duration_ms, created_at
         FROM request_history
         WHERE project_id = ?1 AND menu_item_id = ?2
         ORDER BY created_at DESC
         LIMIT 10",
    )?;

    let rows = stmt.query_map(params![project_id, menu_item_id], |row| {
        let req_str: String = row.get(2)?;
        let resp_str: String = row.get(3)?;
        Ok(RequestHistoryItem {
            id: row.get(0)?,
            menu_item_id: row.get(1)?,
            request_json: serde_json::from_str(&req_str).unwrap_or(serde_json::json!({})),
            response_json: serde_json::from_str(&resp_str).unwrap_or(serde_json::json!({})),
            status_code: row.get(4)?,
            duration_ms: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

pub fn delete_history(db: &Db, id: &str) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM request_history WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn setup_db() -> Db {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(
            "CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                icon TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE request_history (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                menu_item_id TEXT NOT NULL,
                request_json TEXT NOT NULL,
                response_json TEXT NOT NULL,
                status_code INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            CREATE INDEX idx_request_history_menu ON request_history(project_id, menu_item_id);
            INSERT INTO projects (id, name, owner_id, created_at, icon)
            VALUES ('proj1', 'Test Project', 'user1', '2024-01-01T00:00:00Z', '');",
        ).unwrap();
        Db(Mutex::new(conn))
    }

    #[test]
    fn test_save_and_list_history() {
        let db = setup_db();
        let req = serde_json::json!({"url": "https://example.com", "method": "GET"});
        let resp = serde_json::json!({"status": 200, "body": "ok"});

        save_history(&db, "proj1", "menu1", &req, &resp, 200, 150).unwrap();

        let items = list_history(&db, "proj1", "menu1").unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].status_code, 200);
        assert_eq!(items[0].duration_ms, 150);
        assert_eq!(items[0].menu_item_id, "menu1");
        assert_eq!(items[0].request_json["url"], "https://example.com");
        assert_eq!(items[0].response_json["status"], 200);
    }

    #[test]
    fn test_list_history_empty() {
        let db = setup_db();
        let items = list_history(&db, "proj1", "nonexistent").unwrap();
        assert_eq!(items.len(), 0);
    }

    #[test]
    fn test_delete_history() {
        let db = setup_db();
        let req = serde_json::json!({"url": "https://example.com"});
        let resp = serde_json::json!({"status": 200});

        save_history(&db, "proj1", "menu1", &req, &resp, 200, 100).unwrap();
        let items = list_history(&db, "proj1", "menu1").unwrap();
        assert_eq!(items.len(), 1);

        delete_history(&db, &items[0].id).unwrap();
        let items = list_history(&db, "proj1", "menu1").unwrap();
        assert_eq!(items.len(), 0);
    }

    #[test]
    fn test_history_limit_10() {
        let db = setup_db();
        let req = serde_json::json!({"url": "https://example.com"});
        let resp = serde_json::json!({"status": 200});

        for i in 0..12 {
            save_history(&db, "proj1", "menu1", &req, &resp, 200, i * 10).unwrap();
        }

        let items = list_history(&db, "proj1", "menu1").unwrap();
        assert_eq!(items.len(), 10, "should keep only 10 latest records");
    }

    #[test]
    fn test_history_separate_menu_items() {
        let db = setup_db();
        let req = serde_json::json!({"url": "https://example.com"});
        let resp = serde_json::json!({"status": 200});

        save_history(&db, "proj1", "menu1", &req, &resp, 200, 100).unwrap();
        save_history(&db, "proj1", "menu2", &req, &resp, 404, 200).unwrap();

        let items1 = list_history(&db, "proj1", "menu1").unwrap();
        let items2 = list_history(&db, "proj1", "menu2").unwrap();
        assert_eq!(items1.len(), 1);
        assert_eq!(items2.len(), 1);
        assert_eq!(items1[0].status_code, 200);
        assert_eq!(items2[0].status_code, 404);
    }

    #[test]
    fn test_history_order_desc() {
        let db = setup_db();
        let req = serde_json::json!({"url": "https://example.com"});
        let resp = serde_json::json!({"status": 200});

        save_history(&db, "proj1", "menu1", &req, &resp, 200, 100).unwrap();
        save_history(&db, "proj1", "menu1", &req, &resp, 201, 200).unwrap();
        save_history(&db, "proj1", "menu1", &req, &resp, 202, 300).unwrap();

        let items = list_history(&db, "proj1", "menu1").unwrap();
        assert_eq!(items.len(), 3);
        // First item should be the most recent (highest status_code inserted last)
        assert_eq!(items[0].status_code, 202);
        assert_eq!(items[2].status_code, 200);
    }

    #[test]
    fn test_delete_nonexistent_id() {
        let db = setup_db();
        // Should not error
        delete_history(&db, "nonexistent-id").unwrap();
    }
}
