use tauri::State;
use crate::db::client::Db;
use std::sync::Arc;
use crate::db::{auth_repo, project_repo};
use crate::models::*;

fn check_session(db: &Db, session_id: &str) -> Result<crate::models::SessionUser, crate::errors::AppError> {
    auth_repo::get_valid_session_user(db, session_id)
        .ok_or_else(|| crate::errors::AppError::Unauthorized("未登录".into()))
}

#[tauri::command]
pub fn list_projects(db: State<Arc<Db>>, session_id: String) -> ApiResult<ProjectListResult> {
    let user = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match project_repo::list_projects(&db, &user.id) {
        Ok(projects) => ApiResult::success(ProjectListResult { projects }),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn create_project(db: State<Arc<Db>>, session_id: String, payload: CreateProjectPayload) -> ApiResult<serde_json::Value> {
    let user = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match project_repo::create_project(&db, &payload.name, &payload.icon, &user.id) {
        Ok(project) => ApiResult::success(serde_json::json!({ "project": project })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn get_project(db: State<Arc<Db>>, session_id: String, project_id: String) -> ApiResult<serde_json::Value> {
    let user = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match project_repo::get_project(&db, &project_id, &user.id) {
        Ok(Some(project)) => {
            let role = project_repo::get_project_member_role(&db, &project_id, &user.id)
                .unwrap_or_default();
            let members = project_repo::list_project_members(&db, &project_id)
                .unwrap_or_default();
            ApiResult::success(serde_json::json!({
                "currentUserId": user.id,
                "project": project,
                "role": role,
                "members": members,
            }))
        }
        Ok(None) => crate::errors::AppError::NotFound("项目不存在".into()).into(),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn update_project(db: State<Arc<Db>>, session_id: String, project_id: String, payload: UpdateProjectPayload) -> ApiResult<serde_json::Value> {
    let user = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    let role = project_repo::get_project_member_role(&db, &project_id, &user.id);
    match role.as_deref() {
        Some("owner") | Some("editor") => {},
        _ => return crate::errors::AppError::Forbidden("无权限".into()).into(),
    }

    match project_repo::update_project(&db, &project_id, &payload.name, &payload.icon) {
        Ok(()) => {
            match project_repo::get_project(&db, &project_id, &user.id) {
                Ok(Some(project)) => ApiResult::success(serde_json::json!({ "project": project })),
                _ => crate::errors::AppError::NotFound("项目不存在".into()).into(),
            }
        }
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn delete_project(db: State<Arc<Db>>, session_id: String, project_id: String) -> ApiResult<serde_json::Value> {
    let user = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    let role = project_repo::get_project_member_role(&db, &project_id, &user.id);
    if role.as_deref() != Some("owner") {
        return crate::errors::AppError::Forbidden("仅项目所有者可删除".into()).into();
    }

    match project_repo::delete_project(&db, &project_id) {
        Ok(()) => ApiResult::success(serde_json::json!({ "projectId": project_id })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn list_project_members(db: State<Arc<Db>>, session_id: String, project_id: String) -> ApiResult<serde_json::Value> {
    let user = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    if project_repo::get_project_member_role(&db, &project_id, &user.id).is_none() {
        return crate::errors::AppError::Forbidden("无权限".into()).into();
    }

    match project_repo::list_project_members(&db, &project_id) {
        Ok(members) => ApiResult::success(serde_json::json!({ "members": members })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn add_project_member(db: State<Arc<Db>>, session_id: String, project_id: String, payload: AddMemberPayload) -> ApiResult<serde_json::Value> {
    let user = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    let role = project_repo::get_project_member_role(&db, &project_id, &user.id);
    if role.as_deref() != Some("owner") {
        return crate::errors::AppError::Forbidden("仅项目所有者可添加成员".into()).into();
    }

    match project_repo::add_project_member(&db, &project_id, &payload.username, &payload.role) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn update_member_role(db: State<Arc<Db>>, session_id: String, project_id: String, user_id: String, payload: UpdateMemberRolePayload) -> ApiResult<serde_json::Value> {
    let actor = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    let actor_role = project_repo::get_project_member_role(&db, &project_id, &actor.id);
    if actor_role.as_deref() != Some("owner") {
        return crate::errors::AppError::Forbidden("仅项目所有者可修改角色".into()).into();
    }

    match project_repo::update_member_role(&db, &project_id, &user_id, &payload.role) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn remove_project_member(db: State<Arc<Db>>, session_id: String, project_id: String, user_id: String) -> ApiResult<serde_json::Value> {
    let actor = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    let actor_role = project_repo::get_project_member_role(&db, &project_id, &actor.id);
    if actor_role.as_deref() != Some("owner") {
        return crate::errors::AppError::Forbidden("仅项目所有者可移除成员".into()).into();
    }

    match project_repo::remove_project_member(&db, &project_id, &user_id) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn list_project_invitations(db: State<Arc<Db>>, session_id: String, project_id: String) -> ApiResult<serde_json::Value> {
    let user = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    if project_repo::get_project_member_role(&db, &project_id, &user.id).is_none() {
        return crate::errors::AppError::Forbidden("无权限".into()).into();
    }

    match project_repo::list_project_invitations(&db, &project_id) {
        Ok(invitations) => ApiResult::success(serde_json::json!({ "invitations": invitations })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn create_project_invitation(db: State<Arc<Db>>, session_id: String, project_id: String, payload: CreateInvitationPayload) -> ApiResult<serde_json::Value> {
    let user = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    let role = project_repo::get_project_member_role(&db, &project_id, &user.id);
    if role.as_deref() != Some("owner") {
        return crate::errors::AppError::Forbidden("仅项目所有者可创建邀请".into()).into();
    }

    match project_repo::create_project_invitation(&db, &project_id, &user.id, &payload.role, payload.expires_in_hours) {
        Ok(invitation) => ApiResult::success(serde_json::json!({ "invitation": invitation })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn revoke_project_invitation(db: State<Arc<Db>>, session_id: String, project_id: String, invite_id: String) -> ApiResult<serde_json::Value> {
    let user = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    let role = project_repo::get_project_member_role(&db, &project_id, &user.id);
    if role.as_deref() != Some("owner") {
        return crate::errors::AppError::Forbidden("仅项目所有者可撤销邀请".into()).into();
    }

    match project_repo::revoke_project_invitation(&db, &project_id, &invite_id) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn get_project_invitation(db: State<Arc<Db>>, session_id: String, invite_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match project_repo::get_project_invitation(&db, &invite_id) {
        Some(invitation) => ApiResult::success(serde_json::json!({ "invitation": invitation })),
        None => crate::errors::AppError::NotFound("邀请不存在".into()).into(),
    }
}

#[tauri::command]
pub fn accept_project_invitation(db: State<Arc<Db>>, session_id: String, invite_id: String) -> ApiResult<serde_json::Value> {
    let user = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match project_repo::accept_project_invitation(&db, &invite_id, &user.id) {
        Ok(result) => ApiResult::success(serde_json::json!({
            "projectId": result.project_id,
            "projectName": result.project_name,
        })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn get_project_state(db: State<Arc<Db>>, session_id: String, project_id: String) -> ApiResult<ProjectStateSnapshot> {
    let _user = match check_session(&db, &session_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match project_repo::get_project_state(&db, &project_id) {
        Ok(state) => ApiResult::success(state),
        Err(e) => e.into(),
    }
}
