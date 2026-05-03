use tauri::State;
use crate::db::client::Db;
use std::sync::Arc;
use crate::models::{LoginPayload, RegisterPayload, AuthResult, SessionUser, ApiResult, ChangePasswordPayload};
use crate::services::auth_service;

#[tauri::command]
pub fn login(db: State<Arc<Db>>, payload: LoginPayload) -> ApiResult<AuthResult> {
    match auth_service::login(&db, &payload) {
        Ok(result) => ApiResult::success(result),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn register(db: State<Arc<Db>>, payload: RegisterPayload) -> ApiResult<AuthResult> {
    match auth_service::register(&db, &payload) {
        Ok(result) => ApiResult::success(result),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn logout(db: State<Arc<Db>>, session_id: String) -> ApiResult<()> {
    auth_service::logout(&db, &session_id);
    ApiResult {
        ok: true,
        data: Some(()),
        error: None,
    }
}

#[tauri::command]
pub fn get_current_user(db: State<Arc<Db>>, session_id: String) -> ApiResult<Option<SessionUser>> {
    let user = auth_service::get_current_user(&db, &session_id);
    ApiResult::success(user)
}

#[tauri::command]
pub fn change_password(
    db: State<Arc<Db>>,
    session_id: String,
    payload: ChangePasswordPayload,
) -> ApiResult<()> {
    match auth_service::change_password(&db, &session_id, &payload) {
        Ok(()) => ApiResult::success(()),
        Err(e) => e.into(),
    }
}
