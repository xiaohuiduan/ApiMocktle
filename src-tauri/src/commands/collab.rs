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
pub fn get_collab_state(db: State<Arc<Db>>, session_id: String, project_id: String, doc_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match shared_files_repo::get_collab_state(&db, &project_id, &doc_id) {
        Ok(y_state_base64) => ApiResult::success(serde_json::json!({
            "yStateBase64": y_state_base64,
        })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn apply_collab_update(
    db: State<Arc<Db>>,
    session_id: String,
    project_id: String,
    doc_id: String,
    payload: CollabUpdatePayload,
) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match shared_files_repo::apply_collab_update(&db, &project_id, &doc_id, &payload.update_base64) {
        Ok(y_state_base64) => ApiResult::success(serde_json::json!({
            "yStateBase64": y_state_base64,
        })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn update_presence(
    db: State<Arc<Db>>,
    session_id: String,
    project_id: String,
    doc_id: String,
    payload: PresencePayload,
) -> ApiResult<serde_json::Value> {
    let user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match shared_files_repo::update_presence(&db, &project_id, &doc_id, &user.id, payload.is_typing) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn get_doc_presence(db: State<Arc<Db>>, session_id: String, project_id: String, doc_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match shared_files_repo::get_doc_presence(&db, &project_id, &doc_id) {
        Ok(users) => ApiResult::success(serde_json::json!({ "users": users })),
        Err(e) => e.into(),
    }
}
