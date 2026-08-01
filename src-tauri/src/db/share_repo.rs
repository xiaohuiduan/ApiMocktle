use rusqlite::params;
use uuid::Uuid;

use crate::db::client::Db;
use crate::models::ShareLink;

/// 过期时间统一存 RFC3339 字符串。输入可为 "YYYY-MM-DD"（按当天末刻）或完整 RFC3339。
fn normalize_expiry(expires_at: &str) -> Option<String> {
    let trimmed = expires_at.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(trimmed) {
        return Some(dt.with_timezone(&chrono::Utc).to_rfc3339());
    }
    if let Ok(date) = chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
        let end = date.and_hms_opt(23, 59, 59)?;
        return Some(chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
            end,
            chrono::Utc,
        )
        .to_rfc3339());
    }
    None
}

/// 链接是否已过期。无过期时间（None）视为永不过期。
pub fn share_expired(expires_at: &Option<String>) -> bool {
    let Some(s) = expires_at else { return false };
    let Ok(exp) = chrono::DateTime::parse_from_rfc3339(s) else {
        return false;
    };
    chrono::Utc::now() >= exp.with_timezone(&chrono::Utc)
}

pub fn create_share_link(
    db: &Db,
    project_id: &str,
    creator_user_id: &str,
    api_menu_ids: Vec<String>,
    password_hash: Option<String>,
    expires_at: Option<String>,
    title: &str,
) -> Result<ShareLink, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let menu_ids_json = serde_json::to_string(&api_menu_ids)?;
    let expires_normalized = expires_at.as_deref().and_then(normalize_expiry);

    conn.execute(
        "INSERT INTO share_links (id, project_id, creator_user_id, api_menu_ids, password_hash, expires_at, title, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            project_id,
            creator_user_id,
            menu_ids_json,
            password_hash,
            expires_normalized,
            title,
            now
        ],
    )?;

    Ok(ShareLink {
        id,
        project_id: project_id.to_string(),
        creator_user_id: creator_user_id.to_string(),
        api_menu_ids,
        password_hash,
        expires_at: expires_normalized,
        title: title.to_string(),
        created_at: now,
        project_name: None,
    })
}

fn row_to_share_link(
    row: &rusqlite::Row<'_>,
    with_project_name: bool,
) -> rusqlite::Result<ShareLink> {
    let menu_ids_json: String = row.get(3)?;
    let api_menu_ids: Vec<String> =
        serde_json::from_str(&menu_ids_json).unwrap_or_default();
    let project_name = if with_project_name { row.get(8)? } else { None };
    Ok(ShareLink {
        id: row.get(0)?,
        project_id: row.get(1)?,
        creator_user_id: row.get(2)?,
        api_menu_ids,
        password_hash: row.get(4)?,
        expires_at: row.get(5)?,
        title: row.get(6)?,
        created_at: row.get(7)?,
        project_name,
    })
}

pub fn get_share_link(db: &Db, id: &str) -> Result<Option<ShareLink>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT id, project_id, creator_user_id, api_menu_ids, password_hash, expires_at, title, created_at
         FROM share_links WHERE id = ?1",
        params![id],
        |row| row_to_share_link(row, false),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(crate::errors::AppError::from(other)),
    })
}

pub fn list_share_links(db: &Db) -> Result<Vec<ShareLink>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT s.id, s.project_id, s.creator_user_id, s.api_menu_ids, s.password_hash, s.expires_at, s.title, s.created_at, p.name
         FROM share_links s LEFT JOIN projects p ON p.id = s.project_id
         ORDER BY s.created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| row_to_share_link(row, true))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

pub fn delete_share_link(db: &Db, id: &str) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM share_links WHERE id = ?1", params![id])?;
    Ok(())
}
