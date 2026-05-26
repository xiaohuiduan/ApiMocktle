use std::sync::Arc;

use crate::db::auth_repo;
use crate::db::client::Db;
use crate::db::history_repo;
use crate::db::project_repo;
use crate::models::{ApiResult, RequestHistoryItem};

#[tauri::command]
pub async fn save_request_history(
    db: tauri::State<'_, Arc<Db>>,
    session_id: String,
    project_id: String,
    menu_item_id: String,
    request_json: serde_json::Value,
    response_json: serde_json::Value,
    status_code: i32,
    duration_ms: i64,
) -> Result<ApiResult<()>, String> {
    let user = match auth_repo::get_valid_session_user(&db, &session_id) {
        Some(u) => u,
        None => return Ok(crate::errors::AppError::Unauthorized("未登录".into()).into()),
    };

    if project_repo::get_project_member_role(&db, &project_id, &user.id).is_none() {
        return Ok(crate::errors::AppError::Forbidden("无权限".into()).into());
    }

    match history_repo::save_history(&db, &project_id, &menu_item_id, &request_json, &response_json, status_code, duration_ms) {
        Ok(()) => Ok(ApiResult::success(())),
        Err(e) => Ok(e.into()),
    }
}

#[tauri::command]
pub async fn list_request_history(
    db: tauri::State<'_, Arc<Db>>,
    session_id: String,
    project_id: String,
    menu_item_id: String,
) -> Result<ApiResult<Vec<RequestHistoryItem>>, String> {
    let user = match auth_repo::get_valid_session_user(&db, &session_id) {
        Some(u) => u,
        None => return Ok(crate::errors::AppError::Unauthorized("未登录".into()).into()),
    };

    if project_repo::get_project_member_role(&db, &project_id, &user.id).is_none() {
        return Ok(crate::errors::AppError::Forbidden("无权限".into()).into());
    }

    match history_repo::list_history(&db, &project_id, &menu_item_id) {
        Ok(items) => Ok(ApiResult::success(items)),
        Err(e) => Ok(e.into()),
    }
}

#[tauri::command]
pub async fn delete_request_history(
    db: tauri::State<'_, Arc<Db>>,
    session_id: String,
    id: String,
) -> Result<ApiResult<()>, String> {
    let _user = match auth_repo::get_valid_session_user(&db, &session_id) {
        Some(u) => u,
        None => return Ok(crate::errors::AppError::Unauthorized("未登录".into()).into()),
    };

    match history_repo::delete_history(&db, &id) {
        Ok(()) => Ok(ApiResult::success(())),
        Err(e) => Ok(e.into()),
    }
}
