use tauri::State;
use crate::db::client::Db;
use std::sync::Arc;
use crate::db::{auth_repo, project_repo, menu_repo};
use crate::models::*;

fn check_access(db: &Db, session_id: &str, project_id: &str) -> Result<(), crate::errors::AppError> {
    let user = auth_repo::get_valid_session_user(db, session_id)
        .ok_or_else(|| crate::errors::AppError::Unauthorized("未登录".into()))?;

    let role = project_repo::get_project_member_role(db, project_id, &user.id);
    match role.as_deref() {
        Some("owner") | Some("editor") => Ok(()),
        _ => Err(crate::errors::AppError::Forbidden("无权限".into())),
    }
}

#[tauri::command]
pub fn list_recycle_items(db: State<Arc<Db>>, session_id: String, project_id: String) -> ApiResult<serde_json::Value> {
    if let Err(e) = check_access(&db, &session_id, &project_id) {
        return e.into();
    }

    match menu_repo::list_recycle_items(&db, &project_id) {
        Ok(items) => ApiResult::success(serde_json::json!({ "recycleItems": items })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn restore_recycle_item(db: State<Arc<Db>>, session_id: String, project_id: String, recycle_id: String) -> ApiResult<serde_json::Value> {
    if let Err(e) = check_access(&db, &session_id, &project_id) {
        return e.into();
    }

    match menu_repo::restore_recycle_item(&db, &project_id, &recycle_id) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn delete_recycle_items(db: State<Arc<Db>>, session_id: String, project_id: String, payload: RecycleIdsPayload) -> ApiResult<serde_json::Value> {
    if let Err(e) = check_access(&db, &session_id, &project_id) {
        return e.into();
    }

    match menu_repo::delete_recycle_items(&db, &project_id, &payload.recycle_ids) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}
