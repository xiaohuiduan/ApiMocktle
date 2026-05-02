
use rusqlite::params;
use uuid::Uuid;

use crate::db::client::Db;
use crate::models::ProjectToken;

fn generate_token() -> String {
    let bytes: [u8; 32] = rand::random();
    hex::encode(bytes)
}

pub fn list_project_tokens(
    db: &Db,
    project_id: &str,
) -> Result<Vec<ProjectToken>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, project_id, token, name, created_at FROM project_tokens WHERE project_id = ?1 ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map(params![project_id], |row| {
        Ok(ProjectToken {
            id: row.get(0)?,
            project_id: row.get(1)?,
            token: row.get(2)?,
            name: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

pub fn create_project_token(
    db: &Db,
    project_id: &str,
    name: &str,
) -> Result<ProjectToken, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let token = generate_token();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO project_tokens (id, project_id, token, name, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, project_id, token, name, now],
    )?;

    Ok(ProjectToken {
        id,
        project_id: project_id.to_string(),
        token,
        name: name.to_string(),
        created_at: now,
    })
}

pub fn delete_project_token(
    db: &Db,
    project_id: &str,
    token_id: &str,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "DELETE FROM project_tokens WHERE id = ?1 AND project_id = ?2",
        params![token_id, project_id],
    )?;
    Ok(())
}

pub fn find_project_by_token(
    db: &Db,
    token: &str,
) -> Option<String> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT project_id FROM project_tokens WHERE token = ?1",
        params![token],
        |row| row.get(0),
    )
    .ok()
}
