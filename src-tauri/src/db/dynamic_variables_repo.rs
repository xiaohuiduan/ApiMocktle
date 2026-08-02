use rusqlite::{params, Connection, OptionalExtension};

use crate::errors::AppError;
use crate::models::{DynamicVariableDef, SaveDynamicVariablePayload};

/// 内置动态变量 seed（expression 类型，value 为 Rhai 引擎注册函数名）。
/// 求值代码内无硬编码变量清单；$processEnv 前缀为特判，不入库。
const BUILTIN_SEED: &[(&str, &str, &str)] = &[
    ("$timestamp", "timestamp", "秒级时间戳"),
    ("$timestampISO", "timestamp_iso", "ISO 8601 时间"),
    ("$guid", "guid", "UUID（带横线）"),
    ("$randomUUID", "random_uuid", "UUID（32 位无横线）"),
    ("$randomInt", "random_int", "0-1000 随机整数（可带参 min,max）"),
    ("$randomEmail", "random_email", "随机邮箱"),
    ("$randomIP", "random_ip", "随机 IPv4 地址"),
    ("$randomMobile", "random_mobile", "11 位随机手机号"),
    ("$randomString", "random_string", "8 位随机字母字符串（可带参长度）"),
];

pub fn row_to_def(row: &rusqlite::Row) -> Result<DynamicVariableDef, rusqlite::Error> {
    Ok(DynamicVariableDef {
        id: row.get(0)?,
        name: row.get(1)?,
        var_type: row.get(2)?,
        value: row.get(3)?,
        description: row.get(4)?,
        is_builtin: row.get::<_, i64>(5)? != 0,
        enabled: row.get::<_, i64>(6)? != 0,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

pub fn list(db: &crate::db::client::Db) -> Result<Vec<DynamicVariableDef>, AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, var_type, value, description, is_builtin, enabled, created_at, updated_at
         FROM dynamic_variables ORDER BY is_builtin DESC, name",
    )?;
    let rows = stmt
        .query_map([], row_to_def)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_by_name(db: &crate::db::client::Db, name: &str) -> Result<Option<DynamicVariableDef>, AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, var_type, value, description, is_builtin, enabled, created_at, updated_at
         FROM dynamic_variables WHERE name = ?1",
    )?;
    let mut rows = stmt.query_map(params![name], row_to_def)?;
    Ok(rows.next().transpose()?)
}

pub fn ensure_seed(db: &crate::db::client::Db) -> Result<(), AppError> {
    let conn = db.0.lock().unwrap();
    for (name, func, desc) in BUILTIN_SEED {
        conn.execute(
            "INSERT OR IGNORE INTO dynamic_variables
             (id, name, var_type, value, description, is_builtin, enabled, created_at, updated_at)
             VALUES (?1, ?2, 'expression', ?3, ?4, 1, 1, ?5, ?5)",
            params![uuid::Uuid::new_v4().to_string(), name, func, desc, chrono::Utc::now().to_rfc3339()],
        )?;
    }
    Ok(())
}

fn is_builtin(conn: &Connection, id: &str) -> Result<bool, AppError> {
    let is: Option<i64> = conn
        .query_row("SELECT is_builtin FROM dynamic_variables WHERE id = ?1", params![id], |r| r.get(0))
        .optional()?;
    Ok(is.unwrap_or(0) != 0)
}

/// 新建或更新。内置变量仅允许修改 description / enabled。
pub fn save(db: &crate::db::client::Db, payload: &SaveDynamicVariablePayload) -> Result<DynamicVariableDef, AppError> {
    let name = payload.name.trim().to_string();
    if !name.starts_with('$') {
        return Err(AppError::BadRequest("变量名必须以 $ 开头".into()));
    }
    if name.len() < 2 {
        return Err(AppError::BadRequest("变量名过短".into()));
    }
    if !["static", "expression", "script"].contains(&payload.var_type.as_str()) {
        return Err(AppError::BadRequest("type 必须是 static / expression / script".into()));
    }
    if payload.value.trim().is_empty() {
        return Err(AppError::BadRequest("value 不能为空".into()));
    }

    let conn = db.0.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();

    if payload.id.is_empty() {
        // 新建
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO dynamic_variables (id, name, var_type, value, description, is_builtin, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?7)",
            params![id, name, payload.var_type, payload.value, payload.description, payload.enabled as i64, now],
        )?;
        return Ok(DynamicVariableDef {
            id,
            name,
            var_type: payload.var_type.clone(),
            value: payload.value.clone(),
            description: payload.description.clone(),
            is_builtin: false,
            enabled: payload.enabled,
            created_at: now.clone(),
            updated_at: now,
        });
    }

    // 更新
    let existing = conn
        .query_row("SELECT id FROM dynamic_variables WHERE id = ?1", params![payload.id], |r| r.get::<_, String>(0))
        .optional()?;
    if existing.is_none() {
        return Err(AppError::NotFound("动态变量不存在".into()));
    }

    if is_builtin(&conn, &payload.id)? {
        // 内置：仅允许改 description / enabled
        conn.execute(
            "UPDATE dynamic_variables SET description = ?1, enabled = ?2, updated_at = ?3 WHERE id = ?4",
            params![payload.description, payload.enabled as i64, now, payload.id],
        )?;
    } else {
        conn.execute(
            "UPDATE dynamic_variables SET name = ?1, var_type = ?2, value = ?3, description = ?4, enabled = ?5, updated_at = ?6 WHERE id = ?7",
            params![name, payload.var_type, payload.value, payload.description, payload.enabled as i64, now, payload.id],
        )?;
    }

    let mut stmt = conn.prepare(
        "SELECT id, name, var_type, value, description, is_builtin, enabled, created_at, updated_at
         FROM dynamic_variables WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![payload.id], row_to_def)?;
    rows.next().transpose()?.ok_or_else(|| AppError::NotFound("动态变量不存在".into()))
}

/// 删除（内置变量禁止删除）。
pub fn delete(db: &crate::db::client::Db, id: &str) -> Result<(), AppError> {
    let conn = db.0.lock().unwrap();
    if is_builtin(&conn, id)? {
        return Err(AppError::Forbidden("内置变量不可删除".into()));
    }
    let affected = conn.execute("DELETE FROM dynamic_variables WHERE id = ?1", params![id])?;
    if affected == 0 {
        return Err(AppError::NotFound("动态变量不存在".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> crate::db::client::Db {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE dynamic_variables (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                var_type TEXT NOT NULL,
                value TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                is_builtin INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );",
        )
        .unwrap();
        crate::db::client::Db(std::sync::Mutex::new(conn))
    }

    #[test]
    fn seed_is_idempotent() {
        let db = test_db();
        ensure_seed(&db).unwrap();
        ensure_seed(&db).unwrap();
        let all = list(&db).unwrap();
        assert_eq!(all.len(), BUILTIN_SEED.len());
        assert!(all.iter().all(|d| d.is_builtin));
    }

    #[test]
    fn seed_names_match_builtin() {
        let db = test_db();
        ensure_seed(&db).unwrap();
        for (name, func, _) in BUILTIN_SEED {
            let def = get_by_name(&db, name).unwrap().expect("seed 存在");
            assert_eq!(def.var_type, "expression");
            assert_eq!(def.value, *func);
        }
    }

    #[test]
    fn save_create_and_update_custom() {
        let db = test_db();
        ensure_seed(&db).unwrap();

        let created = save(
            &db,
            &SaveDynamicVariablePayload {
                id: String::new(),
                name: "$myToken".into(),
                var_type: "static".into(),
                value: "abc123".into(),
                description: "我的令牌".into(),
                enabled: true,
            },
        )
        .unwrap();
        assert!(!created.is_builtin);
        assert_eq!(created.name, "$myToken");

        let updated = save(
            &db,
            &SaveDynamicVariablePayload {
                id: created.id.clone(),
                name: "$myToken".into(),
                var_type: "static".into(),
                value: "new-value".into(),
                description: "改过了".into(),
                enabled: false,
            },
        )
        .unwrap();
        assert_eq!(updated.value, "new-value");
        assert!(!updated.enabled);
    }

    #[test]
    fn save_rejects_bad_input() {
        let db = test_db();
        assert!(save(
            &db,
            &SaveDynamicVariablePayload {
                id: String::new(),
                name: "noPrefix".into(),
                var_type: "static".into(),
                value: "x".into(),
                description: String::new(),
                enabled: true,
            },
        )
        .is_err());

        assert!(save(
            &db,
            &SaveDynamicVariablePayload {
                id: String::new(),
                name: "$bad".into(),
                var_type: "evil".into(),
                value: "x".into(),
                description: String::new(),
                enabled: true,
            },
        )
        .is_err());
    }

    #[test]
    fn builtin_protected() {
        let db = test_db();
        ensure_seed(&db).unwrap();
        let ts = get_by_name(&db, "$timestamp").unwrap().unwrap();

        // 内置：value 不可改，description/enabled 可改
        let updated = save(
            &db,
            &SaveDynamicVariablePayload {
                id: ts.id.clone(),
                name: "$timestamp".into(),
                var_type: "static".into(),
                value: "hacked".into(),
                description: "说明改了".into(),
                enabled: false,
            },
        )
        .unwrap();
        assert_eq!(updated.value, "timestamp");
        assert_eq!(updated.var_type, "expression");
        assert_eq!(updated.description, "说明改了");
        assert!(!updated.enabled);

        // 内置不可删
        assert!(delete(&db, &ts.id).is_err());
    }

    #[test]
    fn delete_custom_ok() {
        let db = test_db();
        let created = save(
            &db,
            &SaveDynamicVariablePayload {
                id: String::new(),
                name: "$temp".into(),
                var_type: "script".into(),
                value: "42".into(),
                description: String::new(),
                enabled: true,
            },
        )
        .unwrap();
        delete(&db, &created.id).unwrap();
        assert!(get_by_name(&db, "$temp").unwrap().is_none());
        // 重复删除报 NotFound
        assert!(delete(&db, &created.id).is_err());
    }

    #[test]
    fn name_conflict_rejected() {
        let db = test_db();
        save(
            &db,
            &SaveDynamicVariablePayload {
                id: String::new(),
                name: "$dup".into(),
                var_type: "static".into(),
                value: "1".into(),
                description: String::new(),
                enabled: true,
            },
        )
        .unwrap();
        let err = save(
            &db,
            &SaveDynamicVariablePayload {
                id: String::new(),
                name: "$dup".into(),
                var_type: "static".into(),
                value: "2".into(),
                description: String::new(),
                enabled: true,
            },
        )
        .unwrap_err();
        assert!(matches!(err, AppError::Internal(_)));
    }
}
