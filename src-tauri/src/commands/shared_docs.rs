use tauri::State;
use crate::db::client::Db;
use std::sync::Arc;
use crate::db::{auth_repo, project_repo, shared_files_repo};
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
pub fn list_shared_docs(db: State<Arc<Db>>, session_id: String, project_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match shared_files_repo::list_shared_docs(&db, &project_id) {
        Ok(docs) => ApiResult::success(serde_json::json!({ "docs": docs })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn create_shared_doc(db: State<Arc<Db>>, session_id: String, project_id: String, payload: CreateDocPayload) -> ApiResult<serde_json::Value> {
    let user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    let doc_type = payload.doc_type.as_deref().unwrap_or("markdown");
    let title = payload.title.as_deref().unwrap_or("未命名文档");

    match shared_files_repo::create_shared_doc(&db, &project_id, &user.id, doc_type, title) {
        Ok(doc) => ApiResult::success(serde_json::json!({ "doc": doc })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn get_shared_doc(db: State<Arc<Db>>, session_id: String, project_id: String, doc_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match shared_files_repo::get_shared_doc(&db, &project_id, &doc_id) {
        Ok(Some(doc)) => ApiResult::success(serde_json::json!({ "doc": doc })),
        Ok(None) => crate::errors::AppError::NotFound("文档不存在".into()).into(),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn save_shared_doc(db: State<Arc<Db>>, session_id: String, project_id: String, doc_id: String, payload: SaveDocPayload) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match shared_files_repo::save_shared_doc(
        &db, &project_id, &doc_id,
        payload.content.as_deref(),
        payload.y_state_base64.as_deref(),
        payload.title.as_deref(),
        payload.version,
    ) {
        Ok(()) => {
            match shared_files_repo::get_shared_doc(&db, &project_id, &doc_id) {
                Ok(Some(doc)) => ApiResult::success(serde_json::json!({ "doc": doc })),
                _ => crate::errors::AppError::NotFound("文档不存在".into()).into(),
            }
        }
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn delete_shared_doc(db: State<Arc<Db>>, session_id: String, project_id: String, doc_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match shared_files_repo::delete_shared_doc(&db, &project_id, &doc_id) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn export_shared_doc(db: State<Arc<Db>>, session_id: String, project_id: String, doc_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_member(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match shared_files_repo::get_shared_doc(&db, &project_id, &doc_id) {
        Ok(Some(doc)) => ApiResult::success(serde_json::json!({
            "title": doc.title,
            "content": doc.content,
            "docType": doc.doc_type,
        })),
        Ok(None) => crate::errors::AppError::NotFound("文档不存在".into()).into(),
        Err(e) => e.into(),
    }
}
