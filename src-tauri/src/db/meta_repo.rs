use rusqlite::params;
use crate::db::client::Db;

pub fn get_meta(db: &Db, project_id: &str, key: &str) -> Option<String> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT value FROM meta WHERE project_id = ?1 AND key = ?2",
        params![project_id, key],
        |row| row.get(0),
    )
    .ok()
}

pub fn set_meta(db: &Db, project_id: &str, key: &str, value: &str) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO meta (project_id, key, value) VALUES (?1, ?2, ?3)",
        params![project_id, key, value],
    )?;
    Ok(())
}
