use std::sync::Arc;

use crate::db::client::Db;
use crate::db::{auth_repo, project_repo};
use crate::models::*;

#[tauri::command]
pub async fn run_api_request(
    db: tauri::State<'_, Arc<Db>>,
    session_id: String,
    project_id: String,
    payload: RunRequestPayload,
) -> Result<ApiResult<serde_json::Value>, String> {
    let user = match auth_repo::get_valid_session_user(&db, &session_id) {
        Some(u) => u,
        None => return Ok(crate::errors::AppError::Unauthorized("未登录".into()).into()),
    };

    if project_repo::get_project_member_role(&db, &project_id, &user.id).is_none() {
        return Ok(crate::errors::AppError::Forbidden("无权限".into()).into());
    }

    let method = payload.api_details
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("GET")
        .to_uppercase();

    let url = payload.api_details
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let headers_str = payload.api_details
        .get("headers")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let body = payload.api_details
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if url.is_empty() {
        return Ok(crate::errors::AppError::BadRequest("URL is required".into()).into());
    }

    let client = reqwest::Client::new();
    let mut req = match method.as_str() {
        "GET" => client.get(url),
        "POST" => client.post(url),
        "PUT" => client.put(url),
        "PATCH" => client.patch(url),
        "DELETE" => client.delete(url),
        _ => client.get(url),
    };

    for line in headers_str.lines() {
        if let Some((key, value)) = line.split_once(':') {
            req = req.header(key.trim(), value.trim());
        }
    }

    if !body.is_empty() && method != "GET" {
        req = req.body(body.to_string());
    }

    match req.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let resp_headers: Vec<(String, String)> = resp
                .headers()
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                .collect();

            let text = resp.text().await.unwrap_or_default();

            Ok(ApiResult::success(serde_json::json!({
                "status": status,
                "headers": resp_headers,
                "body": text,
            })))
        }
        Err(e) => Ok(crate::errors::AppError::Internal(format!("请求失败: {e}")).into()),
    }
}
