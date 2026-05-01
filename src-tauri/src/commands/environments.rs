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
pub fn get_project_environments(db: State<Arc<Db>>, session_id: String, project_id: String) -> ApiResult<serde_json::Value> {
    let _user = auth_repo::get_valid_session_user(&db, &session_id)
        .ok_or_else(|| crate::errors::AppError::Unauthorized("未登录".into()));

    match project_repo::get_project_state(&db, &project_id) {
        Ok(state) => ApiResult::success(serde_json::json!({
            "environments": state.project_environments,
            "environmentConfig": state.project_environment_config,
        })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn save_project_environments(db: State<Arc<Db>>, session_id: String, project_id: String, payload: SaveEnvironmentPayload) -> ApiResult<ProjectStateSnapshot> {
    if let Err(e) = check_access(&db, &session_id, &project_id) {
        return e.into();
    }

    match menu_repo::save_project_environments(&db, &project_id, &payload.config) {
        Ok(()) => match project_repo::get_project_state(&db, &project_id) {
            Ok(state) => ApiResult::success(state),
            Err(e) => e.into(),
        },
        Err(e) => e.into(),
    }
}
