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

    let method = payload.method.to_uppercase();
    let url = &payload.url;

    let start = Instant::now();
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .unwrap_or_default();

    let mut req = match method.as_str() {
        "POST" => client.post(url),
        "PUT" => client.put(url),
        "PATCH" => client.patch(url),
        "DELETE" => client.delete(url),
        _ => client.get(url),
    };

    // Set headers from payload
    for h in &payload.headers {
        if !h.name.is_empty() {
            req = req.header(&h.name, &h.value);
        }
    }

    // Content-Type
    if let Some(ct) = &payload.content_type {
        if !payload.headers.iter().any(|h| h.name.to_lowercase() == "content-type") {
            req = req.header("Content-Type", ct.as_str());
        }
    }

    // Set body
    if !payload.body.is_empty() && method != "GET" {
        req = req.body(payload.body.clone());
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

            let req_headers_json: Vec<serde_json::Value> = payload.headers.iter()
                .map(|h| serde_json::json!({ "name": h.name, "value": h.value }))
                .collect();

            Ok(ApiResult::success(serde_json::json!({
                "url": url,
                "method": method,
                "status": status,
                "statusText": status_text,
                "durationMs": duration_ms,
                "requestHeaders": req_headers_json,
                "requestQuery": [],
                "requestCookie": [],
                "requestBodyParameters": [],
                "requestBodyText": payload.body,
                "headers": resp_headers,
                "contentType": resp_content_type,
                "body": body,
            })))
        }
        Err(e) => {
            let duration_ms = start.elapsed().as_millis() as u64;
            Ok(ApiResult::success(serde_json::json!({
                "url": url,
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_build_body_json_with_raw_text() {
        let details = json!({
            "requestBody": {
                "type": "application/json",
                "rawText": "{\"d\": \"123\"}",
                "jsonSchema": {
                    "type": "object",
                    "properties": [{ "name": "d", "type": "string" }]
                }
            }
        });
        let (body_text, content_type, _) = build_body(&details, "json");
        assert_eq!(body_text, "{\"d\": \"123\"}");
        assert_eq!(content_type, Some("application/json".into()));
    }

    #[test]
    fn test_build_body_json_falls_back_to_schema() {
        let details = json!({
            "requestBody": {
                "type": "application/json",
                "jsonSchema": {
                    "type": "object",
                    "properties": [
                        { "name": "name", "type": "string" },
                        { "name": "age", "type": "integer" }
                    ]
                }
            }
        });
        let (body_text, _, _) = build_body(&details, "json");
        assert!(!body_text.is_empty());
        let parsed: serde_json::Value = serde_json::from_str(&body_text).unwrap();
        assert_eq!(parsed["name"], "string");
        assert_eq!(parsed["age"], 0);
    }

    #[test]
    fn test_build_body_json_empty_raw_falls_back() {
        let details = json!({
            "requestBody": {
                "type": "application/json",
                "rawText": "",
                "jsonSchema": {
                    "type": "object",
                    "properties": [{ "name": "x", "type": "string" }]
                }
            }
        });
        let (body_text, _, _) = build_body(&details, "json");
        assert!(!body_text.is_empty());
    }

    #[test]
    fn test_build_body_json_with_parameters_and_raw_text() {
        let details = json!({
            "requestBody": {
                "type": "application/json",
                "rawText": "{\"d\": \"123\", \"dd\": \"12312\"}",
                "jsonSchema": {
                    "type": "object",
                    "properties": [
                        { "name": "d", "type": "string" },
                        { "name": "dd", "type": "string" }
                    ]
                },
                "parameters": [
                    { "name": "dform", "type": "string", "example": "1231" }
                ]
            }
        });

        let (body_text, content_type, _) = build_body(&details, "json");
        assert_eq!(body_text, "{\"d\": \"123\", \"dd\": \"12312\"}",
            "JSON 类型 body 必须优先使用 rawText，忽略 parameters");
        assert_eq!(content_type, Some("application/json".into()));
    }

    #[test]
    fn test_build_body_form_data() {
        let details = json!({
            "requestBody": {
                "type": "multipart/form-data",
                "parameters": [
                    { "name": "field1", "type": "string", "example": "value1", "enable": true },
                    { "name": "field2", "type": "string", "example": "", "enable": true },
                    { "name": "disabled", "type": "string", "example": "x", "enable": false }
                ]
            }
        });

        let (body_text, content_type, _) = build_body(&details, "form-data");
        assert!(body_text.contains("field1=value1"));
        assert!(body_text.contains("field2="));
        assert!(!body_text.contains("disabled"));
        assert_eq!(content_type, Some("multipart/form-data".into()));
    }

    #[test]
    fn test_build_body_url_encoded() {
        let details = json!({
            "requestBody": {
                "type": "application/x-www-form-urlencoded",
                "parameters": [
                    { "name": "key", "type": "string", "example": "val", "enable": true }
                ]
            }
        });

        let (body_text, content_type, _) = build_body(&details, "url-encoded");
        assert_eq!(body_text, "key=val");
        assert_eq!(content_type, Some("application/x-www-form-urlencoded".into()));
    }

    #[test]
    fn test_build_body_raw() {
        let details = json!({
            "requestBody": {
                "type": "text/plain",
                "rawText": "raw content here"
            }
        });

        let (body_text, content_type, _) = build_body(&details, "raw");
        assert_eq!(body_text, "raw content here");
        assert_eq!(content_type, None);
    }

    #[test]
    fn test_build_body_none_returns_empty() {
        let details = json!({
            "requestBody": {
                "type": "none"
            }
        });

        let (body_text, content_type, _) = build_body(&details, "none");
        assert!(body_text.is_empty());
        assert_eq!(content_type, None);
    }
}
