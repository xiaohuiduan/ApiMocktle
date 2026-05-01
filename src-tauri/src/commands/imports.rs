use tauri::State;
use crate::db::client::Db;
use std::sync::Arc;
use crate::db::auth_repo;
use crate::db::project_repo;
use crate::models::*;
use crate::services::import_service;

fn check_editor(db: &Db, session_id: &str, project_id: &str) -> Result<SessionUser, crate::errors::AppError> {
    let user = auth_repo::get_valid_session_user(db, session_id)
        .ok_or_else(|| crate::errors::AppError::Unauthorized("未登录".into()))?;

    let role = project_repo::get_project_member_role(db, project_id, &user.id);
    match role.as_deref() {
        Some("owner") | Some("editor") => Ok(user),
        _ => Err(crate::errors::AppError::Forbidden("无权限".into())),
    }
}

#[tauri::command]
pub fn import_api_document(
    db: State<Arc<Db>>,
    session_id: String,
    project_id: String,
    payload: ImportPayload,
) -> ApiResult<serde_json::Value> {
    let _user = match check_editor(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match import_service::import_api_document(&db, &project_id, &payload.format, &payload.content) {
        Ok(state) => ApiResult::success(serde_json::json!({
            "imported": { "format": payload.format },
            "state": state,
        })),
        Err(e) => e.into(),
    }
}
