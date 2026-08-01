use rusqlite::params;

use crate::db::client::Db;

/// 从 URL 中解析 host（含端口），用于 cookie 域名匹配
fn parse_host(url: &str) -> String {
    url.split("://").nth(1)
        .unwrap_or(url)
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .to_lowercase()
}

/// 解析单条 Set-Cookie 头，返回 (domain, name, value, path, expires_at)。
/// expires_at 为 Unix 秒；None 表示会话 cookie（不设过期）。
/// 无法解析（无 name=value）返回 None。
fn parse_set_cookie(raw: &str, request_host: &str) -> Option<(String, String, String, String, Option<i64>)> {
    let mut parts = raw.split(';');
    let first = parts.next()?.trim();
    let (name, value) = first.split_once('=')?;

    let mut domain: Option<String> = None;
    let mut path = "/".to_string();
    let mut expires_at: Option<i64> = None;

    for attr in parts {
        let attr = attr.trim();
        let (k, v) = match attr.split_once('=') {
            Some((k, v)) => (k.trim().to_lowercase(), v.trim()),
            None => (attr.to_lowercase(), ""),
        };
        match k.as_str() {
            "domain" => {
                let d = v.trim_start_matches('.').to_lowercase();
                if !d.is_empty() {
                    domain = Some(d);
                }
            }
            "path" => {
                if !v.is_empty() {
                    path = v.to_string();
                }
            }
            "max-age" => {
                if let Ok(secs) = v.parse::<i64>() {
                    let now = chrono::Utc::now().timestamp();
                    expires_at = Some(now + secs);
                }
            }
            "expires" => {
                // 解析 HTTP 日期（常见格式），失败则忽略
                if let Ok(dt) = chrono::DateTime::parse_from_rfc2822(v) {
                    expires_at = Some(dt.timestamp());
                }
            }
            _ => {}
        }
    }

    // 无 Domain 属性时使用请求 host
    let domain = domain.unwrap_or_else(|| request_host.to_string());
    if domain.is_empty() || name.trim().is_empty() {
        return None;
    }

    Some((domain, name.trim().to_string(), value.to_string(), path, expires_at))
}

/// 保存响应 Set-Cookie 到当前用户的 cookie jar（按域名隔离）。
/// 已过期的 cookie 会被删除（等价于浏览器过期清除）。
pub fn save_response_cookies(
    db: &Db,
    user_id: &str,
    request_url: &str,
    set_cookie_headers: &[String],
) -> Result<(), crate::errors::AppError> {
    if set_cookie_headers.is_empty() {
        return Ok(());
    }

    let host = parse_host(request_url);
    let conn = db.0.lock().unwrap();
    let now = chrono::Utc::now().timestamp();

    for raw in set_cookie_headers {
        let Some((domain, name, value, path, expires_at)) = parse_set_cookie(raw, &host) else {
            continue;
        };

        if let Some(exp) = expires_at {
            if exp <= now {
                // 过期即删除
                let _ = conn.execute(
                    "DELETE FROM cookie_jar WHERE user_id = ?1 AND domain = ?2 AND name = ?3 AND path = ?4",
                    params![user_id, domain, name, path],
                );
                continue;
            }
        }

        // 同 (domain, name, path) 覆盖更新
        conn.execute(
            "INSERT INTO cookie_jar (id, user_id, domain, name, value, path, expires_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT (user_id, domain, name, path) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at",
            params![
                uuid::Uuid::new_v4().to_string(),
                user_id,
                domain,
                name,
                value,
                path,
                expires_at,
                chrono::Utc::now().to_rfc3339(),
            ],
        )?;
    }

    Ok(())
}

/// 取出匹配请求 URL 域名的有效 cookie 列表（name, value）。
/// 匹配规则：请求 host 等于 cookie domain，或是其子域。
pub fn list_cookies_for_url(
    db: &Db,
    user_id: &str,
    url: &str,
) -> Result<Vec<(String, String)>, crate::errors::AppError> {
    let host = parse_host(url);
    if host.is_empty() {
        return Ok(vec![]);
    }

    let conn = db.0.lock().unwrap();
    let now = chrono::Utc::now().timestamp();

    let mut stmt = conn.prepare(
        "SELECT name, value FROM cookie_jar
         WHERE user_id = ?1 AND (expires_at IS NULL OR expires_at > ?2)
           AND (domain = ?3 OR ?4 LIKE '%.' || domain)
         ORDER BY path DESC",
    )?;

    let rows = stmt.query_map(params![user_id, now, host, host], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

/// 统计当前用户的 cookie 总数（供设置页展示）
pub fn count_cookie_jar(db: &Db, user_id: &str) -> Result<i64, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM cookie_jar WHERE user_id = ?1",
        params![user_id],
        |row| row.get(0),
    )?;
    Ok(count)
}

/// 清空当前用户的全部 cookie
pub fn clear_cookie_jar(db: &Db, user_id: &str) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM cookie_jar WHERE user_id = ?1", params![user_id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use rusqlite::Connection;

    fn setup_db() -> Db {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cookie_jar (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                domain TEXT NOT NULL,
                name TEXT NOT NULL,
                value TEXT NOT NULL,
                path TEXT NOT NULL DEFAULT '/',
                expires_at INTEGER,
                created_at TEXT NOT NULL,
                UNIQUE (user_id, domain, name, path)
            );",
        ).unwrap();
        Db(Mutex::new(conn))
    }

    #[test]
    fn test_parse_host() {
        assert_eq!(parse_host("https://api.example.com/v1/users"), "api.example.com");
        assert_eq!(parse_host("http://localhost:8080/test"), "localhost:8080");
        assert_eq!(parse_host("api.example.com?a=1"), "api.example.com");
    }

    #[test]
    fn test_parse_set_cookie_basic() {
        let parsed = parse_set_cookie("token=abc123; Path=/; HttpOnly", "api.example.com");
        assert_eq!(parsed, Some(("api.example.com".into(), "token".into(), "abc123".into(), "/".into(), None)));
    }

    #[test]
    fn test_parse_set_cookie_with_domain_and_max_age() {
        let parsed = parse_set_cookie("sid=xyz; Domain=.example.com; Path=/app; Max-Age=3600", "api.example.com");
        assert!(parsed.is_some());
        let (domain, name, value, path, expires) = parsed.unwrap();
        assert_eq!(domain, "example.com");
        assert_eq!(name, "sid");
        assert_eq!(value, "xyz");
        assert_eq!(path, "/app");
        assert!(expires.is_some());
        assert!(expires.unwrap() > chrono::Utc::now().timestamp());
    }

    #[test]
    fn test_save_and_list_cookie() {
        let db = setup_db();
        let headers = vec!["session=abc; Path=/".to_string()];
        save_response_cookies(&db, "user1", "https://api.example.com/v1", &headers).unwrap();

        let cookies = list_cookies_for_url(&db, "user1", "https://api.example.com/v2").unwrap();
        assert_eq!(cookies, vec![("session".to_string(), "abc".to_string())]);
    }

    #[test]
    fn test_domain_isolation() {
        let db = setup_db();
        // 显式 Domain=.a.com 的 cookie 可被子域访问
        save_response_cookies(&db, "user1", "https://api.a.com", &["a=1; Domain=.a.com".to_string()]).unwrap();
        // 无 Domain 属性 = host-only cookie，仅同主机有效
        save_response_cookies(&db, "user1", "https://api.a.com", &["h=1".to_string()]).unwrap();
        save_response_cookies(&db, "user1", "https://b.com", &["b=2".to_string()]).unwrap();

        // 子域可以访问父域 Domain cookie，但不能访问 host-only cookie
        let cookies = list_cookies_for_url(&db, "user1", "https://sub.a.com/x").unwrap();
        assert_eq!(cookies.len(), 1);
        assert_eq!(cookies[0], ("a".to_string(), "1".to_string()));

        // 同主机可访问 host-only cookie + 匹配的 Domain cookie
        let same_host = list_cookies_for_url(&db, "user1", "https://api.a.com/v2").unwrap();
        assert_eq!(same_host.len(), 2);

        // 不同域名隔离
        let other = list_cookies_for_url(&db, "user1", "https://b.com/x").unwrap();
        assert_eq!(other.len(), 1);
        assert_eq!(other[0], ("b".to_string(), "2".to_string()));

        // 不同用户隔离
        let other_user = list_cookies_for_url(&db, "user2", "https://api.a.com/x").unwrap();
        assert_eq!(other_user.len(), 0);
    }

    #[test]
    fn test_expired_cookie_removed() {
        let db = setup_db();
        save_response_cookies(&db, "user1", "https://a.com", &["s=1; Max-Age=-10".to_string()]).unwrap();
        let cookies = list_cookies_for_url(&db, "user1", "https://a.com").unwrap();
        assert_eq!(cookies.len(), 0);
    }

    #[test]
    fn test_upsert_same_cookie() {
        let db = setup_db();
        save_response_cookies(&db, "user1", "https://a.com", &["t=old; Path=/".to_string()]).unwrap();
        save_response_cookies(&db, "user1", "https://a.com", &["t=new; Path=/".to_string()]).unwrap();
        let cookies = list_cookies_for_url(&db, "user1", "https://a.com").unwrap();
        assert_eq!(cookies, vec![("t".to_string(), "new".to_string())]);
        assert_eq!(count_cookie_jar(&db, "user1").unwrap(), 1);
    }

    #[test]
    fn test_clear_cookie_jar() {
        let db = setup_db();
        save_response_cookies(&db, "user1", "https://a.com", &["a=1".to_string()]).unwrap();
        save_response_cookies(&db, "user1", "https://b.com", &["b=2".to_string()]).unwrap();
        assert_eq!(count_cookie_jar(&db, "user1").unwrap(), 2);

        clear_cookie_jar(&db, "user1").unwrap();
        assert_eq!(count_cookie_jar(&db, "user1").unwrap(), 0);
    }
}
