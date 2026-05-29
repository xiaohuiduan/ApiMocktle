use std::collections::HashMap;
use serde::{Deserialize, Serialize};

use crate::errors::AppError;
use crate::models::*;

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
    /// Variable template replacement: replace {{varName}} with actual values
    pub fn interpolate_variables(template: &str, variables: &HashMap<String, String>) -> String {
        let mut result = template.to_string();
        for (key, value) in variables {
            let placeholder = format!("{{{{{}}}}}", key);
            result = result.replace(&placeholder, value);
        }
        result
    }

    /// Interpolate a JSON value recursively
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
                        // Replace if exists, otherwise push
                        if let Some(existing) = headers.iter_mut().find(|x| x.name == name) {
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
        })
    }

    /// Build step request result from response
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
                        if let Some(value) = response_headers.get(name) {
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

    /// Simple pattern extraction (supports basic capture groups)
    fn extract_with_pattern(text: &str, pattern: &str) -> Option<String> {
        // For simplicity, just check if the pattern exists and return the matched part
        // In a real implementation, we'd use a regex crate
        if let Some(start) = text.find(pattern) {
            Some(text[start..start + pattern.len()].to_string())
        } else {
            // Try to handle simple capture patterns like "token=(.+?)"
            // For now, just return None for complex patterns
            None
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
                        if let Some(actual_value) = response_headers.get(name) {
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
                    Ok(actual == expected)
                } else {
                    Err("Missing expected value".to_string())
                }
            }
            "not_equals" => {
                if let Some(expected) = expected {
                    Ok(actual != expected)
                } else {
                    Err("Missing expected value".to_string())
                }
            }
            "exists" => Ok(true),
            "not_exists" => Ok(false),
            "contains" => {
                if let (Some(actual_str), Some(expected_str)) = (actual.as_str(), expected.and_then(|e| e.as_str())) {
                    Ok(actual_str.contains(expected_str))
                } else {
                    Err("Both actual and expected must be strings for contains".to_string())
                }
            }
            "not_contains" => {
                if let (Some(actual_str), Some(expected_str)) = (actual.as_str(), expected.and_then(|e| e.as_str())) {
                    Ok(!actual_str.contains(expected_str))
                } else {
                    Err("Both actual and expected must be strings for not_contains".to_string())
                }
            }
            "greater_than" => {
                if let Some(expected) = expected {
                    match (actual.as_f64(), expected.as_f64()) {
                        (Some(a), Some(e)) => Ok(a > e),
                        _ => Err("Values must be numbers for greater_than".to_string()),
                    }
                } else {
                    Err("Missing expected value".to_string())
                }
            }
            "less_than" => {
                if let Some(expected) = expected {
                    match (actual.as_f64(), expected.as_f64()) {
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
                "url": "https://api.example.com/users/{{userId}}",
                "headerParams": [
                    {"name": "Authorization", "value": "Bearer {{token}}"}
                ]
            })),
            run_tab_json: None,
            sort_order: 0,
            created_at: "2024-01-01".to_string(),
            updated_at: "2024-01-01".to_string(),
        };

        let mut vars = HashMap::new();
        vars.insert("userId".to_string(), "123".to_string());
        vars.insert("token".to_string(), "mytoken".to_string());

        let result = TestEngine::build_request_payload(&menu_item, None, &vars).unwrap();
        assert_eq!(result.url, "https://api.example.com/users/123");
        assert_eq!(result.method, "GET");
        assert_eq!(result.headers[0].value, "Bearer mytoken");
    }
}
