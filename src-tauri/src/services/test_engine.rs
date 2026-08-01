use std::collections::HashMap;
use std::time::Instant;
use serde::{Deserialize, Serialize};
use regex::Regex;

use crate::db::{menu_repo, test_repo};
use crate::db::client::Db;
use crate::errors::AppError;
use crate::models::*;

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StepRequestResult {
    pub request: serde_json::Value,
    pub response: serde_json::Value,
    pub status_code: i32,
    pub duration_ms: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExtractorDef {
    #[serde(rename = "type")]
    pub extractor_type: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub pattern: Option<String>,
    pub variable: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AssertionDef {
    #[serde(rename = "type")]
    pub assertion_type: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    pub operator: String,
    #[serde(default)]
    pub expected: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExtractorResult {
    pub extractor: ExtractorDef,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AssertionResult {
    pub assertion: AssertionDef,
    pub passed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub struct TestEngine;

impl TestEngine {
    /// 内置动态变量求值（{{$xxx}} 语法，与 Postman 核心集对齐；不支持的值原样返回）
    fn resolve_dynamic_variable(name: &str) -> Option<String> {
        use rand::Rng;
        use uuid::Uuid;

        let mut rng = rand::thread_rng();
        match name {
            "$timestamp" => Some(chrono::Utc::now().timestamp().to_string()),
            "$timestampISO" => Some(chrono::Utc::now().to_rfc3339()),
            "$guid" => Some(Uuid::new_v4().to_string()),
            "$randomUUID" => Some(Uuid::new_v4().simple().to_string()),
            "$randomInt" => Some(rng.gen_range(0..=1000).to_string()),
            "$randomEmail" => {
                let local: String = (0..8).map(|_| rng.gen_range(b'a'..=b'z') as char).collect();
                Some(format!("{}@example.com", local))
            }
            "$randomIP" => {
                let ip = format!(
                    "{}.{}.{}.{}",
                    rng.gen_range(1..=255),
                    rng.gen_range(0..=255),
                    rng.gen_range(0..=255),
                    rng.gen_range(1..=255)
                );
                Some(ip)
            }
            "$randomMobile" => {
                let prefix = rng.gen_range(130..=199);
                let tail: String = (0..8).map(|_| rng.gen_range(b'0'..=b'9') as char).collect();
                Some(format!("{}{}", prefix, tail))
            }
            "$randomString" => {
                let s: String = (0..8)
                    .map(|_| {
                        let c = rng.gen_range(b'a'..=b'z');
                        (if rng.gen_bool(0.5) { c.to_ascii_uppercase() } else { c }) as char
                    })
                    .collect();
                Some(s)
            }
            "$processEnv" => None,
            _ if name.starts_with("$processEnv:") || name.starts_with("$processEnv.") => {
                let key = name.trim_start_matches("$processEnv:").trim_start_matches("$processEnv.");
                Some(std::env::var(key).unwrap_or_default())
            }
            _ => None,
        }
    }

    /// Variable template replacement: replace {{varName}} with actual values
    /// 先替换内置动态变量（{{$xxx}}），再替换用户变量
    pub fn interpolate_variables(template: &str, variables: &HashMap<String, String>) -> String {
        let mut result = template.to_string();
        for (key, value) in variables {
            let placeholder = format!("{{{{{}}}}}", key);
            result = result.replace(&placeholder, value);
        }
        // 内置动态变量最后替换，避免用户变量名与内置函数冲突
        let dynamic_re = Regex::new(r"\{\{(\$[\w:.]+)\}\}").unwrap();
        result = dynamic_re
            .replace_all(&result, |caps: &regex::Captures| {
                let name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                Self::resolve_dynamic_variable(name).unwrap_or_else(|| format!("{{{{{}}}}}", name))
            })
            .to_string();
        result
    }

    /// Interpolate a JSON value recursively
    #[allow(dead_code)]
    pub fn interpolate_json(value: &serde_json::Value, variables: &HashMap<String, String>) -> serde_json::Value {
        match value {
            serde_json::Value::String(s) => {
                serde_json::Value::String(Self::interpolate_variables(s, variables))
            }
            serde_json::Value::Object(map) => {
                let mut new_map = serde_json::Map::new();
                for (k, v) in map {
                    new_map.insert(k.clone(), Self::interpolate_json(v, variables));
                }
                serde_json::Value::Object(new_map)
            }
            serde_json::Value::Array(arr) => {
                let new_arr: Vec<serde_json::Value> = arr
                    .iter()
                    .map(|v| Self::interpolate_json(v, variables))
                    .collect();
                serde_json::Value::Array(new_arr)
            }
            _ => value.clone(),
        }
    }

    /// Build request payload from menu item data and overrides
    pub fn build_request_payload(
        menu_item: &ApiMenuData,
        override_json: Option<&serde_json::Value>,
        variables: &HashMap<String, String>,
        base_url: Option<&str>,
    ) -> Result<RunRequestPayload, AppError> {
        let data = menu_item.data_json.as_ref()
            .ok_or_else(|| AppError::Internal("Menu item has no data".to_string()))?;

        // Extract method
        let method = data.get("method")
            .and_then(|v: &serde_json::Value| v.as_str())
            .unwrap_or("GET")
            .to_uppercase();

        // Extract path and prepend base URL if relative
        let raw_path = data.get("path")
            .and_then(|v: &serde_json::Value| v.as_str())
            .unwrap_or("")
            .to_string();
        let mut path = if raw_path.starts_with("http://") || raw_path.starts_with("https://") {
            raw_path
        } else if let Some(base) = base_url {
            let base = base.trim_end_matches('/');
            let p = if raw_path.starts_with('/') { &raw_path[1..] } else { &raw_path };
            format!("{}/{}", base, p)
        } else {
            raw_path
        };

        // Extract headers from parameters.header (not "headerParams")
        let mut headers = Vec::new();
        if let Some(params) = data.get("parameters") {
            if let Some(header_params) = params.get("header").and_then(|v: &serde_json::Value| v.as_array()) {
                for param in header_params {
                    if let (Some(name), Some(value)) = (
                        param.get("name").and_then(|v: &serde_json::Value| v.as_str()),
                        param.get("value").and_then(|v: &serde_json::Value| v.as_str()),
                    ) {
                        headers.push(RunRequestHeader {
                            name: name.to_string(),
                            value: value.to_string(),
                        });
                    }
                }
            }
        }

        // Extract body from requestBody (not "body")
        let mut body = String::new();
        let mut content_type = None;
        let form_data_files = Vec::new();

        if let Some(body_data) = data.get("requestBody") {
            if let Some(body_type) = body_data.get("type").and_then(|v: &serde_json::Value| v.as_str()) {
                match body_type {
                    "json" => {
                        content_type = Some("application/json".to_string());
                        if let Some(json_body) = body_data.get("json") {
                            body = if json_body.is_string() {
                                json_body.as_str().unwrap_or("").to_string()
                            } else {
                                json_body.to_string()
                            };
                        }
                    }
                    "form" => {
                        content_type = Some("application/x-www-form-urlencoded".to_string());
                        if let Some(form_params) = body_data.get("formParams").and_then(|v: &serde_json::Value| v.as_array()) {
                            let form_parts: Vec<String> = form_params
                                .iter()
                                .filter_map(|p| {
                                    if let (Some(name), Some(value)) = (
                                        p.get("name").and_then(|v: &serde_json::Value| v.as_str()),
                                        p.get("value").and_then(|v: &serde_json::Value| v.as_str()),
                                    ) {
                                        Some(format!("{}={}", name, value))
                                    } else {
                                        None
                                    }
                                })
                                .collect();
                            body = form_parts.join("&");
                        }
                    }
                    "raw" => {
                        if let Some(raw_body) = body_data.get("raw").and_then(|v: &serde_json::Value| v.as_str()) {
                            body = raw_body.to_string();
                        }
                    }
                    _ => {}
                }
            }
        }

        // Apply overrides: headers, queryParams, pathParams, body
        let mut override_query_params: Vec<(String, String)> = Vec::new();
        let mut override_path_params: Vec<(String, String)> = Vec::new();

        if let Some(override_val) = override_json {
            // Override headers — replace matching names, append new ones
            if let Some(override_headers) = override_val.get("headers").and_then(|v: &serde_json::Value| v.as_array()) {
                for h in override_headers {
                    if let (Some(name), Some(value)) = (
                        h.get("name").and_then(|v: &serde_json::Value| v.as_str()),
                        h.get("value").and_then(|v: &serde_json::Value| v.as_str()),
                    ) {
                        // Replace if exists, otherwise push（大小写不敏感）
                        if let Some(existing) = headers.iter_mut().find(|x| x.name.to_lowercase() == name.to_lowercase()) {
                            existing.value = value.to_string();
                        } else {
                            headers.push(RunRequestHeader {
                                name: name.to_string(),
                                value: value.to_string(),
                            });
                        }
                    }
                }
            }
            // Query params — collect for URL appending
            if let Some(qps) = override_val.get("queryParams").and_then(|v: &serde_json::Value| v.as_array()) {
                for q in qps {
                    if let (Some(name), Some(value)) = (
                        q.get("name").and_then(|v: &serde_json::Value| v.as_str()),
                        q.get("value").and_then(|v: &serde_json::Value| v.as_str()),
                    ) {
                        override_query_params.push((name.to_string(), value.to_string()));
                    }
                }
            }
            // Path params
            if let Some(pps) = override_val.get("pathParams").and_then(|v: &serde_json::Value| v.as_array()) {
                for p in pps {
                    if let (Some(name), Some(value)) = (
                        p.get("name").and_then(|v: &serde_json::Value| v.as_str()),
                        p.get("value").and_then(|v: &serde_json::Value| v.as_str()),
                    ) {
                        override_path_params.push((name.to_string(), value.to_string()));
                    }
                }
            }
            // Override body
            if let Some(ob) = override_val.get("body") {
                if let Some(bt) = ob.get("type").and_then(|v: &serde_json::Value| v.as_str()) {
                    match bt {
                        "json" => {
                            content_type = Some("application/json".to_string());
                            if let Some(j) = ob.get("json") {
                                body = if j.is_string() { j.as_str().unwrap_or("").to_string() } else { j.to_string() };
                            }
                        }
                        "form" => {
                            content_type = Some("application/x-www-form-urlencoded".to_string());
                            if let Some(fp) = ob.get("formParams").and_then(|v: &serde_json::Value| v.as_array()) {
                                let parts: Vec<String> = fp.iter().filter_map(|f| {
                                    let n = f.get("name").and_then(|v| v.as_str()).unwrap_or("");
                                    let v = f.get("value").and_then(|v| v.as_str()).unwrap_or("");
                                    if n.is_empty() { None } else { Some(format!("{}={}", n, v)) }
                                }).collect();
                                body = parts.join("&");
                            }
                        }
                        "raw" => {
                            if let Some(r) = ob.get("raw").and_then(|v| v.as_str()) {
                                body = r.to_string();
                            }
                        }
                        _ => {}
                    }
                }
            }
        }

        // Interpolate variables into all fields
        path = Self::interpolate_variables(&path, variables);
        for header in &mut headers {
            header.name = Self::interpolate_variables(&header.name, variables);
            header.value = Self::interpolate_variables(&header.value, variables);
        }
        for (_, v) in &mut override_query_params { *v = Self::interpolate_variables(v, variables); }
        for (_, v) in &mut override_path_params { *v = Self::interpolate_variables(v, variables); }
        body = Self::interpolate_variables(&body, variables);

        // Replace path params: /api/{id}/users → /api/123/users
        for (name, value) in &override_path_params {
            path = path.replace(&format!("{{{}}}", name), value);
            path = path.replace(&format!(":{}", name), value);
        }

        // Append query params to URL
        let mut url = path.clone();
        if !override_query_params.is_empty() {
            let qs: Vec<String> = override_query_params.iter()
                .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
                .collect();
            url = format!("{}?{}", url, qs.join("&"));
        }

        Ok(RunRequestPayload {
            url,
            method,
            headers,
            body,
            content_type,
            form_data_files,
            proxy_config: None,
            insecure_skip_verify: false,
            timeout_ms: None,
        })
    }

    /// Build step request result from response
    #[allow(dead_code)]
    pub fn build_step_result(
        request: &RunRequestPayload,
        response_body: &str,
        status_code: i32,
        duration_ms: i64,
        response_headers: &HashMap<String, String>,
    ) -> StepRequestResult {
        let request_json = serde_json::json!({
            "url": request.url,
            "method": request.method,
            "headers": request.headers.iter().map(|h| {
                serde_json::json!({"name": h.name, "value": h.value})
            }).collect::<Vec<_>>(),
            "body": request.body,
        });

        let response_json = serde_json::json!({
            "status": status_code,
            "headers": response_headers,
            "body": response_body,
        });

        StepRequestResult {
            request: request_json,
            response: response_json,
            status_code,
            duration_ms,
        }
    }

    /// Extract values from response using extractors
    pub fn extract_values(
        extractors: &[ExtractorDef],
        response_body: &str,
        status_code: i32,
        response_headers: &HashMap<String, String>,
    ) -> (Vec<ExtractorResult>, HashMap<String, String>) {
        let mut results = Vec::new();
        let mut extracted_vars = HashMap::new();

        // Try to parse response body as JSON
        let json_body: Option<serde_json::Value> = serde_json::from_str(response_body).ok();

        for extractor in extractors {
            let result = match extractor.extractor_type.as_str() {
                "json_path" => {
                    if let (Some(path), Some(json)) = (&extractor.path, &json_body) {
                        match Self::extract_json_path(json, path) {
                            Some(value) => {
                                let value_str = match &value {
                                    serde_json::Value::String(s) => s.clone(),
                                    other => other.to_string(),
                                };
                                extracted_vars.insert(extractor.variable.clone(), value_str.clone());
                                ExtractorResult {
                                    extractor: extractor.clone(),
                                    success: true,
                                    value: Some(value_str),
                                    error: None,
                                }
                            }
                            None => ExtractorResult {
                                extractor: extractor.clone(),
                                success: false,
                                value: None,
                                error: Some(format!("Path '{}' not found", path)),
                            },
                        }
                    } else {
                        ExtractorResult {
                            extractor: extractor.clone(),
                            success: false,
                            value: None,
                            error: Some("Missing path or response is not JSON".to_string()),
                        }
                    }
                }
                "header" => {
                    if let Some(name) = &extractor.name {
                        if let Some(value) = response_headers.get(&name.to_lowercase()) {
                            extracted_vars.insert(extractor.variable.clone(), value.clone());
                            ExtractorResult {
                                extractor: extractor.clone(),
                                success: true,
                                value: Some(value.clone()),
                                error: None,
                            }
                        } else {
                            ExtractorResult {
                                extractor: extractor.clone(),
                                success: false,
                                value: None,
                                error: Some(format!("Header '{}' not found", name)),
                            }
                        }
                    } else {
                        ExtractorResult {
                            extractor: extractor.clone(),
                            success: false,
                            value: None,
                            error: Some("Missing header name".to_string()),
                        }
                    }
                }
                "regex" => {
                    if let Some(pattern) = &extractor.pattern {
                        // Simple regex extraction using string matching
                        // For now, use a basic implementation
                        if let Some(captures) = Self::extract_with_pattern(response_body, pattern) {
                            extracted_vars.insert(extractor.variable.clone(), captures.clone());
                            ExtractorResult {
                                extractor: extractor.clone(),
                                success: true,
                                value: Some(captures),
                                error: None,
                            }
                        } else {
                            ExtractorResult {
                                extractor: extractor.clone(),
                                success: false,
                                value: None,
                                error: Some("Pattern not matched".to_string()),
                            }
                        }
                    } else {
                        ExtractorResult {
                            extractor: extractor.clone(),
                            success: false,
                            value: None,
                            error: Some("Missing pattern".to_string()),
                        }
                    }
                }
                "status" => {
                    let value = status_code.to_string();
                    extracted_vars.insert(extractor.variable.clone(), value.clone());
                    ExtractorResult {
                        extractor: extractor.clone(),
                        success: true,
                        value: Some(value),
                        error: None,
                    }
                }
                _ => ExtractorResult {
                    extractor: extractor.clone(),
                    success: false,
                    value: None,
                    error: Some(format!("Unknown extractor type: {}", extractor.extractor_type)),
                },
            };
            results.push(result);
        }

        (results, extracted_vars)
    }

    /// Extract value from JSON using a simple path (e.g., "$.data.token" or "data.token")
    fn extract_json_path(json: &serde_json::Value, path: &str) -> Option<serde_json::Value> {
        let path = path.trim_start_matches('$').trim_start_matches('.');
        let parts: Vec<&str> = path.split('.').collect();

        let mut current = json;
        for part in parts {
            if part.is_empty() {
                continue;
            }
            // Handle array index like "items[0]"
            if let Some(bracket_pos) = part.find('[') {
                let key = &part[..bracket_pos];
                let index_str = &part[bracket_pos + 1..part.len() - 1];
                if let Ok(index) = index_str.parse::<usize>() {
                    current = current.get(key)?.get(index)?;
                } else {
                    return None;
                }
            } else {
                current = current.get(part)?;
            }
        }
        Some(current.clone())
    }

    /// Regex extraction — supports real regex patterns with capture groups.
    /// If the pattern has a capture group, returns the first group match.
    /// Otherwise returns the full match. Falls back to literal search if
    /// the pattern is not valid regex.
    fn extract_with_pattern(text: &str, pattern: &str) -> Option<String> {
        match Regex::new(pattern) {
            Ok(re) => {
                if let Some(caps) = re.captures(text) {
                    // Prefer the first capture group if it exists
                    if caps.len() > 1 {
                        caps.get(1).map(|m| m.as_str().to_string())
                    } else {
                        caps.get(0).map(|m| m.as_str().to_string())
                    }
                } else {
                    None
                }
            }
            Err(_) => {
                // Not valid regex — fall back to literal substring search
                if let Some(start) = text.find(pattern) {
                    Some(text[start..start + pattern.len()].to_string())
                } else {
                    None
                }
            }
        }
    }

    /// Evaluate assertions against response
    pub fn evaluate_assertions(
        assertions: &[AssertionDef],
        response_body: &str,
        status_code: i32,
        response_headers: &HashMap<String, String>,
        duration_ms: i64,
    ) -> Vec<AssertionResult> {
        let mut results = Vec::new();

        // Try to parse response body as JSON
        let json_body: Option<serde_json::Value> = serde_json::from_str(response_body).ok();

        for assertion in assertions {
            let result = match assertion.assertion_type.as_str() {
                "status" => {
                    let actual = serde_json::json!(status_code);
                    let actual_clone = actual.clone();
                    Self::compare_values(&actual, &assertion.operator, assertion.expected.as_ref())
                        .map(|passed| AssertionResult {
                            assertion: assertion.clone(),
                            passed,
                            actual: Some(actual),
                            error: None,
                        })
                        .unwrap_or_else(|e| AssertionResult {
                            assertion: assertion.clone(),
                            passed: false,
                            actual: Some(actual_clone),
                            error: Some(e),
                        })
                }
                "json_path" => {
                    if let (Some(path), Some(json)) = (&assertion.path, &json_body) {
                        if let Some(actual) = Self::extract_json_path(json, path) {
                            let actual_clone = actual.clone();
                            Self::compare_values(&actual, &assertion.operator, assertion.expected.as_ref())
                                .map(|passed| AssertionResult {
                                    assertion: assertion.clone(),
                                    passed,
                                    actual: Some(actual),
                                    error: None,
                                })
                                .unwrap_or_else(|e| AssertionResult {
                                    assertion: assertion.clone(),
                                    passed: false,
                                    actual: Some(actual_clone),
                                    error: Some(e),
                                })
                        } else {
                            AssertionResult {
                                assertion: assertion.clone(),
                                passed: assertion.operator == "not_exists",
                                actual: None,
                                error: None,
                            }
                        }
                    } else {
                        AssertionResult {
                            assertion: assertion.clone(),
                            passed: false,
                            actual: None,
                            error: Some("Missing path or response is not JSON".to_string()),
                        }
                    }
                }
                "header" => {
                    if let Some(name) = &assertion.name {
                        if let Some(actual_value) = response_headers.get(&name.to_lowercase()) {
                            let actual = serde_json::json!(actual_value);
                            let actual_clone = actual.clone();
                            Self::compare_values(&actual, &assertion.operator, assertion.expected.as_ref())
                                .map(|passed| AssertionResult {
                                    assertion: assertion.clone(),
                                    passed,
                                    actual: Some(actual),
                                    error: None,
                                })
                                .unwrap_or_else(|e| AssertionResult {
                                    assertion: assertion.clone(),
                                    passed: false,
                                    actual: Some(actual_clone),
                                    error: Some(e),
                                })
                        } else {
                            AssertionResult {
                                assertion: assertion.clone(),
                                passed: assertion.operator == "not_exists",
                                actual: None,
                                error: None,
                            }
                        }
                    } else {
                        AssertionResult {
                            assertion: assertion.clone(),
                            passed: false,
                            actual: None,
                            error: Some("Missing header name".to_string()),
                        }
                    }
                }
                "response_time" => {
                    let actual = serde_json::json!(duration_ms);
                    let actual_clone = actual.clone();
                    Self::compare_values(&actual, &assertion.operator, assertion.expected.as_ref())
                        .map(|passed| AssertionResult {
                            assertion: assertion.clone(),
                            passed,
                            actual: Some(actual),
                            error: None,
                        })
                        .unwrap_or_else(|e| AssertionResult {
                            assertion: assertion.clone(),
                            passed: false,
                            actual: Some(actual_clone),
                            error: Some(e),
                        })
                }
                "body_contains" => {
                    let actual = serde_json::json!(response_body);
                    if let Some(expected) = &assertion.expected {
                        if let Some(expected_str) = expected.as_str() {
                            let passed = match assertion.operator.as_str() {
                                "contains" => response_body.contains(expected_str),
                                "not_contains" => !response_body.contains(expected_str),
                                _ => false,
                            };
                            AssertionResult {
                                assertion: assertion.clone(),
                                passed,
                                actual: Some(actual),
                                error: None,
                            }
                        } else {
                            AssertionResult {
                                assertion: assertion.clone(),
                                passed: false,
                                actual: Some(actual),
                                error: Some("Expected value must be a string".to_string()),
                            }
                        }
                    } else {
                        AssertionResult {
                            assertion: assertion.clone(),
                            passed: false,
                            actual: Some(actual),
                            error: Some("Missing expected value".to_string()),
                        }
                    }
                }
                _ => AssertionResult {
                    assertion: assertion.clone(),
                    passed: false,
                    actual: None,
                    error: Some(format!("Unknown assertion type: {}", assertion.assertion_type)),
                },
            };
            results.push(result);
        }

        results
    }

    /// Compare values using operator
    fn compare_values(
        actual: &serde_json::Value,
        operator: &str,
        expected: Option<&serde_json::Value>,
    ) -> Result<bool, String> {
        match operator {
            "equals" => {
                if let Some(expected) = expected {
                    // 直接比较
                    if actual == expected { return Ok(true) }
                    // 类型不匹配时尝试数值比较（200 == 200.0）
                    if let (Some(a), Some(e)) = (actual.as_f64(), expected.as_f64()) {
                        return Ok((a - e).abs() < f64::EPSILON)
                    }
                    // 字符串 vs 数字交叉比较（"200" == 200 或 200 == "200"）
                    let actual_str = actual.as_str().and_then(|s| s.parse::<f64>().ok());
                    let expected_str = expected.as_str().and_then(|s| s.parse::<f64>().ok());
                    if let (Some(a), Some(e)) = (actual.as_f64(), expected_str) {
                        return Ok((a - e).abs() < f64::EPSILON)
                    }
                    if let (Some(a), Some(e)) = (actual_str, expected.as_f64()) {
                        return Ok((a - e).abs() < f64::EPSILON)
                    }
                    // 字符串比较
                    if let (Some(a), Some(e)) = (actual.as_str(), expected.as_str()) {
                        return Ok(a == e)
                    }
                    Ok(false)
                } else {
                    Err("Missing expected value".to_string())
                }
            }
            "not_equals" => {
                if let Some(expected) = expected {
                    if actual == expected { return Ok(false) }
                    if let (Some(a), Some(e)) = (actual.as_f64(), expected.as_f64()) {
                        return Ok((a - e).abs() > f64::EPSILON)
                    }
                    // 字符串 vs 数字交叉比较
                    let actual_str = actual.as_str().and_then(|s| s.parse::<f64>().ok());
                    let expected_str = expected.as_str().and_then(|s| s.parse::<f64>().ok());
                    if let (Some(a), Some(e)) = (actual.as_f64(), expected_str) {
                        return Ok((a - e).abs() > f64::EPSILON)
                    }
                    if let (Some(a), Some(e)) = (actual_str, expected.as_f64()) {
                        return Ok((a - e).abs() > f64::EPSILON)
                    }
                    if let (Some(a), Some(e)) = (actual.as_str(), expected.as_str()) {
                        return Ok(a != e)
                    }
                    Ok(true)
                } else {
                    Err("Missing expected value".to_string())
                }
            }
            "exists" => Ok(true),
            "not_exists" => Ok(false),
            "contains" => {
                if let Some(expected) = expected {
                    let actual_str = Self::value_as_display_string(actual);
                    let expected_str = Self::value_as_display_string(expected);
                    Ok(actual_str.contains(&expected_str))
                } else {
                    Err("Missing expected value".to_string())
                }
            }
            "not_contains" => {
                if let Some(expected) = expected {
                    let actual_str = Self::value_as_display_string(actual);
                    let expected_str = Self::value_as_display_string(expected);
                    Ok(!actual_str.contains(&expected_str))
                } else {
                    Err("Missing expected value".to_string())
                }
            }
            "greater_than" => {
                if let Some(expected) = expected {
                    let actual_f64 = actual.as_f64().or_else(|| {
                        actual.as_str().and_then(|s| s.parse::<f64>().ok())
                    });
                    let expected_f64 = expected.as_f64().or_else(|| {
                        expected.as_str().and_then(|s| s.parse::<f64>().ok())
                    });
                    match (actual_f64, expected_f64) {
                        (Some(a), Some(e)) => Ok(a > e),
                        _ => Err("Values must be numbers for greater_than".to_string()),
                    }
                } else {
                    Err("Missing expected value".to_string())
                }
            }
            "less_than" => {
                if let Some(expected) = expected {
                    let actual_f64 = actual.as_f64().or_else(|| {
                        actual.as_str().and_then(|s| s.parse::<f64>().ok())
                    });
                    let expected_f64 = expected.as_f64().or_else(|| {
                        expected.as_str().and_then(|s| s.parse::<f64>().ok())
                    });
                    match (actual_f64, expected_f64) {
                        (Some(a), Some(e)) => Ok(a < e),
                        _ => Err("Values must be numbers for less_than".to_string()),
                    }
                } else {
                    Err("Missing expected value".to_string())
                }
            }
            _ => Err(format!("Unknown operator: {}", operator)),
        }
    }

    /// Convert any serde_json::Value to a display string for contains/not_contains
    fn value_as_display_string(v: &serde_json::Value) -> String {
        if v.is_string() { return v.as_str().unwrap().to_string() }
        if v.is_number() { return v.as_f64().unwrap().to_string() }
        if v.is_boolean() { return v.as_bool().unwrap().to_string() }
        if v.is_null() { return "null".to_string() }
        String::new()
    }
}

/// Send an HTTP request using reqwest and return { request, response } as JSON
pub async fn send_http_request(payload: &RunRequestPayload) -> Result<serde_json::Value, String> {
    let method = payload.method.to_uppercase();
    let url = &payload.url;
    let start = Instant::now();

    // Validate URL before building the client
    if url.is_empty() {
        return Err(format!(
            "请求 URL 为空。请检查接口是否设置了 path，以及是否选择了执行环境（环境提供 baseUrl）。\n\
            当前请求详情：\n  Method: {}\n  Headers: {:?}\n  Body: {}",
            method,
            payload.headers.iter().map(|h| format!("{}={}", h.name, h.value)).collect::<Vec<_>>(),
            if payload.body.is_empty() { "(空)".to_string() } else { payload.body.clone() },
        ));
    }

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(payload.insecure_skip_verify)
        .build()
        .map_err(|e| format!(
            "HTTP 客户端构建失败: {}\n请求 URL: {}\nMethod: {}",
            e, url, method
        ))?;

    let mut req = match method.as_str() {
        "POST" => client.post(url),
        "PUT" => client.put(url),
        "PATCH" => client.patch(url),
        "DELETE" => client.delete(url),
        "OPTIONS" => client.request(reqwest::Method::OPTIONS, url),
        "HEAD" => client.head(url),
        _ => client.get(url),
    };

    for h in &payload.headers {
        if !h.name.is_empty() {
            req = req.header(&h.name, &h.value);
        }
    }

    if let Some(ct) = &payload.content_type {
        if !payload.headers.iter().any(|h| h.name.to_lowercase() == "content-type") {
            req = req.header("Content-Type", ct.as_str());
        }
    }

    if !payload.body.is_empty() && method != "GET" && method != "HEAD" {
        req = req.body(payload.body.clone());
    }

    let response = req.send().await.map_err(|e| {
        let detail = format!(
            "\n请求详情：\n  URL: {}\n  Method: {}\n  Headers: {:?}\n  Body: {}",
            url, method,
            payload.headers.iter().map(|h| format!("{}: {}", h.name, h.value)).collect::<Vec<_>>(),
            if payload.body.is_empty() { "(空)" } else { &payload.body },
        );
        if e.is_timeout() {
            format!("请求超时，请检查网络连接或增加超时时间{}", detail)
        } else if e.is_connect() {
            format!("无法连接到服务器: {}{}", url, detail)
        } else {
            format!("请求发送失败: {}{}", e, detail)
        }
    })?;

    let status_code = response.status().as_u16() as i32;
    let duration_ms = start.elapsed().as_millis() as i64;

    // Response headers as key-value map（key 统一小写，HTTP headers 大小写不敏感）
    let response_headers: std::collections::HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string().to_lowercase(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let response_body = response.text().await.unwrap_or_default();

    // Build request JSON (headers as [{name, value}] for PmContext compatibility)
    let request_headers: Vec<serde_json::Value> = payload.headers.iter()
        .map(|h| serde_json::json!({ "name": h.name, "value": h.value }))
        .collect();

    Ok(serde_json::json!({
        "request": {
            "url": payload.url,
            "method": payload.method,
            "headers": request_headers,
            "body": payload.body,
        },
        "response": {
            "status": status_code,
            "statusText": if status_code < 400 { "OK" } else { "Error" },
            "headers": response_headers,
            "body": response_body,
            "responseTime": duration_ms,
        },
    }))
}

/// Orchestrate full test task execution: run all enabled steps sequentially,
/// apply extractors and assertions, persist results, and return a summary.
pub async fn execute_task_full(
    db: &Db,
    task_id: &str,
    project_id: &str,
    initial_variables: HashMap<String, String>,
    base_url: Option<&str>,
    fail_fast: bool,
) -> Result<serde_json::Value, String> {
    // 1. Get enabled test steps
    let steps = test_repo::list_steps(db, task_id)
        .map_err(|e| format!("Failed to list steps: {}", e))?;
    let enabled_steps: Vec<_> = steps.into_iter().filter(|s| s.enabled).collect();

    // 2. Create execution record
    let execution = test_repo::create_execution(db, task_id, None)
        .map_err(|e| format!("Failed to create execution: {}", e))?;
    let execution_id = execution.id;
    let start_time = Instant::now();

    // 3. Get all menu items for the project
    let menu_items = menu_repo::list_menu_items(db, project_id)
        .map_err(|e| format!("Failed to list menu items: {}", e))?;

    let mut variables = initial_variables;
    let mut passed_count: i32 = 0;
    let mut failed_count: i32 = 0;
    let mut skipped_count: i32 = 0;

    // 5. Loop through steps sequentially
    for (index, step) in enabled_steps.iter().enumerate() {
        let step_start = Instant::now();

        // a. Find matching menu_item for the step
        let menu_item = menu_items.iter().find(|item| item.id == step.menu_item_id);
        let menu_item = match menu_item {
            Some(item) => item,
            None => {
                let result = TestStepResult {
                    id: uuid::Uuid::new_v4().to_string(),
                    execution_id: execution_id.clone(),
                    step_id: step.id.clone(),
                    sort_order: step.sort_order,
                    status: "error".to_string(),
                    request_json: None,
                    response_json: None,
                    script_results_json: None,
                    variable_deltas_json: None,
                    duration_ms: step_start.elapsed().as_millis() as i64,
                    error_message: Some(format!("Menu item not found: {}", step.menu_item_id)),
                    executed_at: chrono::Utc::now().to_rfc3339(),
                };
                let _ = test_repo::create_step_result(db, &result);
                failed_count += 1;

                // h. If fail_fast and step failed/errored: mark remaining steps as "skipped"
                if fail_fast {
                    for remaining in &enabled_steps[index + 1..] {
                        let skip_result = TestStepResult {
                            id: uuid::Uuid::new_v4().to_string(),
                            execution_id: execution_id.clone(),
                            step_id: remaining.id.clone(),
                            sort_order: remaining.sort_order,
                            status: "skipped".to_string(),
                            request_json: None,
                            response_json: None,
                            script_results_json: None,
                            variable_deltas_json: None,
                            duration_ms: 0,
                            error_message: None,
                            executed_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let _ = test_repo::create_step_result(db, &skip_result);
                        skipped_count += 1;
                    }
                    break;
                }
                continue;
            }
        };

        // b. Build request payload
        let request_payload = match TestEngine::build_request_payload(
            menu_item,
            step.request_override_json.as_ref(),
            &variables,
            base_url,
        ) {
            Ok(p) => p,
            Err(e) => {
                let result = TestStepResult {
                    id: uuid::Uuid::new_v4().to_string(),
                    execution_id: execution_id.clone(),
                    step_id: step.id.clone(),
                    sort_order: step.sort_order,
                    status: "error".to_string(),
                    request_json: None,
                    response_json: None,
                    script_results_json: None,
                    variable_deltas_json: None,
                    duration_ms: step_start.elapsed().as_millis() as i64,
                    error_message: Some(format!("Failed to build request: {}", e)),
                    executed_at: chrono::Utc::now().to_rfc3339(),
                };
                let _ = test_repo::create_step_result(db, &result);
                failed_count += 1;

                if fail_fast {
                    for remaining in &enabled_steps[index + 1..] {
                        let skip_result = TestStepResult {
                            id: uuid::Uuid::new_v4().to_string(),
                            execution_id: execution_id.clone(),
                            step_id: remaining.id.clone(),
                            sort_order: remaining.sort_order,
                            status: "skipped".to_string(),
                            request_json: None,
                            response_json: None,
                            script_results_json: None,
                            variable_deltas_json: None,
                            duration_ms: 0,
                            error_message: None,
                            executed_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let _ = test_repo::create_step_result(db, &skip_result);
                        skipped_count += 1;
                    }
                    break;
                }
                continue;
            }
        };

        // c. Send HTTP request
        let request_result = match send_http_request(&request_payload).await {
            Ok(val) => val,
            Err(e) => {
                let result = TestStepResult {
                    id: uuid::Uuid::new_v4().to_string(),
                    execution_id: execution_id.clone(),
                    step_id: step.id.clone(),
                    sort_order: step.sort_order,
                    status: "error".to_string(),
                    request_json: Some(serde_json::json!({
                        "url": request_payload.url,
                        "method": request_payload.method,
                        "headers": request_payload.headers.iter().map(|h| {
                            serde_json::json!({"name": h.name, "value": h.value})
                        }).collect::<Vec<_>>(),
                        "body": request_payload.body,
                    })),
                    response_json: None,
                    script_results_json: None,
                    variable_deltas_json: None,
                    duration_ms: step_start.elapsed().as_millis() as i64,
                    error_message: Some(e),
                    executed_at: chrono::Utc::now().to_rfc3339(),
                };
                let _ = test_repo::create_step_result(db, &result);
                failed_count += 1;

                if fail_fast {
                    for remaining in &enabled_steps[index + 1..] {
                        let skip_result = TestStepResult {
                            id: uuid::Uuid::new_v4().to_string(),
                            execution_id: execution_id.clone(),
                            step_id: remaining.id.clone(),
                            sort_order: remaining.sort_order,
                            status: "skipped".to_string(),
                            request_json: None,
                            response_json: None,
                            script_results_json: None,
                            variable_deltas_json: None,
                            duration_ms: 0,
                            error_message: None,
                            executed_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let _ = test_repo::create_step_result(db, &skip_result);
                        skipped_count += 1;
                    }
                    break;
                }
                continue;
            }
        };

        let request_json = request_result.get("request").cloned();
        let response_json = request_result.get("response").cloned();

        let status_code = response_json.as_ref()
            .and_then(|r| r.get("status"))
            .and_then(|s| s.as_i64())
            .unwrap_or(0) as i32;

        let response_body = response_json.as_ref()
            .and_then(|r| r.get("body"))
            .and_then(|b| b.as_str())
            .unwrap_or("")
            .to_string();

        let response_headers: HashMap<String, String> = response_json.as_ref()
            .and_then(|r| r.get("headers"))
            .and_then(|h| h.as_object())
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.to_lowercase(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default();

        let duration_ms = response_json.as_ref()
            .and_then(|r| r.get("responseTime"))
            .and_then(|t| t.as_i64())
            .unwrap_or_else(|| step_start.elapsed().as_millis() as i64);

        // d. Extractors
        let mut variable_deltas = HashMap::new();
        if let Some(extractors_json) = &step.extractors_json {
            if let Ok(extractors) = serde_json::from_value::<Vec<ExtractorDef>>(extractors_json.clone()) {
                if !extractors.is_empty() {
                    let (_results, extracted_vars) = TestEngine::extract_values(
                        &extractors,
                        &response_body,
                        status_code,
                        &response_headers,
                    );
                    for (k, v) in extracted_vars {
                        variables.insert(k.clone(), v.clone());
                        variable_deltas.insert(k, v);
                    }
                }
            }
        }

        // e. Assertions
        let mut all_assertions_passed = true;
        if let Some(assertions_json) = &step.assertions_json {
            if let Ok(assertions) = serde_json::from_value::<Vec<AssertionDef>>(assertions_json.clone()) {
                if !assertions.is_empty() {
                    let assertion_results = TestEngine::evaluate_assertions(
                        &assertions,
                        &response_body,
                        status_code,
                        &response_headers,
                        duration_ms,
                    );
                    all_assertions_passed = assertion_results.iter().all(|r| r.passed);
                }
            }
        }

        // f. Determine step status
        let step_status = if !all_assertions_passed {
            "failed"
        } else {
            "passed"
        };

        if step_status == "passed" {
            passed_count += 1;
        } else {
            failed_count += 1;
        }

        // g. Create step_result record
        let variable_deltas_json = if variable_deltas.is_empty() {
            None
        } else {
            Some(serde_json::to_value(&variable_deltas).unwrap_or(serde_json::json!({})))
        };

        let result = TestStepResult {
            id: uuid::Uuid::new_v4().to_string(),
            execution_id: execution_id.clone(),
            step_id: step.id.clone(),
            sort_order: step.sort_order,
            status: step_status.to_string(),
            request_json,
            response_json,
            script_results_json: None,
            variable_deltas_json,
            duration_ms,
            error_message: None,
            executed_at: chrono::Utc::now().to_rfc3339(),
        };
        let _ = test_repo::create_step_result(db, &result);

        // h. If fail_fast and step failed: mark remaining as skipped
        if step_status == "failed" && fail_fast {
            for remaining in &enabled_steps[index + 1..] {
                let skip_result = TestStepResult {
                    id: uuid::Uuid::new_v4().to_string(),
                    execution_id: execution_id.clone(),
                    step_id: remaining.id.clone(),
                    sort_order: remaining.sort_order,
                    status: "skipped".to_string(),
                    request_json: None,
                    response_json: None,
                    script_results_json: None,
                    variable_deltas_json: None,
                    duration_ms: 0,
                    error_message: None,
                    executed_at: chrono::Utc::now().to_rfc3339(),
                };
                let _ = test_repo::create_step_result(db, &skip_result);
                skipped_count += 1;
            }
            break;
        }
    }

    // 6. Finish the execution record
    let total_duration = start_time.elapsed().as_millis() as i64;
    let final_status = if failed_count > 0 { "failed" } else { "passed" };

    let _ = test_repo::finish_execution(
        db,
        &execution_id,
        final_status,
        passed_count,
        failed_count,
        skipped_count,
        total_duration,
    );

    // 7. Return JSON summary
    Ok(serde_json::json!({
        "executionId": execution_id,
        "status": final_status,
        "totalSteps": enabled_steps.len(),
        "passedSteps": passed_count,
        "failedSteps": failed_count,
        "skippedSteps": skipped_count,
        "durationMs": total_duration,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpolate_variables() {
        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "world".to_string());
        vars.insert("id".to_string(), "123".to_string());

        let result = TestEngine::interpolate_variables("Hello {{name}}, id={{id}}", &vars);
        assert_eq!(result, "Hello world, id=123");
    }

    #[test]
    fn test_interpolate_json() {
        let mut vars = HashMap::new();
        vars.insert("token".to_string(), "abc123".to_string());

        let json = serde_json::json!({
            "Authorization": "Bearer {{token}}",
            "data": {
                "id": "{{token}}"
            }
        });

        let result = TestEngine::interpolate_json(&json, &vars);
        assert_eq!(result["Authorization"], "Bearer abc123");
        assert_eq!(result["data"]["id"], "abc123");
    }

    #[test]
    fn test_build_request_payload() {
        let menu_item = ApiMenuData {
            id: "test".to_string(),
            parent_id: None,
            name: "Test API".to_string(),
            menu_type: "api".to_string(),
            data_json: Some(serde_json::json!({
                "method": "GET",
                "path": "/users/{{userId}}",
                "parameters": {
                    "header": [
                        {"name": "Authorization", "value": "Bearer {{token}}"}
                    ]
                }
            })),
            run_tab_json: None,
            sort_order: 0,
            created_at: "2024-01-01".to_string(),
            updated_at: "2024-01-01".to_string(),
        };

        let mut vars = HashMap::new();
        vars.insert("userId".to_string(), "123".to_string());
        vars.insert("token".to_string(), "mytoken".to_string());

        let result = TestEngine::build_request_payload(&menu_item, None, &vars, Some("https://api.example.com")).unwrap();
        assert_eq!(result.url, "https://api.example.com/users/123");
        assert_eq!(result.method, "GET");
        assert_eq!(result.headers[0].value, "Bearer mytoken");
    }

    #[test]
    fn test_interpolate_dynamic_variables() {
        let vars = HashMap::new();

        // 时间戳类
        let ts = TestEngine::interpolate_variables("t={{$timestamp}}", &vars);
        let ts_val = ts.trim_start_matches("t=");
        assert!(ts_val.parse::<i64>().is_ok(), "timestamp should be numeric: {}", ts);

        // GUID 格式
        let guid = TestEngine::interpolate_variables("{{$guid}}", &vars);
        assert_eq!(guid.split('-').count(), 5, "guid should have hyphens: {}", guid);

        // 随机 UUID 无横线
        let uuid = TestEngine::interpolate_variables("{{$randomUUID}}", &vars);
        assert_eq!(uuid.len(), 32, "randomUUID should be 32 chars: {}", uuid);

        // 随机数字
        let ri = TestEngine::interpolate_variables("{{$randomInt}}", &vars);
        assert!(ri.parse::<u32>().is_ok());

        // 随机手机号 11 位
        let mobile = TestEngine::interpolate_variables("{{$randomMobile}}", &vars);
        assert_eq!(mobile.len(), 11, "mobile should be 11 digits: {}", mobile);

        // 邮箱格式
        let email = TestEngine::interpolate_variables("{{$randomEmail}}", &vars);
        assert!(email.ends_with("@example.com"), "email: {}", email);

        // 用户变量与动态变量共存
        let mut vars2 = HashMap::new();
        vars2.insert("name".to_string(), "alice".to_string());
        let out = TestEngine::interpolate_variables("user={{name}}&ts={{$timestamp}}", &vars2);
        assert!(out.starts_with("user=alice&ts="));
        assert!(out.len() > "user=alice&ts=".len());

        // 未知动态变量原样保留
        let unknown = TestEngine::interpolate_variables("{{$noSuchVar}}", &vars);
        assert_eq!(unknown, "{{$noSuchVar}}");

        // 环境变量读取（$processEnv:KEY）
        std::env::set_var("APIMOCKTLE_TEST_ENV", "hello");
        let env = TestEngine::interpolate_variables("{{$processEnv:APIMOCKTLE_TEST_ENV}}", &vars);
        assert_eq!(env, "hello");
    }

    #[test]
    fn test_interpolate_dynamic_variables_repeat() {
        // 每次出现独立求值（两次值可以不同，但至少都能解析为数字）
        let vars = HashMap::new();
        let out = TestEngine::interpolate_variables("{{$randomInt}}-{{$randomInt}}", &vars);
        let parts: Vec<&str> = out.split('-').collect();
        assert_eq!(parts.len(), 2);
        assert!(parts[0].parse::<u32>().is_ok());
        assert!(parts[1].parse::<u32>().is_ok());
    }
}
