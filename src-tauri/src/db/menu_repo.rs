use rusqlite::{params, Connection, Transaction};
use uuid::Uuid;

use crate::db::client::Db;
use crate::models::{ApiMenuData, RecycleDataItem, ProjectEnvironmentConfig};

/// 目录类节点(可拥有子级)。
const FOLDER_TYPES: [&str; 3] = ["apiDetailFolder", "apiSchemaFolder", "requestFolder"];

pub fn create_menu_item(
    db: &Db,
    project_id: &str,
    item: &crate::models::CreateMenuItemPayload,
) -> Result<ApiMenuData, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    let sort_order = item.sort_order.unwrap_or(0);
    let data_json_str = item.data_json.as_ref().map(|v| v.to_string());
    let run_tab_json_str = item.run_tab_json.as_ref().map(|v| v.to_string());

    conn.execute(
        "INSERT INTO menu_items (project_id, id, parent_id, name, type, data_json, run_tab_json, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![project_id, item.id, item.parent_id, item.name, item.menu_type, data_json_str, run_tab_json_str, sort_order, now, now],
    )?;

    Ok(ApiMenuData {
        id: item.id.clone(),
        parent_id: item.parent_id.clone(),
        name: item.name.clone(),
        menu_type: item.menu_type.clone(),
        data_json: item.data_json.clone(),
        run_tab_json: item.run_tab_json.clone(),
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
    if let Some(run_tab_json) = updates.get("runTabInfo") {
        conn.execute(
            "UPDATE menu_items SET run_tab_json = ?1, updated_at = ?2 WHERE project_id = ?3 AND id = ?4",
            params![run_tab_json.to_string(), now, project_id, menu_id],
        )?;
    }
    if let Some(parent_id) = updates.get("parentId").and_then(|v| v.as_str()) {
        conn.execute(
            "UPDATE menu_items SET parent_id = ?1, updated_at = ?2 WHERE project_id = ?3 AND id = ?4",
            params![parent_id, now, project_id, menu_id],
        )?;
    }

    let row = conn.query_row(
        "SELECT id, parent_id, name, type, data_json, run_tab_json, sort_order, created_at, updated_at
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
                run_tab_json: row.get::<_, Option<String>>(5).ok().flatten()
                    .and_then(|s| serde_json::from_str(&s).ok()),
                sort_order: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )?;

    Ok(row)
}

pub fn delete_menu_item(db: &Db, project_id: &str, menu_id: &str) -> Result<(), crate::errors::AppError> {
    let mut conn = db.0.lock().unwrap();
    let tx = conn.transaction()?;
    let result = delete_menu_item_in_tx(&tx, project_id, menu_id);
    match result {
        Ok(()) => tx.commit()?,
        Err(e) => return Err(e),
    }
    Ok(())
}

pub fn batch_delete_menu_items(
    db: &Db,
    project_id: &str,
    menu_ids: &[String],
) -> Result<(), crate::errors::AppError> {
    let mut conn = db.0.lock().unwrap();
    let tx = conn.transaction()?;
    for id in menu_ids {
        delete_menu_item_in_tx(&tx, project_id, id)?;
    }
    tx.commit()?;
    Ok(())
}

/// 级联删除单个菜单项:目标及其全部后代逐条写入回收站后一并删除。
/// 全程调用方事务内执行,避免"部分进了回收站、部分被删"的中间态。
fn delete_menu_item_in_tx(
    tx: &Transaction,
    project_id: &str,
    menu_id: &str,
) -> Result<(), crate::errors::AppError> {
    // 目标 + 全部后代 id(递归)
    let ids: Vec<String> = {
        let mut stmt = tx.prepare(
            "WITH RECURSIVE descendants(id) AS (
                SELECT id FROM menu_items WHERE project_id = ?1 AND id = ?2
                UNION ALL
                SELECT m.id FROM menu_items m JOIN descendants d ON m.parent_id = d.id
             )
             SELECT id FROM descendants",
        )?;
        let rows = stmt.query_map(params![project_id, menu_id], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    if ids.is_empty() {
        return Err(crate::errors::AppError::NotFound(format!(
            "菜单项不存在: {menu_id}"
        )));
    }

    let rows: Vec<ApiMenuData> = {
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let sql = format!(
            "SELECT id, parent_id, name, type, data_json, run_tab_json, sort_order, created_at, updated_at
             FROM menu_items WHERE project_id = ? AND id IN ({placeholders})"
        );
        let mut stmt = tx.prepare(&sql)?;
        let mut query_params: Vec<&dyn rusqlite::ToSql> = vec![&project_id];
        for id in &ids {
            query_params.push(id);
        }
        let mapped = stmt.query_map(query_params.as_slice(), row_to_menu_data)?;
        mapped.collect::<Result<Vec<_>, _>>()?
    };

    let now = chrono::Utc::now().to_rfc3339();
    let expires_at = chrono::Utc::now().timestamp_millis() + 30 * 24 * 60 * 60 * 1000;
    let creator_json = serde_json::json!({"id": "", "username": "system"}).to_string();

    for item in &rows {
        let deleted_json = serde_json::to_string(item).unwrap_or_default();
        tx.execute(
            "INSERT INTO recycle_items (id, project_id, catalog_type, deleted_item_json, creator_json, expires_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![Uuid::new_v4().to_string(), project_id, item.menu_type, deleted_json, creator_json, expires_at, now],
        )?;
    }

    {
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let sql = format!(
            "DELETE FROM menu_items WHERE project_id = ? AND id IN ({placeholders})"
        );
        let mut stmt = tx.prepare(&sql)?;
        let mut query_params: Vec<&dyn rusqlite::ToSql> = vec![&project_id];
        for id in &ids {
            query_params.push(id);
        }
        stmt.execute(query_params.as_slice())?;
    }

    Ok(())
}

fn row_to_menu_data(row: &rusqlite::Row<'_>) -> rusqlite::Result<ApiMenuData> {
    Ok(ApiMenuData {
        id: row.get(0)?,
        parent_id: row.get(1)?,
        name: row.get(2)?,
        menu_type: row.get(3)?,
        data_json: row.get::<_, Option<String>>(4).ok().flatten()
            .and_then(|s| serde_json::from_str(&s).ok()),
        run_tab_json: row.get::<_, Option<String>>(5).ok().flatten()
            .and_then(|s| serde_json::from_str(&s).ok()),
        sort_order: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

struct MoveRow {
    parent_id: Option<String>,
    menu_type: String,
    sort_order: i32,
}

fn load_move_row(
    conn: &Connection,
    project_id: &str,
    menu_id: &str,
) -> Result<MoveRow, crate::errors::AppError> {
    conn.query_row(
        "SELECT parent_id, type, sort_order FROM menu_items WHERE project_id = ?1 AND id = ?2",
        params![project_id, menu_id],
        |row| {
            Ok(MoveRow {
                parent_id: row.get(0)?,
                menu_type: row.get(1)?,
                sort_order: row.get(2)?,
            })
        },
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            crate::errors::AppError::NotFound(format!("菜单项不存在: {menu_id}"))
        }
        other => other.into(),
    })
}

/// 判断 candidate_id 是否位于 ancestor_id 的子树内(不含自身)。
fn is_descendant_of(
    conn: &Connection,
    project_id: &str,
    ancestor_id: &str,
    candidate_id: &str,
) -> Result<bool, crate::errors::AppError> {
    let exists: bool = conn.query_row(
        "WITH RECURSIVE descendants(id) AS (
            SELECT id FROM menu_items WHERE project_id = ?1 AND parent_id = ?2
            UNION ALL
            SELECT m.id FROM menu_items m JOIN descendants d ON m.parent_id = d.id
         )
         SELECT EXISTS(SELECT 1 FROM descendants WHERE id = ?3)",
        params![project_id, ancestor_id, candidate_id],
        |row| row.get(0),
    )?;
    Ok(exists)
}

pub fn move_menu_items(
    db: &Db,
    project_id: &str,
    drag_key: &str,
    drop_key: &str,
    drop_position: i32,
) -> Result<(), crate::errors::AppError> {
    if drag_key == drop_key {
        return Ok(());
    }

    let mut conn = db.0.lock().unwrap();
    let tx = conn.transaction()?;

    let drag = load_move_row(&tx, project_id, drag_key)?;
    let drop = load_move_row(&tx, project_id, drop_key)?;
    let now = chrono::Utc::now().to_rfc3339();

    let is_folder = FOLDER_TYPES.contains(&drop.menu_type.as_str());

    if drop_position == 0 && is_folder {
        // 放入目录内部
        if drag.menu_type == "apiDetailFolder"
            || drag.menu_type == "apiSchemaFolder"
            || drag.menu_type == "requestFolder"
        {
            // 目录拖入目录:目标不得位于拖动节点子树内,否则成环
            if is_descendant_of(&tx, project_id, drag_key, drop_key)? {
                return Err(crate::errors::AppError::BadRequest(
                    "不能将目录移动到其自身或其子级内".into(),
                ));
            }
        }
        let max_order: i32 = tx.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM menu_items WHERE project_id = ?1 AND parent_id = ?2",
            params![project_id, drop_key],
            |row| row.get(0),
        )?;
        tx.execute(
            "UPDATE menu_items SET parent_id = ?1, sort_order = ?2, updated_at = ?3 WHERE project_id = ?4 AND id = ?5",
            params![drop_key, max_order + 1, now, project_id, drag_key],
        )?;
    } else {
        // 同级插入:放到目标的上方(-1)或下方(1);drop_position==0 但目标非目录时降级为下方
        let insert_after = drop_position != -1;

        // 新父级不得位于拖动节点子树内(目录环防御),也不得是拖动节点本身
        if let Some(new_parent) = &drop.parent_id {
            if new_parent == drag_key
                || is_descendant_of(&tx, project_id, drag_key, new_parent)?
            {
                return Err(crate::errors::AppError::BadRequest(
                    "不能将菜单移动到其自身或其子级内".into(),
                ));
            }
        }

        if insert_after {
            // 下方:占用目标后一位,其后兄弟整体后移
            tx.execute(
                "UPDATE menu_items SET sort_order = sort_order + 1, updated_at = ?1
                 WHERE project_id = ?2 AND parent_id IS ?3 AND sort_order > ?4 AND id != ?5",
                params![now, project_id, drop.parent_id, drop.sort_order, drag_key],
            )?;
            tx.execute(
                "UPDATE menu_items SET parent_id = ?1, sort_order = ?2, updated_at = ?3 WHERE project_id = ?4 AND id = ?5",
                params![drop.parent_id, drop.sort_order + 1, now, project_id, drag_key],
            )?;
        } else {
            // 上方:占用目标位置,目标及其后兄弟整体后移
            tx.execute(
                "UPDATE menu_items SET sort_order = sort_order + 1, updated_at = ?1
                 WHERE project_id = ?2 AND parent_id IS ?3 AND sort_order >= ?4 AND id != ?5",
                params![now, project_id, drop.parent_id, drop.sort_order, drag_key],
            )?;
            tx.execute(
                "UPDATE menu_items SET parent_id = ?1, sort_order = ?2, updated_at = ?3 WHERE project_id = ?4 AND id = ?5",
                params![drop.parent_id, drop.sort_order, now, project_id, drag_key],
            )?;
        }
    }

    tx.commit()?;
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
    let run_tab_json_str = item.run_tab_json.as_ref().map(|v| v.to_string());

    conn.execute(
        "INSERT OR REPLACE INTO menu_items (project_id, id, parent_id, name, type, data_json, run_tab_json, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![project_id, item.id, item.parent_id, item.name, item.menu_type, data_json_str, run_tab_json_str, item.sort_order, item.created_at, now],
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
        "SELECT id, parent_id, name, type, data_json, run_tab_json, sort_order, created_at, updated_at
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
                run_tab_json: row.get::<_, Option<String>>(5).ok().flatten()
                    .and_then(|s| serde_json::from_str(&s).ok()),
                sort_order: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
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
        "SELECT id, parent_id, name, type, data_json, run_tab_json, sort_order, created_at, updated_at
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
            run_tab_json: row.get::<_, Option<String>>(5).ok().flatten()
                .and_then(|s| serde_json::from_str(&s).ok()),
            sort_order: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn test_db() -> Db {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::client::create_tables(&conn);
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1', 'tester', 'x', '2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, owner_id, created_at) VALUES ('p1', 'demo', 'u1', '2026-01-01')",
            [],
        )
        .unwrap();
        Db(Mutex::new(conn))
    }

    fn insert_item(db: &Db, id: &str, parent: Option<&str>, name: &str, menu_type: &str, sort: i32) {
        db.0.lock().unwrap()
            .execute(
                "INSERT INTO menu_items (project_id, id, parent_id, name, type, data_json, run_tab_json, sort_order, created_at, updated_at)
                 VALUES ('p1', ?1, ?2, ?3, ?4, NULL, NULL, ?5, '2026-01-01', '2026-01-01')",
                params![id, parent, name, menu_type, sort],
            )
            .unwrap();
    }

    fn count_menu(db: &Db) -> i64 {
        db.0.lock().unwrap()
            .query_row("SELECT COUNT(*) FROM menu_items WHERE project_id = 'p1'", [], |r| r.get(0))
            .unwrap()
    }

    fn count_recycle(db: &Db) -> i64 {
        db.0.lock().unwrap()
            .query_row("SELECT COUNT(*) FROM recycle_items WHERE project_id = 'p1'", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn delete_folder_cascades_descendants_into_recycle() {
        let db = test_db();
        insert_item(&db, "f1", None, "目录", "apiDetailFolder", 0);
        insert_item(&db, "a1", Some("f1"), "接口A", "apiDetail", 0);
        insert_item(&db, "f2", Some("f1"), "子目录", "apiDetailFolder", 1);
        insert_item(&db, "a2", Some("f2"), "接口B", "apiDetail", 0);
        insert_item(&db, "a3", None, "顶层接口", "apiDetail", 1);

        delete_menu_item(&db, "p1", "f1").unwrap();

        assert_eq!(count_menu(&db), 1, "仅剩顶层接口 a3");
        assert_eq!(count_recycle(&db), 4, "目录+2接口+子目录 均入回收站");

        let recycled_ids: Vec<String> = {
            let conn = db.0.lock().unwrap();
            let mut stmt = conn.prepare("SELECT deleted_item_json FROM recycle_items").unwrap();
            let rows = stmt.query_map([], |r| r.get::<_, String>(0)).unwrap();
            rows.map(|j| {
                let item: ApiMenuData = serde_json::from_str(&j.unwrap()).unwrap();
                item.id
            })
            .collect()
        };
        for id in ["f1", "a1", "f2", "a2"] {
            assert!(recycled_ids.contains(&id.to_string()), "回收站应含 {id}");
        }
    }

    #[test]
    fn delete_leaf_only_recycles_itself() {
        let db = test_db();
        insert_item(&db, "f1", None, "目录", "apiDetailFolder", 0);
        insert_item(&db, "a1", Some("f1"), "接口A", "apiDetail", 0);

        delete_menu_item(&db, "p1", "a1").unwrap();

        assert_eq!(count_menu(&db), 1);
        assert_eq!(count_recycle(&db), 1);
    }

    #[test]
    fn delete_missing_item_returns_not_found() {
        let db = test_db();
        let err = delete_menu_item(&db, "p1", "ghost").unwrap_err();
        assert!(matches!(err, crate::errors::AppError::NotFound(_)));
    }

    #[test]
    fn move_into_folder_appends_as_last_child() {
        let db = test_db();
        insert_item(&db, "f1", None, "目录", "apiDetailFolder", 0);
        insert_item(&db, "a1", Some("f1"), "接口A", "apiDetail", 0);
        insert_item(&db, "a2", None, "接口B", "apiDetail", 1);

        move_menu_items(&db, "p1", "a2", "f1", 0).unwrap();

        let conn = db.0.lock().unwrap();
        let (parent, sort): (Option<String>, i32) = conn
            .query_row("SELECT parent_id, sort_order FROM menu_items WHERE id = 'a2'", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(parent.as_deref(), Some("f1"));
        assert_eq!(sort, 1, "追加到目录末尾");
    }

    #[test]
    fn move_below_sibling_keeps_same_parent_and_reorders() {
        let db = test_db();
        insert_item(&db, "a1", None, "接口A", "apiDetail", 0);
        insert_item(&db, "a2", None, "接口B", "apiDetail", 1);
        insert_item(&db, "a3", None, "接口C", "apiDetail", 2);

        // a1 拖到 a2 下方 → 顺序 a2, a1, a3
        move_menu_items(&db, "p1", "a1", "a2", 1).unwrap();

        let conn = db.0.lock().unwrap();
        let sort_a2: i32 = conn.query_row("SELECT sort_order FROM menu_items WHERE id = 'a2'", [], |r| r.get(0)).unwrap();
        let sort_a1: i32 = conn.query_row("SELECT sort_order FROM menu_items WHERE id = 'a1'", [], |r| r.get(0)).unwrap();
        let sort_a3: i32 = conn.query_row("SELECT sort_order FROM menu_items WHERE id = 'a3'", [], |r| r.get(0)).unwrap();
        assert!(sort_a2 < sort_a1 && sort_a1 < sort_a3, "a2 < a1 < a3");
    }

    #[test]
    fn move_above_sibling_reorders() {
        let db = test_db();
        insert_item(&db, "a1", None, "接口A", "apiDetail", 0);
        insert_item(&db, "a2", None, "接口B", "apiDetail", 1);

        // a2 拖到 a1 上方 → 顺序 a2, a1
        move_menu_items(&db, "p1", "a2", "a1", -1).unwrap();

        let conn = db.0.lock().unwrap();
        let sort_a2: i32 = conn.query_row("SELECT sort_order FROM menu_items WHERE id = 'a2'", [], |r| r.get(0)).unwrap();
        let sort_a1: i32 = conn.query_row("SELECT sort_order FROM menu_items WHERE id = 'a1'", [], |r| r.get(0)).unwrap();
        assert!(sort_a2 < sort_a1);
    }

    #[test]
    fn move_folder_into_own_descendant_is_rejected() {
        let db = test_db();
        insert_item(&db, "f1", None, "目录", "apiDetailFolder", 0);
        insert_item(&db, "f2", Some("f1"), "子目录", "apiDetailFolder", 0);

        let err = move_menu_items(&db, "p1", "f1", "f2", 0).unwrap_err();
        assert!(matches!(err, crate::errors::AppError::BadRequest(_)));

        // 同级插入:f2(f1 的孩子)拖到 f1 下方,新 parent 为根(NULL),允许
        move_menu_items(&db, "p1", "f2", "f1", 1).unwrap();
        let conn = db.0.lock().unwrap();
        let parent_f2: Option<String> = conn
            .query_row("SELECT parent_id FROM menu_items WHERE id = 'f2'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(parent_f2, None::<String>, "f2 移动到根级");
    }

    #[test]
    fn move_to_same_key_is_noop() {
        let db = test_db();
        insert_item(&db, "a1", None, "接口A", "apiDetail", 0);
        move_menu_items(&db, "p1", "a1", "a1", 1).unwrap();
        assert_eq!(count_menu(&db), 1);
    }
}

