use rusqlite::params;
use uuid::Uuid;

use crate::db::client::Db;
use crate::models::PersonalToken;

fn generate_token() -> String {
    let bytes: [u8; 16] = rand::random();
    hex::encode(bytes)
}

pub fn list_personal_tokens(
    db: &Db,
    user_id: &str,
) -> Result<Vec<PersonalToken>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, user_id, token, name, created_at FROM personal_tokens WHERE user_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        Ok(PersonalToken {
            id: row.get(0)?,
            user_id: row.get(1)?,
            token: row.get(2)?,
            name: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

pub fn create_personal_token(
    db: &Db,
    user_id: &str,
    name: &str,
) -> Result<PersonalToken, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let token = generate_token();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO personal_tokens (id, user_id, token, name, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, user_id, token, name, now],
    )?;

    Ok(PersonalToken {
        id,
        user_id: user_id.to_string(),
        token,
        name: name.to_string(),
        created_at: now,
    })
}

pub fn delete_personal_token(
    db: &Db,
    user_id: &str,
    token_id: &str,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "DELETE FROM personal_tokens WHERE id = ?1 AND user_id = ?2",
        params![token_id, user_id],
    )?;
    Ok(())
}

pub fn find_user_by_personal_token(
    db: &Db,
    token: &str,
) -> Option<String> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT user_id FROM personal_tokens WHERE token = ?1",
        params![token],
        |row| row.get(0),
    )
    .ok()
}
