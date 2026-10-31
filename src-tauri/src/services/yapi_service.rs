use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct YApiInterface {
    #[serde(rename = "_id", default)]
    pub id: Option<String>,
    #[serde(default)]
    pub catid: Option<String>,
    pub title: String,
    pub path: String,
    pub method: String,
    #[serde(default)]
    pub desc: Option<String>,
    #[serde(default)]
    pub markdown: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub tag: Option<Vec<String>>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(rename = "req_headers", default)]
    pub req_headers: Option<Vec<YApiHeader>>,
    #[serde(rename = "req_query", default)]
    pub req_query: Option<Vec<YApiParam>>,
    #[serde(rename = "req_params", default)]
    pub req_params: Option<Vec<YApiParam>>,
    #[serde(rename = "req_body_type", default)]
    pub req_body_type: Option<String>,
    #[serde(rename = "req_body_form", default)]
    pub req_body_form: Option<Vec<YApiFormParam>>,
    #[serde(rename = "req_body_other", default)]
    pub req_body_other: Option<String>,
    #[serde(rename = "req_body_is_json_schema", default)]
    pub req_body_is_json_schema: Option<bool>,
    #[serde(rename = "res_body_type", default)]
    pub res_body_type: Option<String>,
    #[serde(rename = "res_body", default)]
    pub res_body: Option<String>,
    #[serde(rename = "res_body_is_json_schema", default)]
    pub res_body_is_json_schema: Option<bool>,
    // 以下均为可选字段：老 payload 不带这些键时行为与改造前完全一致
    #[serde(default)]
    pub responses: Option<Vec<YApiResponse>>,
    #[serde(rename = "req_body_required", default)]
    pub req_body_required: Option<bool>,
    #[serde(rename = "req_body_examples", default)]
    pub req_body_examples: Option<Vec<YApiExample>>,
    #[serde(rename = "operationId", default)]
    pub operation_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct YApiResponse {
    #[serde(default)]
    pub code: Option<i64>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "contentType", default)]
    pub content_type: Option<String>,
    #[serde(rename = "jsonSchema", default)]
    pub json_schema: Option<Value>,
    #[serde(default)]
    pub example: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct YApiExample {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub value: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct YApiHeader {
    pub name: String,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub desc: Option<String>,
    #[serde(default)]
    pub example: Option<String>,
    #[serde(default)]
    pub required: Option<Value>, // "1" or 1
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct YApiParam {
    pub name: String,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub desc: Option<String>,
    #[serde(default)]
    pub example: Option<String>,
    #[serde(default)]
    pub required: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct YApiFormParam {
    pub name: String,
    #[serde(rename = "type", default)]
    pub param_type: Option<String>,
    #[serde(default)]
    pub desc: Option<String>,
    #[serde(default)]
    pub example: Option<String>,
    #[serde(default)]
    pub required: Option<Value>,
}

fn short_id() -> String {
    Uuid::new_v4().to_string()[..8].to_string()
}

fn is_required(val: &Option<Value>) -> bool {
    match val {
        Some(Value::String(s)) => s == "1",
        Some(Value::Number(n)) => n.as_i64() == Some(1),
        _ => false,
    }
}

fn map_status(yapi_status: Option<&str>) -> String {
    match yapi_status {
        Some("done") => "released".to_string(),
        Some("designing") => "designing".to_string(),
        _ => "developing".to_string(),
    }
}

fn map_method(yapi_method: &str) -> String {
    yapi_method.to_uppercase()
}

fn map_param_type(yapi_type: Option<&str>) -> String {
    match yapi_type {
        Some("integer") => "integer".to_string(),
        Some("number") => "number".to_string(),
        Some("boolean") => "boolean".to_string(),
        _ => "string".to_string(),
    }
}

fn convert_headers(headers: &Option<Vec<YApiHeader>>) -> Option<Value> {
    let headers = headers.as_ref()?;
    if headers.is_empty() {
        return None;
    }
    Some(Value::Array(
        headers
            .iter()
            .map(|h| {
                serde_json::json!({
                    "id": short_id(),
                    "name": h.name,
                    "description": h.desc,
                    "example": h.example.as_ref().or(h.value.as_ref()),
                    "required": is_required(&h.required),
                    "enable": true,
                    "type": "string",
                })
            })
            .collect(),
    ))
}

fn convert_query_params(params: &Option<Vec<YApiParam>>) -> Option<Value> {
    let params = params.as_ref()?;
    if params.is_empty() {
        return None;
    }
    Some(Value::Array(
        params
            .iter()
            .map(|p| {
                serde_json::json!({
                    "id": short_id(),
                    "name": p.name,
                    "description": p.desc,
                    "example": p.example.as_ref().or(p.value.as_ref()),
                    "required": is_required(&p.required),
                    "enable": true,
                    "type": "string",
                })
            })
            .collect(),
    ))
}

fn convert_path_params(params: &Option<Vec<YApiParam>>) -> Option<Value> {
    let params = params.as_ref()?;
    if params.is_empty() {
        return None;
    }
    Some(Value::Array(
        params
            .iter()
            .map(|p| {
                serde_json::json!({
                    "id": short_id(),
                    "name": p.name,
                    "description": p.desc,
                    "example": p.example,
                    "required": true,
                    "enable": true,
                    "type": "string",
                })
            })
            .collect(),
    ))
}

fn convert_form_params(params: &Option<Vec<YApiFormParam>>) -> Option<Value> {
    let params = params.as_ref()?;
    if params.is_empty() {
        return None;
    }
    Some(Value::Array(
        params
            .iter()
            .map(|p| {
                serde_json::json!({
                    "id": short_id(),
                    "name": p.name,
                    "description": p.desc,
                    "example": p.example,
                    "required": is_required(&p.required),
                    "enable": true,
                    "type": map_param_type(p.param_type.as_deref()),
                })
            })
            .collect(),
    ))
}

fn parse_json_schema_safe(json_str: &Option<String>) -> Option<Value> {
    let json_str = json_str.as_ref()?;
    serde_json::from_str::<Value>(json_str).ok()
}

fn convert_request_body(yapi: &YApiInterface) -> Option<Value> {
    let body_type = yapi.req_body_type.as_deref().unwrap_or("");

    if body_type.is_empty() || body_type == "none" {
        return Some(serde_json::json!({"type": "none"}));
    }

    let mut body = if body_type == "json" {
        let json_schema = if yapi.req_body_is_json_schema.unwrap_or(false) {
            parse_json_schema_safe(&yapi.req_body_other)
        } else {
            None
        };
        serde_json::json!({
            "type": "application/json",
            "jsonSchema": json_schema,
            "rawText": yapi.req_body_other,
        })
    } else if body_type == "form" {
        serde_json::json!({
            "type": "multipart/form-data",
            "parameters": convert_form_params(&yapi.req_body_form),
        })
    } else if body_type == "raw" {
        serde_json::json!({
            "type": "text/plain",
            "rawText": yapi.req_body_other,
        })
    } else {
        serde_json::json!({"type": "none"})
    };

    // 仅当 payload 显式提供时才写这两个键，避免污染老数据
    if let Some(obj) = body.as_object_mut() {
        if let Some(required) = yapi.req_body_required {
            obj.insert("required".to_string(), Value::Bool(required));
        }
        if let Some(examples) = &yapi.req_body_examples {
            let items: Vec<Value> = examples
                .iter()
                .map(|e| serde_json::json!({"name": e.name, "value": e.value}))
                .collect();
            obj.insert("examples".to_string(), Value::Array(items));
        }
    }

    Some(body)
}

fn convert_response_object(res: &YApiResponse) -> Value {
    let mut obj = serde_json::Map::new();
    obj.insert("id".to_string(), Value::String(short_id()));
    obj.insert(
        "code".to_string(),
        serde_json::json!(res.code.unwrap_or(200)),
    );
    obj.insert(
        "name".to_string(),
        serde_json::json!(res.name.clone().unwrap_or_else(|| "成功".to_string())),
    );
    obj.insert(
        "contentType".to_string(),
        serde_json::json!(res
            .content_type
            .clone()
            .unwrap_or_else(|| "json".to_string())),
    );
    if let Some(description) = &res.description {
        obj.insert("description".to_string(), serde_json::json!(description));
    }
    if let Some(json_schema) = &res.json_schema {
        obj.insert("jsonSchema".to_string(), json_schema.clone());
    }
    if let Some(example) = &res.example {
        obj.insert("example".to_string(), example.clone());
    }
    Value::Object(obj)
}

fn convert_responses(yapi: &YApiInterface) -> Option<Value> {
    // 多响应优先；未提供或为空时回退到既有单 res_body 逻辑
    if let Some(responses) = &yapi.responses {
        if !responses.is_empty() {
            return Some(Value::Array(
                responses.iter().map(convert_response_object).collect(),
            ));
        }
    }

    if yapi.res_body.is_none() {
        return None;
    }

    let json_schema = if yapi.res_body_is_json_schema.unwrap_or(false) {
        parse_json_schema_safe(&yapi.res_body)
    } else {
        None
    };

    let content_type = if yapi.res_body_type.as_deref() == Some("json") {
        "json"
    } else {
        "raw"
    };

    Some(Value::Array(vec![serde_json::json!({
        "id": short_id(),
        "code": 200,
        "name": "成功",
        "contentType": content_type,
        "jsonSchema": json_schema,
    })]))
}

pub fn yapi_to_api_details(yapi: &YApiInterface) -> Value {
    let mut parameters = serde_json::Map::new();

    if let Some(headers) = convert_headers(&yapi.req_headers) {
        parameters.insert("header".to_string(), headers);
    }
    if let Some(query) = convert_query_params(&yapi.req_query) {
        parameters.insert("query".to_string(), query);
    }
    if let Some(path) = convert_path_params(&yapi.req_params) {
        parameters.insert("path".to_string(), path);
    }

    let now = chrono::Utc::now().to_rfc3339();

    let mut details = serde_json::json!({
        "id": short_id(),
        "method": map_method(&yapi.method),
        "path": yapi.path,
        "name": yapi.title,
        "status": map_status(yapi.status.as_deref()),
        "description": yapi.markdown.as_ref().or(yapi.desc.as_ref()),
        "tags": yapi.tags.as_ref().or(yapi.tag.as_ref()),
        "parameters": if parameters.is_empty() { Value::Null } else { Value::Object(parameters) },
        "requestBody": convert_request_body(yapi),
        "responses": convert_responses(yapi),
        "operationId": yapi.operation_id,
        "createdAt": now,
        "updatedAt": now,
    });

    // Clean up null fields
    if let Some(obj) = details.as_object_mut() {
        obj.retain(|_, v| !v.is_null());
    }

    details
}

pub fn api_details_to_yapi(details: &Value, menu_item_id: &str, menu_name: &str) -> Value {
    let method = details
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("GET")
        .to_string();
    let path = details
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let desc = details
        .get("description")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let status = details.get("status").and_then(|v| v.as_str());
    let tags = details.get("tags");

    let yapi_status = match status {
        Some("released") => Some("done".to_string()),
        Some("designing") => Some("designing".to_string()),
        _ => Some("undone".to_string()),
    };

    let mut result = serde_json::json!({
        "_id": menu_item_id,
        "title": menu_name,
        "path": path,
        "method": method,
        "desc": desc,
        "markdown": desc,
        "status": yapi_status,
        "tag": tags,
    });

    if let Some(operation_id) = details.get("operationId").and_then(|v| v.as_str()) {
        result["operationId"] = Value::String(operation_id.to_string());
    }

    // Convert parameters
    if let Some(params) = details.get("parameters") {
        if let Some(headers) = params.get("header").and_then(|v| v.as_array()) {
            let yapi_headers: Vec<Value> = headers
                .iter()
                .map(|h| {
                    serde_json::json!({
                        "name": h.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                        "value": h.get("example").and_then(|v| {
                            if v.is_array() { v.get(0).and_then(|x| x.as_str()).map(|s| s.to_string()) }
                            else { v.as_str().map(|s| s.to_string()) }
                        }),
                        "desc": h.get("description").and_then(|v| v.as_str()),
                        "required": if h.get("required").and_then(|v| v.as_bool()).unwrap_or(false) { "1" } else { "0" },
                    })
                })
                .collect();
            result["req_headers"] = Value::Array(yapi_headers);
        }

        if let Some(query) = params.get("query").and_then(|v| v.as_array()) {
            let yapi_query: Vec<Value> = query
                .iter()
                .map(|q| {
                    serde_json::json!({
                        "name": q.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                        "desc": q.get("description").and_then(|v| v.as_str()),
                        "example": q.get("example").and_then(|v| {
                            if v.is_array() { v.get(0).and_then(|x| x.as_str()).map(|s| s.to_string()) }
                            else { v.as_str().map(|s| s.to_string()) }
                        }),
                        "required": if q.get("required").and_then(|v| v.as_bool()).unwrap_or(false) { "1" } else { "0" },
                    })
                })
                .collect();
            result["req_query"] = Value::Array(yapi_query);
        }

        if let Some(path_params) = params.get("path").and_then(|v| v.as_array()) {
            let yapi_path: Vec<Value> = path_params
                .iter()
                .map(|p| {
                    serde_json::json!({
                        "name": p.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                        "desc": p.get("description").and_then(|v| v.as_str()),
                        "example": p.get("example").and_then(|v| {
                            if v.is_array() { v.get(0).and_then(|x| x.as_str()).map(|s| s.to_string()) }
                            else { v.as_str().map(|s| s.to_string()) }
                        }),
                    })
                })
                .collect();
            result["req_params"] = Value::Array(yapi_path);
        }
    }

    if let Some(req_body) = details.get("requestBody") {
        let body_type = req_body.get("type").and_then(|v| v.as_str()).unwrap_or("");

        if let Some(required) = req_body.get("required").and_then(|v| v.as_bool()) {
            result["req_body_required"] = Value::Bool(required);
        }
        if let Some(examples) = req_body.get("examples").and_then(|v| v.as_array()) {
            let yapi_examples: Vec<Value> = examples
                .iter()
                .map(|e| {
                    serde_json::json!({
                        "name": e.get("name").and_then(|v| v.as_str()),
                        "value": e.get("value"),
                    })
                })
                .collect();
            result["req_body_examples"] = Value::Array(yapi_examples);
        }

        if body_type.contains("json") {
            result["req_body_type"] = Value::String("json".to_string());
            result["req_body_is_json_schema"] = Value::Bool(true);
            if let Some(raw) = req_body.get("rawText").and_then(|v| v.as_str()) {
                result["req_body_other"] = Value::String(raw.to_string());
            } else if let Some(schema) = req_body.get("jsonSchema") {
                result["req_body_other"] = Value::String(schema.to_string());
            }
        } else if body_type.contains("form") {
            result["req_body_type"] = Value::String("form".to_string());
            if let Some(form_params) = req_body.get("parameters").and_then(|v| v.as_array()) {
                let yapi_form: Vec<Value> = form_params
                    .iter()
                    .map(|fp| {
                        serde_json::json!({
                            "name": fp.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                            "type": fp.get("type").and_then(|v| v.as_str()),
                            "desc": fp.get("description").and_then(|v| v.as_str()),
                            "example": fp.get("example").and_then(|v| {
                                if v.is_array() { v.get(0).and_then(|x| x.as_str()).map(|s| s.to_string()) }
                                else { v.as_str().map(|s| s.to_string()) }
                            }),
                            "required": if fp.get("required").and_then(|v| v.as_bool()).unwrap_or(false) { "1" } else { "0" },
                        })
                    })
                    .collect();
                result["req_body_form"] = Value::Array(yapi_form);
            }
        } else if body_type.contains("raw") || body_type.contains("plain") {
            result["req_body_type"] = Value::String("raw".to_string());
            if let Some(raw) = req_body.get("rawText").and_then(|v| v.as_str()) {
                result["req_body_other"] = Value::String(raw.to_string());
            }
        }
    }

    if let Some(responses) = details.get("responses").and_then(|v| v.as_array()) {
        // 多响应：优先输出 responses 数组（与写入侧对称）
        if !responses.is_empty() {
            let yapi_responses: Vec<Value> = responses
                .iter()
                .map(|res| {
                    let mut obj = serde_json::Map::new();
                    for key in [
                        "code",
                        "name",
                        "description",
                        "contentType",
                        "jsonSchema",
                        "example",
                    ] {
                        if let Some(value) = res.get(key) {
                            if !value.is_null() {
                                obj.insert(key.to_string(), value.clone());
                            }
                        }
                    }
                    Value::Object(obj)
                })
                .collect();
            result["responses"] = Value::Array(yapi_responses);
        }

        // 同时保留首响应的老字段，老 YApi 客户端仍可从 res_body 读取
        if let Some(first_res) = responses.first() {
            let ct = first_res
                .get("contentType")
                .and_then(|v| v.as_str())
                .unwrap_or("json");
            result["res_body_type"] =
                Value::String(if ct == "json" { "json" } else { "raw" }.to_string());
            result["res_body_is_json_schema"] = Value::Bool(true);
            if let Some(schema) = first_res.get("jsonSchema") {
                result["res_body"] = Value::String(schema.to_string());
            }
        }
    }

    // Clean up null fields
    if let Some(obj) = result.as_object_mut() {
        obj.retain(|_, v| !v.is_null());
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(json: Value) -> YApiInterface {
        serde_json::from_value(json).expect("YApiInterface 反序列化失败")
    }

    #[test]
    fn 多响应数组逐条映射且保留字段() {
        let yapi = parse(serde_json::json!({
            "title": "接口",
            "path": "/a",
            "method": "get",
            "responses": [
                {"code": 200, "name": "成功", "contentType": "json", "jsonSchema": {"type": "object"}},
                {"code": 401, "name": "Unauthorized", "description": "未授权", "jsonSchema": {"type": "string"}}
            ]
        }));

        let details = yapi_to_api_details(&yapi);
        let responses = details.get("responses").and_then(|v| v.as_array()).unwrap();

        assert_eq!(responses.len(), 2);
        assert_eq!(responses[0]["code"].as_i64(), Some(200));
        assert_eq!(responses[0]["name"].as_str(), Some("成功"));
        assert_eq!(responses[0]["jsonSchema"]["type"].as_str(), Some("object"));
        assert_eq!(responses[1]["code"].as_i64(), Some(401));
        assert_eq!(responses[1]["name"].as_str(), Some("Unauthorized"));
        assert_eq!(responses[1]["description"].as_str(), Some("未授权"));
        assert_eq!(responses[1]["jsonSchema"]["type"].as_str(), Some("string"));
    }

    #[test]
    fn 请求体必填与示例被转换() {
        let yapi = parse(serde_json::json!({
            "title": "接口",
            "path": "/a",
            "method": "post",
            "req_body_type": "json",
            "req_body_other": "{\"type\":\"object\"}",
            "req_body_is_json_schema": true,
            "req_body_required": true,
            "req_body_examples": [{"name": "示例1", "value": {"a": 1}}]
        }));

        let details = yapi_to_api_details(&yapi);
        let body = details.get("requestBody").unwrap();

        assert_eq!(body["required"].as_bool(), Some(true));
        let examples = body.get("examples").and_then(|v| v.as_array()).unwrap();
        assert_eq!(examples.len(), 1);
        assert_eq!(examples[0]["name"].as_str(), Some("示例1"));
        assert_eq!(examples[0]["value"]["a"].as_i64(), Some(1));
    }

    #[test]
    fn operation_id_写入与回读一致() {
        let yapi = parse(serde_json::json!({
            "title": "接口",
            "path": "/a",
            "method": "get",
            "operationId": "newFamilyMember"
        }));

        let details = yapi_to_api_details(&yapi);
        assert_eq!(details["operationId"].as_str(), Some("newFamilyMember"));

        let back = api_details_to_yapi(&details, "m1", "接口");
        assert_eq!(back["operationId"].as_str(), Some("newFamilyMember"));
    }

    #[test]
    fn 老_payload_仅有_res_body_时回退为单响应() {
        let yapi = parse(serde_json::json!({
            "title": "接口",
            "path": "/a",
            "method": "get",
            "res_body_type": "json",
            "res_body": "{\"type\":\"object\"}",
            "res_body_is_json_schema": true
        }));

        let details = yapi_to_api_details(&yapi);
        let responses = details.get("responses").and_then(|v| v.as_array()).unwrap();

        assert_eq!(responses.len(), 1);
        assert_eq!(responses[0]["code"].as_i64(), Some(200));
        assert_eq!(responses[0]["name"].as_str(), Some("成功"));
        assert_eq!(responses[0]["jsonSchema"]["type"].as_str(), Some("object"));
    }

    #[test]
    fn 反向映射输出多响应与请求体扩展字段() {
        let details = serde_json::json!({
            "method": "post",
            "path": "/a",
            "name": "接口",
            "operationId": "op1",
            "requestBody": {
                "type": "application/json",
                "jsonSchema": {"type": "object"},
                "required": true,
                "examples": [{"name": "示例1", "value": {"a": 1}}]
            },
            "responses": [
                {"id": "r1", "code": 200, "name": "成功", "contentType": "json", "jsonSchema": {"type": "object"}},
                {"id": "r2", "code": 401, "name": "Unauthorized", "description": "未授权", "jsonSchema": {"type": "string"}}
            ]
        });

        let yapi = api_details_to_yapi(&details, "m1", "接口");
        let responses = yapi.get("responses").and_then(|v| v.as_array()).unwrap();

        assert_eq!(responses.len(), 2);
        assert_eq!(responses[1]["name"].as_str(), Some("Unauthorized"));
        assert_eq!(responses[1]["description"].as_str(), Some("未授权"));
        assert_eq!(yapi["req_body_required"].as_bool(), Some(true));
        assert_eq!(yapi["req_body_examples"].as_array().unwrap().len(), 1);
        assert_eq!(yapi["operationId"].as_str(), Some("op1"));
    }
}
