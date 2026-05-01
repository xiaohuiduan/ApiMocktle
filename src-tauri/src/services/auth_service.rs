use crate::db::auth_repo;
use crate::db::client::Db;
use crate::models::{AuthResult, LoginPayload, RegisterPayload, SessionUser};
use crate::services::crypto;

pub fn register(
    db: &Db,
    payload: &RegisterPayload,
) -> Result<AuthResult, crate::errors::AppError> {
    let existing = auth_repo::get_user_by_username(db, &payload.username);
    if existing.is_some() {
        return Err(crate::errors::AppError::Conflict("用户名已存在".into()));
    }

    let password_hash = crypto::hash_password(&payload.password)
        .map_err(|e| crate::errors::AppError::Internal(e))?;

    let user = auth_repo::create_user(db, &payload.username, &password_hash)?;

    let expires_at = chrono::Utc::now().timestamp_millis() + 7 * 24 * 60 * 60 * 1000;
    let session_id = auth_repo::create_session(db, &user.id, expires_at)?;

    Ok(AuthResult {
        user: SessionUser {
            id: user.id,
            username: user.username,
        },
        session_id,
    })
}

pub fn login(
    db: &Db,
    payload: &LoginPayload,
) -> Result<AuthResult, crate::errors::AppError> {
    let user =
        auth_repo::get_user_by_username(db, &payload.username)
            .ok_or_else(|| crate::errors::AppError::Unauthorized("用户名或密码错误".into()))?;

    if !crypto::verify_password(&payload.password, &user.password_hash) {
        return Err(crate::errors::AppError::Unauthorized("用户名或密码错误".into()));
    }

    let expires_at = chrono::Utc::now().timestamp_millis() + 7 * 24 * 60 * 60 * 1000;
    let session_id = auth_repo::create_session(db, &user.id, expires_at)?;

    Ok(AuthResult {
        user: SessionUser {
            id: user.id,
            username: user.username,
        },
        session_id,
    })
}

pub fn logout(db: &Db, session_id: &str) {
    auth_repo::delete_session(db, session_id);
}

pub fn get_current_user(db: &Db, session_id: &str) -> Option<SessionUser> {
    auth_repo::get_valid_session_user(db, session_id)
}
