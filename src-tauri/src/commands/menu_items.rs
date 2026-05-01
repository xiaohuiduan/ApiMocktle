use tauri::State;
use crate::db::client::Db;
use std::sync::Arc;
use crate::db::{auth_repo, project_repo, menu_repo};
use crate::models::*;

fn check_project_access(db: &Db, session_id: &str, project_id: &str) -> Result<SessionUser, crate::errors::AppError> {
    let user = auth_repo::get_valid_session_user(db, session_id)
        .ok_or_else(|| crate::errors::AppError::Unauthorized("未登录".into()))?;

    let role = project_repo::get_project_member_role(db, project_id, &user.id);
    match role.as_deref() {
        Some("owner") | Some("editor") => Ok(user),
        _ => Err(crate::errors::AppError::Forbidden("无权限".into())),
    }
}

#[tauri::command]
pub fn list_menu_items(db: State<Arc<Db>>, session_id: String, project_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_project_access(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match project_repo::get_project_state(&db, &project_id) {
        Ok(state) => ApiResult::success(serde_json::json!({
            "menuItems": state.menu_raw_list,
        })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn create_menu_item(db: State<Arc<Db>>, session_id: String, project_id: String, payload: CreateMenuItemPayload) -> ApiResult<serde_json::Value> {
    let _user = match check_project_access(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match menu_repo::create_menu_item(&db, &project_id, &payload) {
        Ok(item) => ApiResult::success(serde_json::json!({ "menuItem": item })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn update_menu_item(db: State<Arc<Db>>, session_id: String, project_id: String, menu_id: String, payload: serde_json::Value) -> ApiResult<serde_json::Value> {
    let _user = match check_project_access(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match menu_repo::update_menu_item(&db, &project_id, &menu_id, &payload) {
        Ok(item) => ApiResult::success(serde_json::json!({ "menuItem": item })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn delete_menu_item(db: State<Arc<Db>>, session_id: String, project_id: String, menu_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_project_access(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match menu_repo::delete_menu_item(&db, &project_id, &menu_id) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn move_menu_items(db: State<Arc<Db>>, session_id: String, project_id: String, payload: MoveMenuItemPayload) -> ApiResult<serde_json::Value> {
    let _user = match check_project_access(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match menu_repo::move_menu_items(&db, &project_id, &payload.drag_key, &payload.drop_key, payload.drop_position) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn batch_delete_menu_items(db: State<Arc<Db>>, session_id: String, project_id: String, payload: BatchDeletePayload) -> ApiResult<serde_json::Value> {
    let _user = match check_project_access(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match menu_repo::batch_delete_menu_items(&db, &project_id, &payload.menu_ids) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}
