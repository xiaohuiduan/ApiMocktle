use tauri::State;
use crate::db::client::Db;
use std::sync::Arc;
use crate::db::{auth_repo, project_repo, share_links_repo};
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
pub fn list_share_links(db: State<Arc<Db>>, session_id: String, project_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match share_links_repo::list_share_links(&db, &project_id) {
        Ok(links) => ApiResult::success(serde_json::json!({ "shareLinks": links })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn create_share_link(db: State<Arc<Db>>, session_id: String, project_id: String, payload: CreateShareLinkPayload) -> ApiResult<serde_json::Value> {
    let user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    let api_menu_ids = serde_json::to_string(&payload.api_menu_ids).unwrap_or_default();
    let title = payload.title.as_deref().unwrap_or("");

    match share_links_repo::create_share_link(
        &db, &project_id, &user.id, &api_menu_ids,
        payload.password.as_deref(),
        title,
        payload.expires_at.as_deref(),
    ) {
        Ok(link) => ApiResult::success(serde_json::json!({ "shareLink": link })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn update_share_link(db: State<Arc<Db>>, session_id: String, project_id: String, share_id: String, payload: serde_json::Value) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    let password_hash = payload.get("password").and_then(|v| v.as_str());
    let title = payload.get("title").and_then(|v| v.as_str());
    let expires_at = payload.get("expiresAt").and_then(|v| v.as_str());

    match share_links_repo::update_share_link(&db, &project_id, &share_id, password_hash, title, expires_at) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn delete_share_link(db: State<Arc<Db>>, session_id: String, project_id: String, share_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match share_links_repo::delete_share_link(&db, &project_id, &share_id) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}
