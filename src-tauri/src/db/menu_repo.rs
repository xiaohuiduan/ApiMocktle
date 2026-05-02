use rusqlite::params;
use uuid::Uuid;

use crate::db::client::Db;
use crate::models::{ApiMenuData, RecycleDataItem, ProjectEnvironmentConfig};

pub fn create_menu_item(
    db: &Db,
    project_id: &str,
    item: &crate::models::CreateMenuItemPayload,
) -> Result<ApiMenuData, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    let sort_order = item.sort_order.unwrap_or(0);
    let data_json_str = item.data_json.as_ref().map(|v| v.to_string());

    conn.execute(
        "INSERT INTO menu_items (project_id, id, parent_id, name, type, data_json, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![project_id, item.id, item.parent_id, item.name, item.menu_type, data_json_str, sort_order, now, now],
    )?;

    Ok(ApiMenuData {
        id: item.id.clone(),
        parent_id: item.parent_id.clone(),
        name: item.name.clone(),
        menu_type: item.menu_type.clone(),
        data_json: item.data_json.clone(),
        sort_order,
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn update_menu_item(
    db: &Db,
    project_id: &str,
    menu_id: &str,
    updates: &serde_json::Value,
) -> Result<ApiMenuData, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(name) = updates.get("name").and_then(|v| v.as_str()) {
        conn.execute(
            "UPDATE menu_items SET name = ?1, updated_at = ?2 WHERE project_id = ?3 AND id = ?4",
            params![name, now, project_id, menu_id],
        )?;
    }
    if let Some(data_json) = updates.get("data") {
        conn.execute(
            "UPDATE menu_items SET data_json = ?1, updated_at = ?2 WHERE project_id = ?3 AND id = ?4",
            params![data_json.to_string(), now, project_id, menu_id],
        )?;
    }
    if let Some(parent_id) = updates.get("parentId").and_then(|v| v.as_str()) {
        conn.execute(
            "UPDATE menu_items SET parent_id = ?1, updated_at = ?2 WHERE project_id = ?3 AND id = ?4",
            params![parent_id, now, project_id, menu_id],
        )?;
    }

    let row = conn.query_row(
        "SELECT id, parent_id, name, type, data_json, sort_order, created_at, updated_at
         FROM menu_items WHERE project_id = ?1 AND id = ?2",
        params![project_id, menu_id],
        |row| {
            Ok(ApiMenuData {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                name: row.get(2)?,
                menu_type: row.get(3)?,
                data_json: row.get::<_, Option<String>>(4).ok().flatten()
                    .and_then(|s| serde_json::from_str(&s).ok()),
                sort_order: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )?;

    Ok(row)
}

pub fn delete_menu_item(db: &Db, project_id: &str, menu_id: &str) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();

    // Get item before deleting for recycle bin
    let item = conn.query_row(
        "SELECT id, parent_id, name, type, data_json, sort_order, created_at, updated_at
         FROM menu_items WHERE project_id = ?1 AND id = ?2",
        params![project_id, menu_id],
        |row| {
            Ok(ApiMenuData {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                name: row.get(2)?,
                menu_type: row.get(3)?,
                data_json: row.get::<_, Option<String>>(4).ok().flatten()
                    .and_then(|s| serde_json::from_str(&s).ok()),
                sort_order: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )?;

    let recycle_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let expires_at = chrono::Utc::now().timestamp_millis() + 30 * 24 * 60 * 60 * 1000;
    let deleted_json = serde_json::to_string(&item).unwrap_or_default();
    let creator_json = serde_json::json!({"id": "", "username": "system"}).to_string();

    conn.execute(
        "INSERT INTO recycle_items (id, project_id, catalog_type, deleted_item_json, creator_json, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![recycle_id, project_id, item.menu_type, deleted_json, creator_json, expires_at, now],
    )?;

    conn.execute(
        "DELETE FROM menu_items WHERE project_id = ?1 AND id = ?2",
        params![project_id, menu_id],
    )?;

    Ok(())
}

pub fn batch_delete_menu_items(
    db: &Db,
    project_id: &str,
    menu_ids: &[String],
) -> Result<(), crate::errors::AppError> {
    for id in menu_ids {
        delete_menu_item(db, project_id, id)?;
    }
    Ok(())
}

pub fn move_menu_items(
    db: &Db,
    project_id: &str,
    drag_key: &str,
    drop_key: &str,
    _drop_position: i32,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();

    // Simple move: update sort_order of dragged item based on drop position
    conn.execute(
        "UPDATE menu_items SET parent_id = ?1, updated_at = ?2 WHERE project_id = ?3 AND id = ?4",
        params![drop_key, now, project_id, drag_key],
    )?;

    Ok(())
}

// Recycle bin
pub fn list_recycle_items(
    db: &Db,
    project_id: &str,
) -> Result<Vec<RecycleDataItem>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, catalog_type, deleted_item_json, creator_json, expires_at, created_at
         FROM recycle_items WHERE project_id = ?1 ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map(params![project_id], |row| {
        Ok(RecycleDataItem {
            id: row.get(0)?,
            catalog_type: row.get(1)?,
            deleted_item_json: serde_json::from_str(
                &row.get::<_, String>(2).unwrap_or_default(),
            )
            .unwrap_or_default(),
            creator_json: serde_json::from_str(
                &row.get::<_, String>(3).unwrap_or_default(),
            )
            .unwrap_or_default(),
            expires_at: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

pub fn restore_recycle_item(
    db: &Db,
    project_id: &str,
    recycle_id: &str,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();

    let (deleted_item_json,): (String,) = conn.query_row(
        "SELECT deleted_item_json FROM recycle_items WHERE id = ?1 AND project_id = ?2",
        params![recycle_id, project_id],
        |row| Ok((row.get(0)?,)),
    )?;

    let item: ApiMenuData = serde_json::from_str(&deleted_item_json)
        .map_err(|e| crate::errors::AppError::Internal(format!("解析回收项失败: {e}")))?;

    let now = chrono::Utc::now().to_rfc3339();
    let data_json_str = item.data_json.as_ref().map(|v| v.to_string());

    conn.execute(
        "INSERT OR REPLACE INTO menu_items (project_id, id, parent_id, name, type, data_json, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![project_id, item.id, item.parent_id, item.name, item.menu_type, data_json_str, item.sort_order, item.created_at, now],
    )?;

    conn.execute(
        "DELETE FROM recycle_items WHERE id = ?1",
        params![recycle_id],
    )?;

    Ok(())
}

pub fn delete_recycle_items(
    db: &Db,
    project_id: &str,
    recycle_ids: &[String],
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    for id in recycle_ids {
        conn.execute(
            "DELETE FROM recycle_items WHERE id = ?1 AND project_id = ?2",
            params![id, project_id],
        )?;
    }
    Ok(())
}

// Environments
pub fn save_project_environments(
    db: &Db,
    project_id: &str,
    config: &ProjectEnvironmentConfig,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let value = serde_json::to_string(config)?;

    conn.execute(
        "INSERT OR REPLACE INTO meta (project_id, key, value) VALUES (?1, 'environmentConfig', ?2)",
        params![project_id, value],
    )?;

    Ok(())
}

pub fn get_menu_item(
    db: &Db,
    project_id: &str,
    menu_id: &str,
) -> Result<Option<ApiMenuData>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT id, parent_id, name, type, data_json, sort_order, created_at, updated_at
         FROM menu_items WHERE project_id = ?1 AND id = ?2",
        params![project_id, menu_id],
        |row| {
            Ok(ApiMenuData {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                name: row.get(2)?,
                menu_type: row.get(3)?,
                data_json: row.get::<_, Option<String>>(4).ok().flatten()
                    .and_then(|s| serde_json::from_str(&s).ok()),
                sort_order: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(crate::errors::AppError::from(other)),
    })
}

pub fn get_max_sort_order(
    db: &Db,
    project_id: &str,
) -> Result<i32, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let max_order: Option<i32> = conn.query_row(
        "SELECT MAX(sort_order) FROM menu_items WHERE project_id = ?1",
        params![project_id],
        |row| row.get(0),
    )
    .ok()
    .flatten();
    Ok(max_order.unwrap_or(0))
}

pub fn list_menu_items(
    db: &Db,
    project_id: &str,
) -> Result<Vec<ApiMenuData>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, name, type, data_json, sort_order, created_at, updated_at
         FROM menu_items WHERE project_id = ?1 ORDER BY sort_order",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(ApiMenuData {
            id: row.get(0)?,
            parent_id: row.get(1)?,
            name: row.get(2)?,
            menu_type: row.get(3)?,
            data_json: row.get::<_, Option<String>>(4).ok().flatten()
                .and_then(|s| serde_json::from_str(&s).ok()),
            sort_order: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

