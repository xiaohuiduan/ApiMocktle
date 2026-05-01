use rusqlite::params;
use uuid::Uuid;

use crate::db::client::Db;
use crate::models::ShareLinkItem;

pub fn list_share_links(
    db: &Db,
    project_id: &str,
) -> Result<Vec<ShareLinkItem>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, project_id, creator_user_id, api_menu_ids, password_hash, access_key, title, expires_at, created_at
         FROM share_links WHERE project_id = ?1 ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map(params![project_id], |row| {
        Ok(ShareLinkItem {
            id: row.get(0)?,
            project_id: row.get(1)?,
            creator_user_id: row.get(2)?,
            api_menu_ids: row.get(3)?,
            password_hash: row.get(4)?,
            access_key: row.get(5)?,
            title: row.get(6)?,
            expires_at: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

pub fn create_share_link(
    db: &Db,
    project_id: &str,
    creator_user_id: &str,
    api_menu_ids: &str,
    password_hash: Option<&str>,
    title: &str,
    expires_at: Option<&str>,
) -> Result<ShareLinkItem, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let access_key = if password_hash.is_some() {
        Some(Uuid::new_v4().to_string())
    } else {
        None
    };

    conn.execute(
        "INSERT INTO share_links (id, project_id, creator_user_id, api_menu_ids, password_hash, access_key, title, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, project_id, creator_user_id, api_menu_ids, password_hash, access_key, title, expires_at, now],
    )?;

    Ok(ShareLinkItem {
        id,
        project_id: project_id.to_string(),
        creator_user_id: creator_user_id.to_string(),
        api_menu_ids: api_menu_ids.to_string(),
        password_hash: password_hash.map(|s| s.to_string()),
        access_key,
        title: title.to_string(),
        expires_at: expires_at.map(|s| s.to_string()),
        created_at: now,
    })
}

pub fn update_share_link(
    db: &Db,
    project_id: &str,
    share_id: &str,
    password_hash: Option<&str>,
    title: Option<&str>,
    expires_at: Option<&str>,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();

    let access_key = if password_hash.is_some() {
        let existing: Option<String> = conn.query_row(
            "SELECT access_key FROM share_links WHERE id = ?1 AND project_id = ?2",
            params![share_id, project_id],
            |row| row.get(0),
        ).ok().flatten();
        existing.or_else(|| Some(Uuid::new_v4().to_string()))
    } else {
        None
    };

    conn.execute(
        "UPDATE share_links SET password_hash = ?1, access_key = ?2, title = COALESCE(?3, title), expires_at = ?4 WHERE id = ?5 AND project_id = ?6",
        params![password_hash, access_key, title, expires_at, share_id, project_id],
    )?;

    Ok(())
}

pub fn delete_share_link(
    db: &Db,
    project_id: &str,
    share_id: &str,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "DELETE FROM share_links WHERE id = ?1 AND project_id = ?2",
        params![share_id, project_id],
    )?;
    Ok(())
}

pub fn get_share_link_by_id(
    db: &Db,
    share_id: &str,
) -> Option<ShareLinkItem> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT id, project_id, creator_user_id, api_menu_ids, password_hash, access_key, title, expires_at, created_at
         FROM share_links WHERE id = ?1",
        params![share_id],
        |row| {
            Ok(ShareLinkItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                creator_user_id: row.get(2)?,
                api_menu_ids: row.get(3)?,
                password_hash: row.get(4)?,
                access_key: row.get(5)?,
                title: row.get(6)?,
                expires_at: row.get(7)?,
                created_at: row.get(8)?,
            })
        },
    )
    .ok()
}

pub fn get_share_link_by_access_key(
    db: &Db,
    access_key: &str,
) -> Option<ShareLinkItem> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT id, project_id, creator_user_id, api_menu_ids, password_hash, access_key, title, expires_at, created_at
         FROM share_links WHERE access_key = ?1",
        params![access_key],
        |row| {
            Ok(ShareLinkItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                creator_user_id: row.get(2)?,
                api_menu_ids: row.get(3)?,
                password_hash: row.get(4)?,
                access_key: row.get(5)?,
                title: row.get(6)?,
                expires_at: row.get(7)?,
                created_at: row.get(8)?,
            })
        },
    )
    .ok()
}
