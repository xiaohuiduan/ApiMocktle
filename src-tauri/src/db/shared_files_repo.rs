use rusqlite::params;
use uuid::Uuid;

use crate::db::client::Db;
use crate::models::{SharedDocItem, SharedFileItem, ApiResult};

pub fn list_shared_docs(
    db: &Db,
    project_id: &str,
) -> Result<Vec<SharedDocItem>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, project_id, creator_user_id, doc_type, title, content, y_state_base64, version, created_at, updated_at
         FROM shared_docs WHERE project_id = ?1 ORDER BY updated_at DESC",
    )?;

    let rows = stmt.query_map(params![project_id], |row| {
        Ok(SharedDocItem {
            id: row.get(0)?,
            project_id: row.get(1)?,
            creator_user_id: row.get(2)?,
            doc_type: row.get(3)?,
            title: row.get(4)?,
            content: row.get::<_, String>(5).unwrap_or_default(),
            y_state_base64: row.get::<_, String>(6).unwrap_or_default(),
            version: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

pub fn create_shared_doc(
    db: &Db,
    project_id: &str,
    user_id: &str,
    doc_type: &str,
    title: &str,
) -> Result<SharedDocItem, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO shared_docs (id, project_id, creator_user_id, doc_type, title, content, y_state_base64, version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, '', '', 1, ?6, ?7)",
        params![id, project_id, user_id, doc_type, title, now, now],
    )?;

    Ok(SharedDocItem {
        id,
        project_id: project_id.to_string(),
        creator_user_id: user_id.to_string(),
        doc_type: doc_type.to_string(),
        title: title.to_string(),
        content: String::new(),
        y_state_base64: String::new(),
        version: 1,
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn get_shared_doc(
    db: &Db,
    project_id: &str,
    doc_id: &str,
) -> Result<Option<SharedDocItem>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT id, project_id, creator_user_id, doc_type, title, content, y_state_base64, version, created_at, updated_at
         FROM shared_docs WHERE project_id = ?1 AND id = ?2",
        params![project_id, doc_id],
        |row| {
            Ok(SharedDocItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                creator_user_id: row.get(2)?,
                doc_type: row.get(3)?,
                title: row.get(4)?,
                content: row.get::<_, String>(5).unwrap_or_default(),
                y_state_base64: row.get::<_, String>(6).unwrap_or_default(),
                version: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

pub fn save_shared_doc(
    db: &Db,
    project_id: &str,
    doc_id: &str,
    content: Option<&str>,
    y_state_base64: Option<&str>,
    title: Option<&str>,
    version: Option<i32>,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(title) = title {
        conn.execute(
            "UPDATE shared_docs SET title = ?1, updated_at = ?2 WHERE project_id = ?3 AND id = ?4",
            params![title, now, project_id, doc_id],
        )?;
    }
    if let Some(content) = content {
        conn.execute(
            "UPDATE shared_docs SET content = ?1, updated_at = ?2 WHERE project_id = ?3 AND id = ?4",
            params![content, now, project_id, doc_id],
        )?;
    }
    if let Some(y_state_base64) = y_state_base64 {
        conn.execute(
            "UPDATE shared_docs SET y_state_base64 = ?1, updated_at = ?2 WHERE project_id = ?3 AND id = ?4",
            params![y_state_base64, now, project_id, doc_id],
        )?;
    }
    if let Some(version) = version {
        conn.execute(
            "UPDATE shared_docs SET version = ?1, updated_at = ?2 WHERE project_id = ?3 AND id = ?4",
            params![version, now, project_id, doc_id],
        )?;
    }

    Ok(())
}

pub fn delete_shared_doc(
    db: &Db,
    project_id: &str,
    doc_id: &str,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "DELETE FROM shared_docs WHERE project_id = ?1 AND id = ?2",
        params![project_id, doc_id],
    )?;
    Ok(())
}

pub fn list_shared_files(
    db: &Db,
    project_id: &str,
) -> Result<Vec<SharedFileItem>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, project_id, uploader_user_id, linked_doc_id, name, size, mime_type, created_at
         FROM shared_files WHERE project_id = ?1 ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map(params![project_id], |row| {
        Ok(SharedFileItem {
            id: row.get(0)?,
            project_id: row.get(1)?,
            uploader_user_id: row.get(2)?,
            linked_doc_id: row.get(3)?,
            name: row.get(4)?,
            size: row.get(5)?,
            mime_type: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

pub fn create_shared_file(
    db: &Db,
    project_id: &str,
    uploader_user_id: &str,
    name: &str,
    size: i64,
    mime_type: &str,
    storage_path: &str,
) -> Result<SharedFileItem, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO shared_files (id, project_id, uploader_user_id, name, size, mime_type, storage_path, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, project_id, uploader_user_id, name, size, mime_type, storage_path, now],
    )?;

    Ok(SharedFileItem {
        id,
        project_id: project_id.to_string(),
        uploader_user_id: uploader_user_id.to_string(),
        linked_doc_id: None,
        name: name.to_string(),
        size,
        mime_type: mime_type.to_string(),
        created_at: now,
    })
}

pub fn get_shared_file(
    db: &Db,
    project_id: &str,
    file_id: &str,
) -> Result<Option<SharedFileItem>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT id, project_id, uploader_user_id, linked_doc_id, name, size, mime_type, storage_path, created_at
         FROM shared_files WHERE project_id = ?1 AND id = ?2",
        params![project_id, file_id],
        |row| {
            Ok(SharedFileItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                uploader_user_id: row.get(2)?,
                linked_doc_id: row.get(3)?,
                name: row.get(4)?,
                size: row.get(5)?,
                mime_type: row.get(6)?,
                created_at: row.get(8)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

pub fn get_file_storage_path(
    db: &Db,
    project_id: &str,
    file_id: &str,
) -> Option<String> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT storage_path FROM shared_files WHERE project_id = ?1 AND id = ?2",
        params![project_id, file_id],
        |row| row.get(0),
    )
    .ok()
}

pub fn delete_shared_file(
    db: &Db,
    project_id: &str,
    file_id: &str,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "DELETE FROM shared_files WHERE project_id = ?1 AND id = ?2",
        params![project_id, file_id],
    )?;
    Ok(())
}

// Collab
pub fn get_collab_state(
    db: &Db,
    project_id: &str,
    doc_id: &str,
) -> Result<String, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT y_state_base64 FROM shared_docs WHERE project_id = ?1 AND id = ?2",
        params![project_id, doc_id],
        |row| row.get(0),
    )
    .map_err(|e| e.into())
}

pub fn apply_collab_update(
    db: &Db,
    project_id: &str,
    doc_id: &str,
    update_base64: &str,
) -> Result<String, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE shared_docs SET y_state_base64 = ?1, updated_at = ?2 WHERE project_id = ?3 AND id = ?4",
        params![update_base64, now, project_id, doc_id],
    )?;

    get_collab_state(db, project_id, doc_id)
}

pub fn update_presence(
    db: &Db,
    project_id: &str,
    doc_id: &str,
    user_id: &str,
    is_typing: bool,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let now = chrono::Utc::now().timestamp_millis();

    conn.execute(
        "INSERT OR REPLACE INTO shared_doc_presence (project_id, doc_id, user_id, is_typing, last_seen_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![project_id, doc_id, user_id, is_typing as i32, now],
    )?;

    Ok(())
}

pub fn get_doc_presence(
    db: &Db,
    project_id: &str,
    doc_id: &str,
) -> Result<Vec<serde_json::Value>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT u.id, u.username, p.is_typing, p.last_seen_at
         FROM shared_doc_presence p
         JOIN users u ON u.id = p.user_id
         WHERE p.project_id = ?1 AND p.doc_id = ?2",
    )?;

    let rows = stmt.query_map(params![project_id, doc_id], |row| {
        Ok(serde_json::json!({
            "userId": row.get::<_, String>(0)?,
            "username": row.get::<_, String>(1)?,
            "isTyping": row.get::<_, i32>(2)? != 0,
            "lastSeenAt": row.get::<_, i64>(3)?,
        }))
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}
