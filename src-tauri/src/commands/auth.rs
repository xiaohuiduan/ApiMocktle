use tauri::State;
use crate::db::client::Db;
use std::sync::Arc;
use crate::db::{auth_repo, personal_token_repo};
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

#[tauri::command]
pub fn list_all_users(db: State<Arc<Db>>, session_id: String) -> ApiResult<Vec<serde_json::Value>> {
    let _user = match auth_repo::get_valid_session_user(&db, &session_id) {
        Some(u) => u,
        None => return crate::errors::AppError::Unauthorized("未登录".into()).into(),
    };
    match auth_repo::list_all_users(&db) {
        Ok(users) => {
            let result: Vec<serde_json::Value> = users.into_iter().map(|(id, username)| {
                serde_json::json!({ "id": id, "username": username })
            }).collect();
            ApiResult::success(result)
        }
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn list_personal_tokens(db: State<Arc<Db>>, session_id: String) -> ApiResult<Vec<serde_json::Value>> {
    let user = match auth_repo::get_valid_session_user(&db, &session_id) {
        Some(u) => u,
        None => return crate::errors::AppError::Unauthorized("未登录".into()).into(),
    };
    match personal_token_repo::list_personal_tokens(&db, &user.id) {
        Ok(tokens) => {
            let result: Vec<serde_json::Value> = tokens.into_iter().map(|t| {
                serde_json::json!({ "id": t.id, "token": t.token, "name": t.name, "createdAt": t.created_at })
            }).collect();
            ApiResult::success(result)
        }
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn create_personal_token(db: State<Arc<Db>>, session_id: String, name: String) -> ApiResult<serde_json::Value> {
    let user = match auth_repo::get_valid_session_user(&db, &session_id) {
        Some(u) => u,
        None => return crate::errors::AppError::Unauthorized("未登录".into()).into(),
    };
    match personal_token_repo::create_personal_token(&db, &user.id, &name) {
        Ok(t) => ApiResult::success(serde_json::json!({ "id": t.id, "token": t.token, "name": t.name, "createdAt": t.created_at })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn delete_personal_token(db: State<Arc<Db>>, session_id: String, token_id: String) -> ApiResult<()> {
    let user = match auth_repo::get_valid_session_user(&db, &session_id) {
        Some(u) => u,
        None => return crate::errors::AppError::Unauthorized("未登录".into()).into(),
    };
    match personal_token_repo::delete_personal_token(&db, &user.id, &token_id) {
        Ok(()) => ApiResult::success(()),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn get_yapi_port(handle: tauri::State<'_, Arc<crate::http::yapi_server::YApiServerHandle>>) -> u16 {
    // 等待服务启动（最多 3 秒）
    for _ in 0..30 {
        let p = *handle.port.lock().unwrap();
        if p > 0 { return p; }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    *handle.port.lock().unwrap()
}
