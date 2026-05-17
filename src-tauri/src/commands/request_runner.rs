use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;

use crate::db::client::Db;
use crate::db::{auth_repo, project_repo};
use crate::models::*;

#[derive(Debug, Serialize)]
pub struct RequestErrorInfo {
    pub error_type: String,
    pub error_message: String,
    pub error_detail: String,
    pub suggestion: String,
}

fn categorize_request_error(e: &reqwest::Error) -> RequestErrorInfo {
    let detail = e.to_string();

    if e.is_connect() {
        let msg = detail.to_lowercase();
        if msg.contains("dns") || msg.contains("temporary failure in name resolution") || msg.contains("failed to resolve") {
            return RequestErrorInfo {
                error_type: "dns_failure".into(),
                error_message: "DNS 解析失败，无法找到服务器地址".into(),
                error_detail: detail,
                suggestion: "请检查 URL 中的域名是否正确\n检查网络连接是否正常\n尝试使用 IP 地址代替域名".into(),
            };
        }
        if msg.contains("connection refused") {
            return RequestErrorInfo {
                error_type: "connection_refused".into(),
                error_message: "连接被服务器拒绝".into(),
                error_detail: detail,
                suggestion: "请确认目标服务器已启动\n检查端口号是否正确\n确认防火墙未阻止连接".into(),
            };
        }
        if msg.contains("connection reset") {
            return RequestErrorInfo {
                error_type: "connection_reset".into(),
                error_message: "连接被重置".into(),
                error_detail: detail,
                suggestion: "请检查网络连接是否稳定\n目标服务器可能主动断开了连接".into(),
            };
        }
        if msg.contains("network unreachable") || msg.contains("no route to host") {
            return RequestErrorInfo {
                error_type: "network_unreachable".into(),
                error_message: "网络不可达".into(),
                error_detail: detail,
                suggestion: "请检查网络连接是否正常\n确认目标地址是否在本地网络中".into(),
            };
        }
        return RequestErrorInfo {
            error_type: "connection_failed".into(),
            error_message: "无法连接到服务器".into(),
            error_detail: detail,
            suggestion: "请检查网络连接和 URL 是否正确\n确认目标服务器是否在线".into(),
        };
    }

    if e.is_timeout() {
        return RequestErrorInfo {
            error_type: "timeout".into(),
            error_message: "请求超时".into(),
            error_detail: detail,
            suggestion: "目标服务器响应过慢，请稍后重试\n检查网络连接是否稳定\n确认目标服务器是否负载过高".into(),
        };
    }

    // reqwest 0.12 没有 is_tls() 方法，通过字符串匹配检测 TLS 错误
    let msg_lower = detail.to_lowercase();
    if msg_lower.contains("tls") || msg_lower.contains("ssl") || msg_lower.contains("certificate") {
        return RequestErrorInfo {
            error_type: "tls_error".into(),
            error_message: "TLS/SSL 证书验证失败".into(),
            error_detail: detail,
            suggestion: "请确认服务器 SSL 证书是否有效\n检查系统时间是否准确\n如果使用自签名证书，需要配置信任".into(),
        };
    }

    if e.is_status() {
        return RequestErrorInfo {
            error_type: "http_error".into(),
            error_message: "HTTP 响应状态异常".into(),
            error_detail: detail,
            suggestion: "请检查请求参数是否正确".into(),
        };
    }

    if e.is_redirect() {
        return RequestErrorInfo {
            error_type: "redirect_error".into(),
            error_message: "重定向处理失败".into(),
            error_detail: detail,
            suggestion: "请检查请求 URL 是否被重定向到无效地址".into(),
        };
    }

    if e.is_body() {
        return RequestErrorInfo {
            error_type: "body_error".into(),
            error_message: "请求体发送失败".into(),
            error_detail: detail,
            suggestion: "请检查请求体数据是否过大或格式不正确".into(),
        };
    }

    RequestErrorInfo {
        error_type: "unknown".into(),
        error_message: "请求异常".into(),
        error_detail: detail,
        suggestion: "请检查网络和请求配置\n如果问题持续，请查看技术详情联系管理员".into(),
    }
}

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
    let client = build_client_with_proxy(payload.proxy_config.as_ref(), payload.insecure_skip_verify);

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

    // Content-Type (skip if we'll use multipart)
    if !payload.form_data_files.is_empty() {
        // multipart 请求不需要手动设置 Content-Type，reqwest 会自动生成
    } else if let Some(ct) = &payload.content_type {
        if !payload.headers.iter().any(|h| h.name.to_lowercase() == "content-type") {
            req = req.header("Content-Type", ct.as_str());
        }
    }

    // Set body
    if !payload.body.is_empty() && method != "GET" {
        if !payload.form_data_files.is_empty() {
            // multipart/form-data with files
            let mut form = reqwest::multipart::Form::new();
            // 添加普通文本字段
            for pair in payload.body.split('&') {
                let (key, value) = if let Some((k, v)) = pair.split_once('=') {
                    let decoded_key = urlencoding::decode(k).unwrap_or_default().to_string();
                    let decoded_val = urlencoding::decode(v).unwrap_or_default().to_string();
                    (decoded_key, decoded_val)
                } else if !pair.is_empty() {
                    (urlencoding::decode(pair).unwrap_or_default().to_string(), String::new())
                } else {
                    continue;
                };
                form = form.part(key.clone(), reqwest::multipart::Part::text(value));
            }
            // 添加文件字段
            for file in &payload.form_data_files {
                if let Ok(file_bytes) = std::fs::read(&file.path) {
                    let filename = std::path::Path::new(&file.path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(&file.name)
                        .to_string();
                    let part = reqwest::multipart::Part::bytes(file_bytes)
                        .file_name(filename);
                    form = form.part(file.name.clone(), part);
                }
            }
            req = req.multipart(form);
        } else {
            req = req.body(payload.body.clone());
        }
    } else if !payload.form_data_files.is_empty() && method != "GET" {
        // 没有 body text 但有文件的情况
        let mut form = reqwest::multipart::Form::new();
        for file in &payload.form_data_files {
            if let Ok(file_bytes) = std::fs::read(&file.path) {
                let filename = std::path::Path::new(&file.path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&file.name)
                    .to_string();
                let part = reqwest::multipart::Part::bytes(file_bytes)
                    .file_name(filename);
                form = form.part(file.name.clone(), part);
            }
        }
        req = req.multipart(form);
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
                "proxyType": payload.proxy_config.as_ref().map(|pc| pc.proxy_type.clone()).unwrap_or_default(),
            })))
        }
        Err(e) => {
            let duration_ms = start.elapsed().as_millis() as u64;
            let err_info = categorize_request_error(&e);
            Ok(ApiResult::success(serde_json::json!({
                "url": url,
                "method": method,
                "status": 0,
                "statusText": err_info.error_message,
                "durationMs": duration_ms,
                "requestHeaders": [],
                "requestQuery": [],
                "requestCookie": [],
                "requestBodyParameters": [],
                "headers": [],
                "contentType": "",
                "body": "",
                "proxyType": payload.proxy_config.as_ref().map(|pc| pc.proxy_type.clone()).unwrap_or_default(),
                "errorInfo": err_info,
            })))
        }
    }
}

#[allow(dead_code)]
struct ParamEntry {
    name: String,
    value: String,
}

#[allow(dead_code)]
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

#[allow(dead_code)]
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

#[allow(dead_code)]
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

#[allow(dead_code)]
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

fn build_client_with_proxy(proxy_config: Option<&ProxyConfig>, insecure_skip_verify: bool) -> reqwest::Client {
    let mut builder = reqwest::Client::builder();
    if insecure_skip_verify {
        builder = builder.danger_accept_invalid_certs(true);
    }
    if let Some(pc) = proxy_config {
        match pc.proxy_type.as_str() {
            "socks5" => {
                let url = format!("socks5://{}:{}", pc.host, pc.port);
                if let Ok(mut p) = reqwest::Proxy::all(&url) {
                    if let (Some(u), Some(pw)) = (&pc.username, &pc.password) {
                        p = p.basic_auth(u.as_str(), pw.as_str());
                    }
                    builder = builder.proxy(p);
                    return builder.build().unwrap_or_default();
                }
            }
            "http" => {
                let url = format!("http://{}:{}", pc.host, pc.port);
                if let Ok(mut p) = reqwest::Proxy::all(&url) {
                    if let (Some(u), Some(pw)) = (&pc.username, &pc.password) {
                        p = p.basic_auth(u.as_str(), pw.as_str());
                    }
                    builder = builder.proxy(p);
                    return builder.build().unwrap_or_default();
                }
            }
            _ => {}
        }
    }
    builder.no_proxy().build().unwrap_or_default()
}

#[tauri::command]
pub async fn test_proxy_connection(
    proxy_config: ProxyConfig,
    test_url: String,
) -> Result<ApiResult<serde_json::Value>, String> {
    let start = Instant::now();
    let client = build_client_with_proxy(Some(&proxy_config), false);
    match client.get(&test_url).send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let duration = start.elapsed().as_millis() as u64;
            Ok(ApiResult::success(serde_json::json!({
                "ok": (200..400).contains(&status),
                "statusCode": status,
                "durationMs": duration,
            })))
        }
        Err(e) => {
            let err_info = categorize_request_error(&e);
            let proxy_suggestion = match err_info.error_type.as_str() {
                "connection_refused" => "请确认代理地址和端口是否正确\n确认代理服务是否已启动",
                "dns_failure" => "请检查代理地址是否为有效的 IP 或域名",
                "timeout" => "代理服务器响应超时，请检查网络连接\n确认代理地址和端口是否正确",
                "connection_reset" => "代理连接被重置，请检查代理服务状态",
                "network_unreachable" => "网络不可达，请检查网络连接",
                _ => "请检查代理配置是否正确\n确认代理服务是否正常运行",
            };
            Ok(ApiResult::success(serde_json::json!({
                "ok": false,
                "error": err_info.error_message,
                "errorInfo": {
                    "errorType": err_info.error_type,
                    "errorMessage": err_info.error_message,
                    "errorDetail": err_info.error_detail,
                    "suggestion": proxy_suggestion,
                },
            })))
        },
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

    #[test]
    fn test_proxy_config_socks5_serde() {
        let json = serde_json::json!({
            "proxyType": "socks5",
            "host": "127.0.0.1",
            "port": 7890
        });
        let config: ProxyConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.proxy_type, "socks5");
        assert_eq!(config.host, "127.0.0.1");
        assert_eq!(config.port, 7890);
        assert!(config.username.is_none());
        assert!(config.password.is_none());
    }

    #[test]
    fn test_proxy_config_http_with_auth() {
        let json = serde_json::json!({
            "proxyType": "http",
            "host": "proxy.example.com",
            "port": 8080,
            "username": "user",
            "password": "pass"
        });
        let config: ProxyConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.proxy_type, "http");
        assert_eq!(config.username.unwrap(), "user");
        assert_eq!(config.password.unwrap(), "pass");
    }

    #[test]
    fn test_proxy_config_none() {
        let json = serde_json::json!({
            "proxyType": "none",
            "host": "",
            "port": 0
        });
        let config: ProxyConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.proxy_type, "none");
    }

    #[test]
    fn test_build_client_no_proxy() {
        let client = build_client_with_proxy(None);
        // 验证客户端构建不 panic
        let _ = client;
    }
}
