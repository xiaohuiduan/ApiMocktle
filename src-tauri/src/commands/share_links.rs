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

    // 校验：项目存在
    let project = match project_repo::get_project_by_id(&db, &payload.project_id) {
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

    // 密码可选：空字符串 = 无密码（打开即看）。明文列供桌面端生成带密码链接，不向访客暴露。
    let (password_hash, password_plain) = if payload.password.is_empty() {
        (None, None)
    }
    else {
        match crate::services::crypto::hash_password(&payload.password) {
            Ok(h) => (Some(h), Some(payload.password.clone())),
            Err(e) => return crate::errors::AppError::Internal(e).into(),
        }
    };

    // 标题为空时使用项目名
    let title = if payload.title.as_deref().map_or(true, |t| t.trim().is_empty()) {
        project.1
    }
    else {
        payload.title.unwrap_or_default()
    };

    let link = match share_repo::create_share_link(
        &db,
        &payload.project_id,
        &user.id,
        payload.api_menu_ids,
        password_hash,
        password_plain,
        payload.expires_at,
        &title,
    ) {
        Ok(l) => l,
        Err(e) => return e.into(),
    };

    ApiResult::success(link)
}

#[derive(Debug, Deserialize)]
pub struct UpdateShareLinkPayload {
    #[serde(rename = "apiMenuIds", default)]
    pub api_menu_ids: Vec<String>,
    /// 设置新密码（非空时更新为 hash）
    pub password: Option<String>,
    /// 移除密码（与 password 同时给时以 password 为准）
    #[serde(rename = "removePassword", default)]
    pub remove_password: bool,
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<String>,
    pub title: String,
}

#[tauri::command]
pub fn update_share_link(
    db: State<'_, Arc<Db>>,
    session_id: String,
    id: String,
    payload: UpdateShareLinkPayload,
) -> ApiResult<ShareLink> {
    let _user = match auth_repo::get_valid_session_user(&db, &session_id) {
        Some(u) => u,
        None => return crate::errors::AppError::Unauthorized("未登录".into()).into(),
    };

    // 校验：链接存在且项目存在
    let link = match share_repo::get_share_link(&db, &id) {
        Ok(Some(l)) => l,
        Ok(None) => return crate::errors::AppError::NotFound("分享链接不存在".into()).into(),
        Err(e) => return crate::errors::AppError::Internal(e.to_string()).into(),
    };
    let project = match project_repo::get_project_by_id(&db, &link.project_id) {
        Ok(Some(p)) => p,
        Ok(None) => return crate::errors::AppError::NotFound("项目不存在".into()).into(),
        Err(e) => return crate::errors::AppError::Internal(e.to_string()).into(),
    };

    // 校验：勾选的菜单项均属于该项目
    if !payload.api_menu_ids.is_empty() {
        let items = match menu_repo::list_menu_items(&db, &link.project_id) {
            Ok(v) => v,
            Err(e) => return crate::errors::AppError::Internal(e.to_string()).into(),
        };
        let valid_ids: std::collections::HashSet<&str> =
            items.iter().map(|i| i.id.as_str()).collect();
        for mid in &payload.api_menu_ids {
            if !valid_ids.contains(mid.as_str()) {
                return crate::errors::AppError::BadRequest(format!("菜单项 {mid} 不属于该项目")).into();
            }
        }
    }

    // 密码三态：remove_password → 清除；password 非空 → 设置新密码；否则保持原密码
    let (password_hash, password_plain) = if payload.remove_password {
        (None, None)
    }
    else if let Some(p) = &payload.password {
        if p.is_empty() {
            (link.password_hash.clone(), link.password_plain.clone())
        }
        else {
            match crate::services::crypto::hash_password(p) {
                Ok(h) => (Some(h), Some(p.clone())),
                Err(e) => return crate::errors::AppError::Internal(e).into(),
            }
        }
    }
    else {
        (link.password_hash.clone(), link.password_plain.clone())
    };

    // 标题为空时使用项目名
    let title = if payload.title.trim().is_empty() {
        project.1
    }
    else {
        payload.title
    };

    match share_repo::update_share_link(
        &db,
        &id,
        payload.api_menu_ids,
        password_hash,
        password_plain,
        payload.expires_at,
        &title,
    ) {
        Ok(l) => ApiResult::success(l),
        Err(e) => e.into(),
    }
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
