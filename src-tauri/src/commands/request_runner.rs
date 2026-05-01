use std::sync::Arc;
use std::time::Instant;

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

    let details = &payload.api_details;
    let method = details
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("GET")
        .to_uppercase();
    let path = details
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("/");

    // Resolve base URL
    let base_url = payload
        .base_url
        .as_deref()
        .unwrap_or("")
        .trim_end_matches('/');

    // Build full URL
    let is_absolute = path.starts_with("http://") || path.starts_with("https://");
    let full_url = if is_absolute {
        path.to_string()
    } else if base_url.is_empty() {
        path.to_string()
    } else {
        format!("{}{}", base_url, path)
    };

    // Build query parameters
    let query_params = extract_params(details, "query");
    let query_string = build_query_string(&query_params);
    let url_with_query = if query_string.is_empty() {
        full_url
    } else {
        let sep = if full_url.contains('?') { '&' } else { '?' };
        format!("{}{}{}", full_url, sep, query_string)
    };

    // Build headers
    let header_params = extract_params(details, "header");
    let request_headers: Vec<(String, String)> = header_params
        .iter()
        .map(|h| (h.name.clone(), h.value.clone()))
        .collect();

    // Build body
    let body_type = details
        .get("requestBody")
        .and_then(|b| b.get("type"))
        .and_then(|v| v.as_str())
        .unwrap_or("none");
    let (body_text, content_type_header, body_params) =
        build_body(details, body_type);

    let start = Instant::now();
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .unwrap_or_default();

    let mut req = match method.as_str() {
        "POST" => client.post(&url_with_query),
        "PUT" => client.put(&url_with_query),
        "PATCH" => client.patch(&url_with_query),
        "DELETE" => client.delete(&url_with_query),
        _ => client.get(&url_with_query),
    };

    // Set headers
    for (key, value) in &request_headers {
        if !key.is_empty() {
            req = req.header(key.as_str(), value.as_str());
        }
    }
    if let Some(ct) = &content_type_header {
        if !request_headers.iter().any(|(k, _)| k.to_lowercase() == "content-type") {
            req = req.header("Content-Type", ct.as_str());
        }
    }

    // Set body
    if !body_text.is_empty() && method != "GET" {
        req = req.body(body_text.clone());
    }

    match req.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let status_text = resp.status().canonical_reason().unwrap_or("").to_string();
            let resp_content_type = resp
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            let resp_headers: Vec<serde_json::Value> = resp
                .headers()
                .iter()
                .map(|(k, v)| {
                    serde_json::json!({
                        "name": k.to_string(),
                        "value": v.to_str().unwrap_or("").to_string()
                    })
                })
                .collect();
            let body = resp.text().await.unwrap_or_default();
            let duration_ms = start.elapsed().as_millis() as u64;

            let req_headers_json: Vec<serde_json::Value> = request_headers
                .iter()
                .map(|(k, v)| {
                    serde_json::json!({ "name": k, "value": v })
                })
                .collect();

            let req_query_json: Vec<serde_json::Value> = query_params
                .iter()
                .map(|p| {
                    serde_json::json!({ "name": p.name, "value": p.value })
                })
                .collect();

            Ok(ApiResult::success(serde_json::json!({
                "url": url_with_query,
                "method": method,
                "status": status,
                "statusText": status_text,
                "durationMs": duration_ms,
                "requestHeaders": req_headers_json,
                "requestQuery": req_query_json,
                "requestCookie": [],
                "requestBodyParameters": body_params,
                "requestBodyText": body_text,
                "headers": resp_headers,
                "contentType": resp_content_type,
                "body": body,
            })))
        }
        Err(e) => {
            let duration_ms = start.elapsed().as_millis() as u64;
            Ok(ApiResult::success(serde_json::json!({
                "url": url_with_query,
                "method": method,
                "status": 0,
                "statusText": e.to_string(),
                "durationMs": duration_ms,
                "requestHeaders": [],
                "requestQuery": [],
                "requestCookie": [],
                "requestBodyParameters": [],
                "headers": [],
                "contentType": "",
                "body": "",
            })))
        }
    }
}

struct ParamEntry {
    name: String,
    value: String,
}

fn extract_params(details: &serde_json::Value, section: &str) -> Vec<ParamEntry> {
    details
        .get("parameters")
        .and_then(|p| p.get(section))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter(|p| p.get("name").and_then(|n| n.as_str()).map_or(false, |n| !n.is_empty()))
                .filter(|p| p.get("enable").and_then(|e| e.as_bool()).unwrap_or(true))
                .map(|p| ParamEntry {
                    name: p.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string(),
                    value: p
                        .get("example")
                        .and_then(|v| v.as_str())
                        .or_else(|| p.get("value").and_then(|v| v.as_str()))
                        .unwrap_or("")
                        .to_string(),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn build_query_string(params: &[ParamEntry]) -> String {
    if params.is_empty() {
        return String::new();
    }
    params
        .iter()
        .map(|p| {
            format!(
                "{}={}",
                urlencoding::encode(&p.name),
                urlencoding::encode(&p.value)
            )
        })
        .collect::<Vec<_>>()
        .join("&")
}

fn build_body(
    details: &serde_json::Value,
    body_type: &str,
) -> (String, Option<String>, Vec<serde_json::Value>) {
    let body = details.get("requestBody");
    match body_type {
        "json" | "xml" => {
            let raw = body
                .and_then(|b| b.get("rawText"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .or_else(|| {
                    body.and_then(|b| b.get("jsonSchema"))
                        .map(|s| build_schema_example(s))
                        .and_then(|v| serde_json::to_string_pretty(&v).ok())
                })
                .unwrap_or_default();
            let ct = if body_type == "json" {
                Some("application/json".into())
            } else {
                Some("application/xml".into())
            };
            (raw, ct, vec![])
        }
        "form-data" | "url-encoded" => {
            let params = body
                .and_then(|b| b.get("parameters"))
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter(|p| {
                            p.get("name")
                                .and_then(|n| n.as_str())
                                .map_or(false, |n| !n.is_empty())
                        })
                        .filter(|p| p.get("enable").and_then(|e| e.as_bool()).unwrap_or(true))
                        .map(|p| ParamEntry {
                            name: p.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string(),
                            value: p
                                .get("example")
                                .and_then(|v| v.as_str())
                                .or_else(|| p.get("value").and_then(|v| v.as_str()))
                                .unwrap_or("")
                                .to_string(),
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            let body_params_json: Vec<serde_json::Value> = params
                .iter()
                .map(|p| serde_json::json!({ "name": p.name, "value": p.value }))
                .collect();

            let form_text = build_query_string(&params);
            let ct = if body_type == "form-data" {
                Some("multipart/form-data".into())
            } else {
                Some("application/x-www-form-urlencoded".into())
            };
            (form_text, ct, body_params_json)
        }
        "raw" => {
            let raw = body
                .and_then(|b| b.get("rawText"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            (raw, None, vec![])
        }
        _ => (String::new(), None, vec![]),
    }
}

fn build_schema_example(schema: &serde_json::Value) -> serde_json::Value {
    let stype = schema
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("string");
    match stype {
        "object" => {
            let mut out = serde_json::Map::new();
            if let Some(props) = schema.get("properties").and_then(|v| v.as_array()) {
                for (i, field) in props.iter().enumerate() {
                    let name = field
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let key = if name.is_empty() {
                        format!("field_{}", i + 1)
                    } else {
                        name
                    };
                    out.insert(key, build_schema_example(field));
                }
            }
            serde_json::Value::Object(out)
        }
        "array" => {
            let items = schema
                .get("items")
                .map(|v| build_schema_example(v))
                .unwrap_or(serde_json::Value::Null);
            serde_json::json!([items])
        }
        "integer" | "number" => serde_json::json!(0),
        "boolean" => serde_json::json!(true),
        "null" => serde_json::Value::Null,
        _ => serde_json::json!("string"),
    }
}
