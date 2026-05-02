use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::db::client::Db;

pub struct UserRow {
    pub id: String,
    pub username: String,
    pub password_hash: String,
}

pub struct SessionRow {
    pub id: String,
    pub user_id: String,
    pub expires_at: i64,
}

pub fn create_user(
    db: &Db,
    username: &str,
    password_hash: &str,
) -> Result<UserRow, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, username, password_hash, now],
    )?;

    Ok(UserRow {
        id,
        username: username.to_string(),
        password_hash: password_hash.to_string(),
    })
}

pub fn get_user_by_username(db: &Db, username: &str) -> Option<UserRow> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT id, username, password_hash FROM users WHERE username = ?1",
        params![username],
        |row| {
            Ok(UserRow {
                id: row.get(0)?,
                username: row.get(1)?,
                password_hash: row.get(2)?,
            })
        },
    )
    .ok()
}

pub fn get_user_by_id(db: &Db, user_id: &str) -> Option<(String, String)> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT id, username FROM users WHERE id = ?1",
        params![user_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .ok()
}

pub fn create_session(db: &Db, user_id: &str, expires_at: i64) -> Result<String, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, user_id, expires_at, now],
    )?;

    Ok(id)
}

pub fn delete_session(db: &Db, session_id: &str) {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![session_id])
        .ok();
}

pub fn get_session(db: &Db, session_id: &str) -> Option<SessionRow> {
    let conn = db.0.lock().unwrap();
    clear_expired_sessions_inner(&conn);

    conn.query_row(
        "SELECT id, user_id, expires_at FROM sessions WHERE id = ?1",
        params![session_id],
        |row| {
            Ok(SessionRow {
                id: row.get(0)?,
                user_id: row.get(1)?,
                expires_at: row.get(2)?,
            })
        },
    )
    .ok()
}

fn clear_expired_sessions_inner(conn: &Connection) {
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?1", params![now])
        .ok();
}

pub fn get_valid_session_user(
    db: &Db,
    session_id: &str,
) -> Option<crate::models::SessionUser> {
    let session = get_session(db, session_id)?;
    let now = chrono::Utc::now().timestamp_millis();

    if session.expires_at <= now {
        return None;
    }

    let user = get_user_by_id(db, &session.user_id)?;
    Some(crate::models::SessionUser {
        id: user.0,
        username: user.1,
    })
}
