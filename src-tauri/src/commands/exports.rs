use tauri::State;
use crate::db::client::Db;
use std::sync::Arc;
use crate::db::project_repo;
use crate::models::*;

#[tauri::command]
pub fn write_export_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_openapi(
    db: State<Arc<Db>>,
    session_id: String,
    project_id: String,
    format: Option<String>,
    _menu_ids: Option<String>,
) -> ApiResult<serde_json::Value> {
    let user = crate::db::auth_repo::get_valid_session_user(&db, &session_id)
        .ok_or_else(|| crate::errors::AppError::Unauthorized("未登录".into()));

    let user = match user {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    if project_repo::get_project_member_role(&db, &project_id, &user.id).is_none() {
        return crate::errors::AppError::Forbidden("无权限".into()).into();
    }

    match project_repo::get_project_state(&db, &project_id) {
        Ok(state) => {
            let fmt = format.as_deref().unwrap_or("json");
            let spec = serde_json::json!({
                "openapi": "3.0.0",
                "info": {
                    "title": "ApiMocktle Export",
                    "version": "1.0.0"
                },
                "paths": {},
                "menuItems": state.menu_raw_list,
            });
            let content = if fmt == "yaml" {
                serde_yaml::to_string(&spec).unwrap_or_default()
            } else {
                serde_json::to_string_pretty(&spec).unwrap_or_default()
            };
            ApiResult::success(serde_json::json!({
                "content": content,
                "format": fmt,
            }))
        }
        Err(e) => e.into(),
    }
}
