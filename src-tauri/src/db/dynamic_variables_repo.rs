use rusqlite::{params, Connection, OptionalExtension};

use crate::errors::AppError;
use crate::models::{DynamicVariableDef, SaveDynamicVariablePayload};

/// 内置动态变量 seed（script 类型，值为 Rhai 脚本，调用引擎注册函数）。
/// 带参内置（$randomInt/$randomString）用预置 args 数组做条件消费：有参用参数，无参用默认。
/// 求值代码内无硬编码变量清单；$processEnv 前缀为特判，不入库。
const BUILTIN_SEED: &[(&str, &str, &str)] = &[
    ("$timestamp", "timestamp()", "秒级时间戳"),
    ("$timestampISO", "timestamp_iso()", "ISO 8601 时间"),
    ("$guid", "guid()", "UUID（带横线）"),
    ("$randomUUID", "random_uuid()", "UUID（32 位无横线）"),
    (
        "$randomInt",
        "if args.len() >= 2 { random_int(args[0], args[1]) } else { random_int(0, 1000) }",
        "0-1000 随机整数（可带参 min,max，如 {{$randomInt(1,100)}}）",
    ),
    ("$randomEmail", "random_email()", "随机邮箱"),
    ("$randomIP", "random_ip()", "随机 IPv4 地址"),
    ("$randomMobile", "random_mobile()", "11 位随机手机号"),
    (
        "$randomString",
        "if args.len() >= 1 { random_string(args[0]) } else { random_string(8) }",
        "8 位随机字母字符串（可带参长度，如 {{$randomString(16)}}）",
    ),
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
    for (name, script, desc) in BUILTIN_SEED {
        conn.execute(
            "INSERT OR IGNORE INTO dynamic_variables
             (id, name, var_type, value, description, is_builtin, enabled, created_at, updated_at)
             VALUES (?1, ?2, 'script', ?3, ?4, 1, 1, ?5, ?5)",
            params![uuid::Uuid::new_v4().to_string(), name, script, desc, chrono::Utc::now().to_rfc3339()],
        )?;
        // 内置行脚本同步为最新 seed（存量库迁移后 value 可能是旧形式；内置 value 不可被用户修改，同步安全）
        conn.execute(
            "UPDATE dynamic_variables SET var_type = 'script', value = ?1, description = ?2, updated_at = updated_at
             WHERE name = ?3 AND is_builtin = 1",
            params![script, desc, name],
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
    if payload.var_type != "script" {
        return Err(AppError::BadRequest("动态变量仅支持 script 类型".into()));
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

/// 存量 static/expression 统一转 script（幂等；在 ensure_seed 前调用）：
/// - expression：value 为函数名 → 补括号（random_int → random_int()）；模板带参 {{$randomInt(1,100)}} 走参数注入，兼容
/// - static：值转义为 Rhai 字符串字面量（引用其他变量的能力已废弃，行为按设计变化）
pub fn migrate_legacy_types(conn: &Connection) -> Result<(), AppError> {
    conn.execute(
        "UPDATE dynamic_variables SET var_type = 'script', value = value || '()' WHERE var_type = 'expression'",
        [],
    )?;
    let static_rows: Vec<(String, String)> = conn
        .prepare("SELECT id, value FROM dynamic_variables WHERE var_type = 'static'")?
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    for (id, value) in static_rows {
        let escaped = format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""));
        conn.execute(
            "UPDATE dynamic_variables SET var_type = 'script', value = ?1 WHERE id = ?2",
            params![escaped, id],
        )?;
    }
    Ok(())
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
        for (name, script, _) in BUILTIN_SEED {
            let def = get_by_name(&db, name).unwrap().expect("seed 存在");
            assert_eq!(def.var_type, "script");
            assert_eq!(def.value, *script);
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
                var_type: "script".into(),
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
                var_type: "script".into(),
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
                var_type: "script".into(),
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
                var_type: "static".into(),
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
                var_type: "script".into(),
                value: "hacked".into(),
                description: "说明改了".into(),
                enabled: false,
            },
        )
        .unwrap();
        assert_eq!(updated.value, "timestamp()");
        assert_eq!(updated.var_type, "script");
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
    fn migrate_legacy_types_converts() {
        let db = test_db();
        {
            let conn = db.0.lock().unwrap();
            let now = chrono::Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO dynamic_variables (id, name, var_type, value, description, is_builtin, enabled, created_at, updated_at)
                 VALUES ('e1', '$legacyExpr', 'expression', 'random_int', '', 0, 1, ?1, ?1)",
                params![now],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO dynamic_variables (id, name, var_type, value, description, is_builtin, enabled, created_at, updated_at)
                 VALUES ('s1', '$legacyStatic', 'static', 'hello {{$timestamp}}', '', 0, 1, ?1, ?1)",
                params![now],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO dynamic_variables (id, name, var_type, value, description, is_builtin, enabled, created_at, updated_at)
                 VALUES ('s2', '$legacyQuote', 'static', 'say \"hi\" / ok', '', 0, 1, ?1, ?1)",
                params![now],
            )
            .unwrap();
        }
        {
            let conn = db.0.lock().unwrap();
            migrate_legacy_types(&conn).unwrap();
        }
        let expr = get_by_name(&db, "$legacyExpr").unwrap().unwrap();
        assert_eq!(expr.var_type, "script");
        assert_eq!(expr.value, "random_int()");

        let stat = get_by_name(&db, "$legacyStatic").unwrap().unwrap();
        assert_eq!(stat.var_type, "script");
        assert_eq!(stat.value, "\"hello {{$timestamp}}\"");

        // 含引号/反斜杠的 static 值转义正确（Rhai 字符串字面量）
        let quote = get_by_name(&db, "$legacyQuote").unwrap().unwrap();
        assert_eq!(quote.value, "\"say \\\"hi\\\" / ok\"");

        // 幂等：二次迁移无变化
        {
            let conn = db.0.lock().unwrap();
            migrate_legacy_types(&conn).unwrap();
        }
        assert_eq!(get_by_name(&db, "$legacyExpr").unwrap().unwrap().value, "random_int()");
    }

    #[test]
    fn name_conflict_rejected() {
        let db = test_db();
        save(
            &db,
            &SaveDynamicVariablePayload {
                id: String::new(),
                name: "$dup".into(),
                var_type: "script".into(),
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
                var_type: "script".into(),
                value: "2".into(),
                description: String::new(),
                enabled: true,
            },
        )
        .unwrap_err();
        assert!(matches!(err, AppError::Internal(_)));
    }
}
