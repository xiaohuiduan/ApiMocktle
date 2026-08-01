use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::db::client::Db;
use crate::db::{auth_repo, menu_repo, project_repo, share_repo};
use crate::models::*;

#[derive(Debug, Deserialize)]
pub struct CreateShareLinkPayload {
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "apiMenuIds", default)]
    pub api_menu_ids: Vec<String>,
    pub password: String,
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<String>,
    pub title: Option<String>,
}

#[tauri::command]
pub fn create_share_link(
    db: State<'_, Arc<Db>>,
    session_id: String,
    payload: CreateShareLinkPayload,
) -> ApiResult<ShareLink> {
    let user = match auth_repo::get_valid_session_user(&db, &session_id) {
        Some(u) => u,
        None => return crate::errors::AppError::Unauthorized("未登录".into()).into(),
    };

    // 校验：密码必填
    if payload.password.is_empty() {
        return crate::errors::AppError::BadRequest("分享密码不能为空".into()).into();
    }

    // 校验：项目存在
    let _project = match project_repo::get_project_by_id(&db, &payload.project_id) {
        Ok(Some(p)) => p,
        Ok(None) => return crate::errors::AppError::NotFound("项目不存在".into()).into(),
        Err(e) => return crate::errors::AppError::Internal(e.to_string()).into(),
    };

    // 校验：勾选的菜单项均属于该项目
    if !payload.api_menu_ids.is_empty() {
        let items = match menu_repo::list_menu_items(&db, &payload.project_id) {
            Ok(v) => v,
            Err(e) => return crate::errors::AppError::Internal(e.to_string()).into(),
        };
        let valid_ids: std::collections::HashSet<&str> =
            items.iter().map(|i| i.id.as_str()).collect();
        for id in &payload.api_menu_ids {
            if !valid_ids.contains(id.as_str()) {
                return crate::errors::AppError::BadRequest(format!("菜单项 {id} 不属于该项目")).into();
            }
        }
    }

    let password_hash = match crate::services::crypto::hash_password(&payload.password) {
        Ok(h) => Some(h),
        Err(e) => return crate::errors::AppError::Internal(e).into(),
    };

    let title = payload.title.unwrap_or_default();
    let link = match share_repo::create_share_link(
        &db,
        &payload.project_id,
        &user.id,
        payload.api_menu_ids,
        password_hash,
        payload.expires_at,
        &title,
    ) {
        Ok(l) => l,
        Err(e) => return e.into(),
    };

    ApiResult::success(link)
}

#[tauri::command]
pub fn list_share_links(db: State<'_, Arc<Db>>, session_id: String) -> ApiResult<Vec<ShareLink>> {
    let _user = match auth_repo::get_valid_session_user(&db, &session_id) {
        Some(u) => u,
        None => return crate::errors::AppError::Unauthorized("未登录".into()).into(),
    };

    match share_repo::list_share_links(&db) {
        Ok(links) => ApiResult::success(links),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn get_share_link(db: State<'_, Arc<Db>>, session_id: String, id: String) -> ApiResult<ShareLink> {
    let _user = match auth_repo::get_valid_session_user(&db, &session_id) {
        Some(u) => u,
        None => return crate::errors::AppError::Unauthorized("未登录".into()).into(),
    };

    match share_repo::get_share_link(&db, &id) {
        Ok(Some(link)) => ApiResult::success(link),
        Ok(None) => crate::errors::AppError::NotFound("分享链接不存在".into()).into(),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn delete_share_link(db: State<'_, Arc<Db>>, session_id: String, id: String) -> ApiResult<()> {
    let _user = match auth_repo::get_valid_session_user(&db, &session_id) {
        Some(u) => u,
        None => return crate::errors::AppError::Unauthorized("未登录".into()).into(),
    };

    match share_repo::delete_share_link(&db, &id) {
        Ok(()) => ApiResult::success(()),
        Err(e) => e.into(),
    }
}
