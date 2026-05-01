use std::sync::Arc;

use tauri::State;

use crate::db::client::Db;
use crate::db::{auth_repo, project_repo, token_repo};
use crate::http::yapi_server::{self, YApiServerHandle};
use crate::models::*;

fn check_owner(db: &Db, session_id: &str, project_id: &str) -> Result<SessionUser, crate::errors::AppError> {
    let user = auth_repo::get_valid_session_user(db, session_id)
        .ok_or_else(|| crate::errors::AppError::Unauthorized("未登录".into()))?;

    let role = project_repo::get_project_member_role(db, project_id, &user.id);
    match role.as_deref() {
        Some("owner") => Ok(user),
        _ => Err(crate::errors::AppError::Forbidden("仅项目所有者可管理令牌".into())),
    }
}

#[tauri::command]
pub fn list_project_tokens(db: State<Arc<Db>>, session_id: String, project_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_owner(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match token_repo::list_project_tokens(&db, &project_id) {
        Ok(tokens) => ApiResult::success(serde_json::json!({ "tokens": tokens })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn create_project_token(db: State<Arc<Db>>, session_id: String, project_id: String, payload: CreateTokenPayload) -> ApiResult<serde_json::Value> {
    let _user = match check_owner(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    let name = payload.name.as_deref().unwrap_or("default");
    match token_repo::create_project_token(&db, &project_id, name) {
        Ok(token) => ApiResult::success(serde_json::json!({ "token": token })),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn delete_project_token(db: State<Arc<Db>>, session_id: String, project_id: String, token_id: String) -> ApiResult<serde_json::Value> {
    let _user = match check_owner(&db, &session_id, &project_id) {
        Ok(u) => u,
        Err(e) => return e.into(),
    };

    match token_repo::delete_project_token(&db, &project_id, &token_id) {
        Ok(()) => ApiResult::success(serde_json::json!({})),
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub fn get_yapi_server_info(
    yapi_handle: State<Arc<YApiServerHandle>>,
) -> ApiResult<serde_json::Value> {
    let port = *yapi_handle.port.lock().unwrap();
    ApiResult::success(serde_json::json!({
        "port": port,
        "address": format!("http://127.0.0.1:{}", port),
    }))
}

#[tauri::command]
pub async fn restart_yapi_server(
    yapi_handle: State<'_, Arc<YApiServerHandle>>,
    db: State<'_, Arc<Db>>,
    port: u16,
) -> Result<ApiResult<serde_json::Value>, String> {
    // Send shutdown signal to current server
    if let Some(tx) = yapi_handle.shutdown_tx.lock().unwrap().take() {
        let _ = tx.send(());
    }
    // Wait for old server to stop
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    // Start new server
    let db_arc = Arc::clone(&db);
    let handle_arc = Arc::clone(&yapi_handle);
    tauri::async_runtime::spawn(async move {
        yapi_server::start_yapi_server(db_arc, handle_arc, port).await;
    });

    // Wait for new server to start
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    let new_port = *yapi_handle.port.lock().unwrap();
    Ok(ApiResult::success(serde_json::json!({
        "port": new_port,
        "address": format!("http://127.0.0.1:{}", new_port),
    })))
}
