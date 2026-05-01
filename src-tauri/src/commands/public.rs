use tauri::State;
use crate::db::client::Db;
use std::sync::Arc;
use crate::db::{share_links_repo, project_repo};
use crate::models::*;

#[tauri::command]
pub fn get_public_share(db: State<Arc<Db>>, share_id: String) -> ApiResult<serde_json::Value> {
    let link = match share_links_repo::get_share_link_by_id(&db, &share_id) {
        Some(l) => l,
        None => return crate::errors::AppError::NotFound("分享链接不存在".into()).into(),
    };

    let menu_ids: Vec<String> = serde_json::from_str(&link.api_menu_ids).unwrap_or_default();

    let state = project_repo::get_project_state(&db, &link.project_id).unwrap_or(ProjectStateSnapshot {
        menu_raw_list: vec![],
        recyle_raw_data: vec![],
        project_environments: vec![],
        project_environment_config: ProjectEnvironmentConfig {
            global_parameters: serde_json::json!({}),
            legacy_global_parameters: vec![],
            global_variables: vec![],
            vault_secrets: vec![],
            environments: vec![],
        },
    });

    let filtered_menu: Vec<ApiMenuData> = state.menu_raw_list
        .into_iter()
        .filter(|item| menu_ids.contains(&item.id))
        .collect();

    let project_name: Option<String> = project_repo::get_project(&db, &link.project_id, &link.creator_user_id)
        .ok()
        .flatten()
        .map(|p| p.name);

    ApiResult::success(serde_json::json!({
        "share": {
            "id": link.id,
            "title": link.title,
            "apiMenuIds": menu_ids,
            "hasPassword": link.password_hash.is_some(),
            "accessKey": link.access_key,
            "expiresAt": link.expires_at,
            "menuItems": filtered_menu,
            "projectName": project_name,
        }
    }))
}

#[tauri::command]
pub fn access_share_link(db: State<Arc<Db>>, share_id: String, access_key: String) -> ApiResult<serde_json::Value> {
    let link = match share_links_repo::get_share_link_by_access_key(&db, &access_key) {
        Some(l) => l,
        None => {
            // Try by id as fallback
            match share_links_repo::get_share_link_by_id(&db, &share_id) {
                Some(l) => l,
                None => return crate::errors::AppError::NotFound("分享链接不存在".into()).into(),
            }
        }
    };

    ApiResult::success(serde_json::json!({
        "shareId": link.id,
        "accessKey": link.access_key,
    }))
}

#[tauri::command]
pub fn get_public_share_api_data(db: State<Arc<Db>>, share_id: String) -> ApiResult<serde_json::Value> {
    get_public_share(db, share_id)
}
