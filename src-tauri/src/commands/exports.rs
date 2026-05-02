use tauri::State;
use crate::db::client::Db;
use std::sync::Arc;
use crate::db::project_repo;
use crate::models::*;

#[tauri::command]
pub fn write_export_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// 将内部 JSON Schema 转回标准格式（properties 数组 → object map, type:ref → $ref）
fn denormalize_json_schema(schema: &serde_json::Value) -> serde_json::Value {
    if schema.is_null() || !schema.is_object() {
        return schema.clone();
    }
    let obj = schema.as_object().unwrap();

    // $ref 引用直接透传
    if obj.get("type").and_then(|v| v.as_str()) == Some("ref") {
        let mut out = serde_json::Map::new();
        if let Some(r) = obj.get("$ref") {
            out.insert("$ref".into(), r.clone());
        }
        if let Some(d) = obj.get("description").and_then(|v| v.as_str()) {
            if !d.is_empty() {
                out.insert("description".into(), serde_json::Value::String(d.to_string()));
            }
        }
        return serde_json::Value::Object(out);
    }

    // object: properties 数组 → object map
    if obj.get("type").and_then(|v| v.as_str()) == Some("object") {
        let mut out = serde_json::Map::new();
        out.insert("type".into(), serde_json::Value::String("object".to_string()));
        if let Some(props) = obj.get("properties").and_then(|v| v.as_array()) {
            let mut props_map = serde_json::Map::new();
            let mut required_list: Vec<serde_json::Value> = Vec::new();
            for prop in props {
                let denorm = denormalize_json_schema(prop);
                if let Some(name) = prop.get("name").and_then(|v| v.as_str()) {
                    // 去掉内部的 name 字段
                    if let Some(dobj) = denorm.as_object() {
                        let mut cleaned = dobj.clone();
                        cleaned.remove("name");
                        cleaned.remove("displayName");
                        cleaned.remove("required");
                        props_map.insert(name.to_string(), serde_json::Value::Object(cleaned));
                    }
                    // 收集 required
                    if prop.get("required").and_then(|v| v.as_bool()).unwrap_or(false) {
                        required_list.push(serde_json::Value::String(name.to_string()));
                    }
                }
            }
            out.insert("properties".into(), serde_json::Value::Object(props_map));
            if !required_list.is_empty() {
                out.insert("required".into(), serde_json::Value::Array(required_list));
            }
        }
        if let Some(d) = obj.get("description").and_then(|v| v.as_str()) {
            if !d.is_empty() { out.insert("description".into(), serde_json::Value::String(d.into())); }
        }
        if let Some(t) = obj.get("title").and_then(|v| v.as_str()) {
            if !t.is_empty() { out.insert("title".into(), serde_json::Value::String(t.into())); }
        }
        return serde_json::Value::Object(out);
    }

    // array
    if obj.get("type").and_then(|v| v.as_str()) == Some("array") {
        let mut out = serde_json::Map::new();
        out.insert("type".into(), serde_json::Value::String("array".to_string()));
        if let Some(items) = obj.get("items") {
            out.insert("items".into(), denormalize_json_schema(items));
        }
        if let Some(d) = obj.get("description").and_then(|v| v.as_str()) {
            if !d.is_empty() { out.insert("description".into(), serde_json::Value::String(d.into())); }
        }
        return serde_json::Value::Object(out);
    }

    // 基本类型（string, integer, number, boolean, null）
    let mut out = serde_json::Map::new();
    if let Some(t) = obj.get("type").and_then(|v| v.as_str()) {
        out.insert("type".into(), serde_json::Value::String(t.into()));
    }
    if let Some(d) = obj.get("description").and_then(|v| v.as_str()) {
        if !d.is_empty() { out.insert("description".into(), serde_json::Value::String(d.into())); }
    }
    if let Some(t) = obj.get("title").and_then(|v| v.as_str()) {
        if !t.is_empty() { out.insert("title".into(), serde_json::Value::String(t.into())); }
    }
    if let Some(f) = obj.get("format").and_then(|v| v.as_str()) {
        if !f.is_empty() { out.insert("format".into(), serde_json::Value::String(f.into())); }
    }
    if let Some(e) = obj.get("enum").and_then(|v| v.as_array()) {
        out.insert("enum".into(), serde_json::Value::Array(e.clone()));
    }
    if let Some(e) = obj.get("example") {
        out.insert("example".into(), e.clone());
    }
    serde_json::Value::Object(out)
}

/// 将参数列表转为 OpenAPI parameters 数组
fn convert_parameters(params: &[serde_json::Value], param_in: &str) -> Vec<serde_json::Value> {
    params.iter()
        .filter(|p| p.get("name").and_then(|n| n.as_str()).map_or(false, |n| !n.is_empty()))
        .filter(|p| p.get("enable").and_then(|e| e.as_bool()).unwrap_or(true))
        .map(|p| {
            let name = p.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let ptype = p.get("type").and_then(|t| t.as_str()).unwrap_or("string");
            let description = p.get("description").and_then(|d| d.as_str()).unwrap_or("");
            let required = p.get("required").and_then(|r| r.as_bool()).unwrap_or(false);
            let mut param = serde_json::json!({
                "name": name,
                "in": param_in,
                "description": description,
                "required": required,
                "schema": { "type": ptype },
            });
            if let Some(example) = p.get("example") {
                param["example"] = example.clone();
            }
            param
        })
        .collect()
}

/// 构建 OpenAPI 3.0 schema 块（requestBody 或 response）
fn build_openapi3_schema(json_schema: &serde_json::Value) -> Option<serde_json::Value> {
    if json_schema.is_null() || (json_schema.is_object() && json_schema.as_object().unwrap().is_empty()) {
        return None;
    }
    let denorm = denormalize_json_schema(json_schema);
    if denorm.is_null() || (denorm.is_object() && denorm.as_object().unwrap().is_empty()) {
        return None;
    }
    Some(serde_json::json!({ "schema": denorm }))
}

/// 构建 Swagger 2.0 response schema（直接引 schema 对象）
fn build_swagger2_response_schema(json_schema: &serde_json::Value) -> Option<serde_json::Value> {
    if json_schema.is_null() || (json_schema.is_object() && json_schema.as_object().unwrap().is_empty()) {
        return None;
    }
    let denorm = denormalize_json_schema(json_schema);
    if denorm.is_null() || (denorm.is_object() && denorm.as_object().unwrap().is_empty()) {
        return None;
    }
    Some(serde_json::json!({ "schema": denorm }))
}

#[tauri::command]
pub fn export_openapi(
    db: State<Arc<Db>>,
    session_id: String,
    project_id: String,
    format: Option<String>,
    menu_ids: Option<String>,
) -> ApiResult<serde_json::Value> {
    let user = crate::db::auth_repo::get_valid_session_user(&db, &session_id)
        .ok_or_else(|| crate::errors::AppError::Unauthorized("未登录".into()));
    let user = match user {
        Ok(u) => u,
        Err(e) => return e.into(),
    };
    if project_repo::get_project_member_role(&db, &project_id, &user.id).is_none() {
        return crate::errors::AppError::Forbidden("无权限".into()).into();
    }

    let state = match project_repo::get_project_state(&db, &project_id) {
        Ok(s) => s,
        Err(e) => return e.into(),
    };

    let fmt = format.as_deref().unwrap_or("json");
    let filter_ids: Option<Vec<&str>> = menu_ids
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.split(',').filter(|id| !id.is_empty()).collect());

    let is_openapi3 = fmt != "swagger";

    // 收集 definitions/components.schemas
    let mut definitions = serde_json::Map::new();
    let mut paths = serde_json::Map::new();

    for item in &state.menu_raw_list {
        let mtype = &item.menu_type;

        // 提取模型定义
        if mtype == "apiSchema" {
            if let Some(ref data) = item.data_json {
                if let Some(schema) = data.get("jsonSchema") {
                    let denorm = denormalize_json_schema(schema);
                    definitions.insert(item.name.clone(), denorm);
                }
            }
            continue;
        }

        // 提取 API 接口
        if mtype != "apiDetail" && mtype != "HttpRequest" {
            continue;
        }
        // 选择性导出过滤
        if let Some(ref ids) = filter_ids {
            if !ids.contains(&item.id.as_str()) {
                continue;
            }
        }

        let data = match &item.data_json {
            Some(d) => d,
            None => continue,
        };

        let path = data.get("path").and_then(|v| v.as_str()).unwrap_or("/");
        let method = data.get("method").and_then(|v| v.as_str()).unwrap_or("GET").to_lowercase();
        let summary = data.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let description = data.get("description").and_then(|v| v.as_str()).unwrap_or("");
        let tags: Vec<serde_json::Value> = data.get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| arr.clone())
            .unwrap_or_default();

        // 构建 operation
        let mut operation = serde_json::Map::new();
        operation.insert("summary".into(), serde_json::Value::String(summary.to_string()));
        if !description.is_empty() {
            operation.insert("description".into(), serde_json::Value::String(description.to_string()));
        }
        if !tags.is_empty() {
            operation.insert("tags".into(), serde_json::Value::Array(tags));
        }

        // parameters
        let mut all_params: Vec<serde_json::Value> = Vec::new();
        if let Some(params) = data.get("parameters") {
            if let Some(q) = params.get("query").and_then(|v| v.as_array()) {
                all_params.extend(convert_parameters(q, "query"));
            }
            if let Some(p) = params.get("path").and_then(|v| v.as_array()) {
                all_params.extend(convert_parameters(p, "path"));
            }
            if let Some(h) = params.get("header").and_then(|v| v.as_array()) {
                all_params.extend(convert_parameters(h, "header"));
            }
        }
        if !all_params.is_empty() {
            operation.insert("parameters".into(), serde_json::Value::Array(all_params));
        }

        // requestBody
        if let Some(req_body) = data.get("requestBody") {
            let body_type = req_body.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if body_type != "none" && !body_type.is_empty() {
                let mut content = serde_json::Map::new();
                let media_type = if body_type.contains("json") { "application/json" }
                    else if body_type.contains("xml") { "application/xml" }
                    else if body_type.contains("form") { "multipart/form-data" }
                    else if body_type.contains("urlencoded") { "application/x-www-form-urlencoded" }
                    else { "application/json" };

                if let Some(schema) = req_body.get("jsonSchema") {
                    let body_schema = denormalize_json_schema(schema);
                    if is_openapi3 {
                        content.insert(media_type.to_string(), serde_json::json!({ "schema": body_schema }));
                    } else {
                        // Swagger 2.0: body parameter
                        let sw2_schema = if let Some(desc) = schema.get("description").and_then(|v| v.as_str()) {
                            serde_json::json!({ "$ref": schema.get("$ref").and_then(|v| v.as_str()).unwrap_or(""), "description": desc })
                        } else {
                            body_schema
                        };
                        operation.insert("parameters".into(), serde_json::Value::Array(vec![
                            serde_json::json!({ "name": "body", "in": "body", "schema": sw2_schema })
                        ]));
                        content.clear(); // Swagger 2.0 不用 requestBody content
                    }
                }

                if !content.is_empty() {
                    operation.insert("requestBody".into(), serde_json::json!({ "content": content }));
                }
            }
        }

        // responses
        let mut responses = serde_json::Map::new();
        if let Some(resps) = data.get("responses").and_then(|v| v.as_array()) {
            for resp in resps {
                let code = resp.get("code").and_then(|v| v.as_i64()).unwrap_or(200);
                let desc = resp.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let mut resp_obj = serde_json::Map::new();
                resp_obj.insert("description".into(), serde_json::Value::String(desc.to_string()));

                if let Some(schema) = resp.get("jsonSchema") {
                    if is_openapi3 {
                        if let Some(sc) = build_openapi3_schema(schema) {
                            let media_type = resp.get("contentType")
                                .and_then(|v| v.as_str())
                                .unwrap_or("application/json");
                            resp_obj.insert("content".into(), serde_json::json!({ media_type: sc }));
                        }
                    } else {
                        if let Some(sc) = build_swagger2_response_schema(schema) {
                            resp_obj.insert("schema".into(), sc.get("schema").cloned().unwrap_or(serde_json::Value::Null));
                        }
                    }
                }

                responses.insert(code.to_string(), serde_json::Value::Object(resp_obj));
            }
        }
        if responses.is_empty() {
            responses.insert("200".into(), serde_json::json!({ "description": "Success" }));
        }
        operation.insert("responses".into(), serde_json::Value::Object(responses));

        // 插入 path
        let path_entry = paths.entry(path.to_string())
            .or_insert_with(|| serde_json::json!({}));
        if let Some(obj) = path_entry.as_object_mut() {
            obj.insert(method, serde_json::Value::Object(operation));
        }
    }

    let spec = if is_openapi3 {
        serde_json::json!({
            "openapi": "3.0.0",
            "info": { "title": "ApiMocktle Export", "version": "1.0.0" },
            "paths": paths,
            "components": { "schemas": definitions },
        })
    } else {
        serde_json::json!({
            "swagger": "2.0",
            "info": { "title": "ApiMocktle Export", "version": "1.0.0" },
            "paths": paths,
            "definitions": definitions,
        })
    };

    let content = if fmt == "yaml" {
        serde_yaml::to_string(&spec).unwrap_or_default()
    } else {
        serde_json::to_string_pretty(&spec).unwrap_or_default()
    };

    ApiResult::success(serde_json::json!({ "content": content, "format": fmt }))
}
