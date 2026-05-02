use tauri::State;
use crate::db::client::Db;
use std::sync::Arc;
use crate::db::{auth_repo, project_repo, shared_files_repo};
use crate::models::*;

fn check_member(db: &Db, session_id: &str, project_id: &str) -> Result<SessionUser, crate::errors::AppError> {
    let user = auth_repo::get_valid_session_user(db, session_id)
        .ok_or_else(|| crate::errors::AppError::Unauthorized("未登录".into()))?;

    if project_repo::get_project_member_role(db, project_id, &user.id).is_none() {
        return Err(crate::errors::AppError::Forbidden("无权限".into()));
    }

    Ok(user)
}

#[tauri::command]
pub fn list_shared_files(db: State<Arc<Db>>, session_id: String, project_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match shared_files_repo::list_shared_files(&db, &project_id) {
        Ok(files) => ApiResult::success(serde_json::json!({ "files": files })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn upload_shared_file(
    db: State<Arc<Db>>,
    _app_handle: tauri::AppHandle,
    session_id: String,
    project_id: String,
) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    // For file upload, we'd use tauri-plugin-dialog to pick a file
    // For now, return an info message
    ApiResult::success(serde_json::json!({
        "message": "File upload via Tauri dialog API is available in the full version"
    }))
}

#[tauri::command]
pub fn delete_shared_file(db: State<Arc<Db>>, session_id: String, project_id: String, file_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    // Remove the file from disk storage if needed
    if let Some(storage_path) = shared_files_repo::get_file_storage_path(&db, &project_id, &file_id) {
        std::fs::remove_file(&storage_path).ok();
    }

    match shared_files_repo::delete_shared_file(&db, &project_id, &file_id) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn download_shared_file(db: State<Arc<Db>>, session_id: String, project_id: String, file_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match shared_files_repo::get_shared_file(&db, &project_id, &file_id) {
        Ok(Some(file)) => ApiResult::success(serde_json::json!({ "file": file })),
        Ok(None) => crate::errors::AppError::NotFound("文件不存在".into()).into(),
        Err(e) => e.into(),
    }
}
