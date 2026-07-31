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

/// 将参数列表转为 OpenAPI parameters 数组。
/// OpenAPI 3.0：非 body 参数使用 `schema: { type }`；
/// Swagger 2.0：非 body 参数必须把 `type` 直接放在参数对象上（不允许 schema 字段），
/// 且 path 参数必须 `required: true`。
fn convert_parameters(params: &[serde_json::Value], param_in: &str, is_openapi3: bool) -> Vec<serde_json::Value> {
    params.iter()
        .filter(|p| p.get("name").and_then(|n| n.as_str()).map_or(false, |n| !n.is_empty()))
        .filter(|p| p.get("enable").and_then(|e| e.as_bool()).unwrap_or(true))
        .map(|p| {
            let name = p.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let ptype = p.get("type").and_then(|t| t.as_str()).unwrap_or("string");
            let description = p.get("description").and_then(|d| d.as_str()).unwrap_or("");
            let required = p.get("required").and_then(|r| r.as_bool()).unwrap_or(false);
            let mut param = serde_json::Map::new();
            param.insert("name".into(), serde_json::Value::String(name.to_string()));
            param.insert("in".into(), serde_json::Value::String(param_in.to_string()));
            if is_openapi3 {
                param.insert("required".into(), serde_json::Value::Bool(required));
                param.insert("schema".into(), serde_json::json!({ "type": ptype }));
                if let Some(example) = p.get("example") {
                    param.insert("example".into(), example.clone());
                }
            } else {
                param.insert("type".into(), serde_json::Value::String(ptype.to_string()));
                // Swagger 2.0 规范：路径参数必须 required=true
                param.insert("required".into(), serde_json::Value::Bool(param_in == "path" || required));
            }
            if !description.is_empty() {
                param.insert("description".into(), serde_json::Value::String(description.to_string()));
            }
            serde_json::Value::Object(param)
        })
        .collect()
}

/// Swagger 2.0 formData 参数：请求体中的每个表单字段展开为一个 `in: formData` 参数。
fn convert_formdata_params(params: &[serde_json::Value]) -> Vec<serde_json::Value> {
    params.iter()
        .filter(|p| p.get("name").and_then(|n| n.as_str()).map_or(false, |n| !n.is_empty()))
        .filter(|p| p.get("enable").and_then(|e| e.as_bool()).unwrap_or(true))
        .map(|p| {
            let name = p.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let ptype = p.get("type").and_then(|t| t.as_str()).filter(|t| !t.is_empty()).unwrap_or("string");
            let description = p.get("description").and_then(|d| d.as_str()).unwrap_or("");
            let required = p.get("required").and_then(|r| r.as_bool()).unwrap_or(false);
            let mut param = serde_json::Map::new();
            param.insert("name".into(), serde_json::Value::String(name.to_string()));
            param.insert("in".into(), serde_json::Value::String("formData".to_string()));
            param.insert("type".into(), serde_json::Value::String(ptype.to_string()));
            if required {
                param.insert("required".into(), serde_json::Value::Bool(true));
            }
            if !description.is_empty() {
                param.insert("description".into(), serde_json::Value::String(description.to_string()));
            }
            serde_json::Value::Object(param)
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

/// 从菜单数据构建 OpenAPI 3.0 / Swagger 2.0 规范文档（纯函数，便于单元测试）。
fn build_export_spec(items: &[ApiMenuData], is_openapi3: bool, filter_ids: Option<&[&str]>) -> serde_json::Value {
    // 收集 definitions/components.schemas
    let mut definitions = serde_json::Map::new();
    let mut paths = serde_json::Map::new();

    for item in items {
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
        if let Some(ids) = filter_ids {
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

        // parameters（含 Swagger 2.0 的 body/formData 参数，均在末尾统一插入，避免覆盖）
        let mut all_params: Vec<serde_json::Value> = Vec::new();
        if let Some(params) = data.get("parameters") {
            if let Some(q) = params.get("query").and_then(|v| v.as_array()) {
                all_params.extend(convert_parameters(q, "query", is_openapi3));
            }
            if let Some(p) = params.get("path").and_then(|v| v.as_array()) {
                all_params.extend(convert_parameters(p, "path", is_openapi3));
            }
            if let Some(h) = params.get("header").and_then(|v| v.as_array()) {
                all_params.extend(convert_parameters(h, "header", is_openapi3));
            }
        }

        // requestBody
        if let Some(req_body) = data.get("requestBody") {
            let body_type = req_body.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if body_type != "none" && !body_type.is_empty() {
                if is_openapi3 {
                    let mut content = serde_json::Map::new();
                    let media_type = if body_type.contains("json") { "application/json" }
                        else if body_type.contains("xml") { "application/xml" }
                        else if body_type.contains("form") { "multipart/form-data" }
                        else if body_type.contains("urlencoded") { "application/x-www-form-urlencoded" }
                        else { "application/json" };

                    if let Some(schema) = req_body.get("jsonSchema") {
                        let body_schema = denormalize_json_schema(schema);
                        content.insert(media_type.to_string(), serde_json::json!({ "schema": body_schema }));
                    }

                    if !content.is_empty() {
                        operation.insert("requestBody".into(), serde_json::json!({ "content": content }));
                    }
                } else if body_type.contains("form") || body_type.contains("urlencoded") {
                    // Swagger 2.0：formData 字段展开为 in: formData 参数
                    if let Some(params) = req_body.get("parameters").and_then(|v| v.as_array()) {
                        all_params.extend(convert_formdata_params(params));
                    }
                } else {
                    // Swagger 2.0：json/xml/raw 请求体使用 in: body 参数
                    if let Some(schema) = req_body.get("jsonSchema") {
                        let body_schema = denormalize_json_schema(schema);
                        all_params.push(serde_json::json!({
                            "name": "body",
                            "in": "body",
                            "schema": body_schema,
                        }));
                    }
                }
            }
        }

        if !all_params.is_empty() {
            operation.insert("parameters".into(), serde_json::Value::Array(all_params));
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

    if is_openapi3 {
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
    }
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

    let spec = build_export_spec(&state.menu_raw_list, fmt != "swagger", filter_ids.as_deref());

    let content = if fmt == "yaml" {
        serde_yaml::to_string(&spec).unwrap_or_default()
    } else {
        serde_json::to_string_pretty(&spec).unwrap_or_default()
    };

    ApiResult::success(serde_json::json!({ "content": content, "format": fmt }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn menu_item(id: &str, name: &str, menu_type: &str, data: serde_json::Value) -> ApiMenuData {
        ApiMenuData {
            id: id.to_string(),
            parent_id: None,
            name: name.to_string(),
            menu_type: menu_type.to_string(),
            data_json: Some(data),
            run_tab_json: None,
            sort_order: 0,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn api_detail(
        id: &str,
        name: &str,
        method: &str,
        path: &str,
        parameters: serde_json::Value,
        request_body: Option<serde_json::Value>,
    ) -> ApiMenuData {
        let mut data = serde_json::json!({
            "method": method,
            "path": path,
            "name": name,
            "parameters": parameters,
        });
        if let Some(body) = request_body {
            data["requestBody"] = body;
        }
        menu_item(id, name, "apiDetail", data)
    }

    fn swagger2_operation_params(spec: &serde_json::Value, path: &str, method: &str) -> Vec<serde_json::Value> {
        spec["paths"][path][method]["parameters"]
            .as_array()
            .cloned()
            .unwrap_or_default()
    }

    #[test]
    fn swagger2_non_body_parameters_use_flat_type_and_path_required_true() {
        let item = api_detail(
            "api1",
            "查询宠物",
            "get",
            "/pet/{petId}",
            serde_json::json!({
                "query": [{ "name": "q", "type": "string", "required": false, "example": "x" }],
                "path": [{ "name": "petId", "type": "string", "required": false }],
                "header": [{ "name": "X-Token", "type": "string", "required": false }],
            }),
            None,
        );

        let spec = build_export_spec(&[item], false, None);
        let params = swagger2_operation_params(&spec, "/pet/{petId}", "get");

        assert_eq!(params.len(), 3);

        // query：type 平铺、无 schema、无 example（Swagger 2.0 Parameter Object 不支持）
        assert_eq!(params[0]["in"], "query");
        assert_eq!(params[0]["type"], "string");
        assert_eq!(params[0]["required"], false);
        assert!(params[0].get("schema").is_none());
        assert!(params[0].get("example").is_none());

        // path：required 强制 true
        assert_eq!(params[1]["in"], "path");
        assert_eq!(params[1]["required"], true);

        assert_eq!(params[2]["in"], "header");
        assert_eq!(params[2]["type"], "string");
    }

    #[test]
    fn swagger2_body_parameter_does_not_override_query_parameters() {
        let item = api_detail(
            "api1",
            "创建",
            "post",
            "/pet",
            serde_json::json!({
                "query": [{ "name": "trace", "type": "string", "required": false }],
            }),
            Some(serde_json::json!({
                "type": "application/json",
                "jsonSchema": {
                    "type": "object",
                    "properties": [
                        { "name": "name", "type": "string", "required": true }
                    ]
                }
            })),
        );

        let spec = build_export_spec(&[item], false, None);
        let params = swagger2_operation_params(&spec, "/pet", "post");

        // query + body 共存，body 不再覆盖 query
        assert_eq!(params.len(), 2);
        assert_eq!(params[0]["in"], "query");
        assert_eq!(params[1]["in"], "body");
        assert_eq!(params[1]["name"], "body");
        assert!(params[1]["schema"].is_object());
        assert_eq!(params[1]["schema"]["type"], "object");
        assert!(params[1]["schema"]["properties"]["name"].is_object());
        // 2.0 中不再出现 requestBody 字段
        assert!(spec["paths"]["/pet"]["post"].get("requestBody").is_none());
    }

    #[test]
    fn swagger2_formdata_fields_expand_to_formdata_parameters() {
        let item = api_detail(
            "api1",
            "上传",
            "post",
            "/upload",
            serde_json::json!({}),
            Some(serde_json::json!({
                "type": "multipart/form-data",
                "parameters": [
                    { "name": "username", "type": "string", "required": true, "example": "turtle" },
                    { "name": "age", "type": "integer", "required": false },
                    { "name": "disabled", "type": "string", "required": false, "enable": false },
                ]
            })),
        );

        let spec = build_export_spec(&[item], false, None);
        let params = swagger2_operation_params(&spec, "/upload", "post");

        assert_eq!(params.len(), 2);
        assert_eq!(params[0]["in"], "formData");
        assert_eq!(params[0]["name"], "username");
        assert_eq!(params[0]["type"], "string");
        assert_eq!(params[0]["required"], true);
        assert_eq!(params[1]["in"], "formData");
        assert_eq!(params[1]["name"], "age");
        assert_eq!(params[1]["type"], "integer");
        assert!(params[1].get("required").is_none());
        // 禁用字段不导出
        assert!(!params.iter().any(|p| p["name"] == "disabled"));
    }

    #[test]
    fn swagger2_urlencoded_body_expands_to_formdata_parameters() {
        let item = api_detail(
            "api1",
            "登录",
            "post",
            "/login",
            serde_json::json!({}),
            Some(serde_json::json!({
                "type": "application/x-www-form-urlencoded",
                "parameters": [
                    { "name": "user", "type": "string", "required": true },
                    { "name": "pass", "type": "string", "required": true },
                ]
            })),
        );

        let spec = build_export_spec(&[item], false, None);
        let params = swagger2_operation_params(&spec, "/login", "post");

        assert_eq!(params.len(), 2);
        assert!(params.iter().all(|p| p["in"] == "formData"));
    }

    #[test]
    fn swagger2_request_body_type_none_emits_no_parameters() {
        let item = api_detail(
            "api1",
            "无 body",
            "post",
            "/x",
            serde_json::json!({}),
            Some(serde_json::json!({ "type": "none" })),
        );

        let spec = build_export_spec(&[item], false, None);
        assert!(spec["paths"]["/x"]["post"].get("parameters").is_none());
    }

    #[test]
    fn swagger2_spec_has_expected_top_level_structure() {
        let item = api_detail("api1", "查", "get", "/a", serde_json::json!({}), None);
        let spec = build_export_spec(&[item], false, None);

        assert_eq!(spec["swagger"], "2.0");
        assert!(spec["paths"]["/a"]["get"].is_object());
        assert!(spec["definitions"].is_object());
        // 2.0 不应有 components
        assert!(spec.get("components").is_none());
    }

    #[test]
    fn openapi3_keeps_schema_nested_parameters_and_request_body() {
        let item = api_detail(
            "api1",
            "创建",
            "post",
            "/pet",
            serde_json::json!({
                "query": [{ "name": "q", "type": "string", "required": false, "example": "x" }],
            }),
            Some(serde_json::json!({
                "type": "application/json",
                "jsonSchema": {
                    "type": "object",
                    "properties": [{ "name": "name", "type": "string" }]
                }
            })),
        );

        let spec = build_export_spec(&[item], true, None);

        assert_eq!(spec["openapi"], "3.0.0");
        let params = spec["paths"]["/pet"]["post"]["parameters"].as_array().unwrap();
        assert_eq!(params[0]["in"], "query");
        assert_eq!(params[0]["schema"]["type"], "string");
        assert_eq!(params[0]["example"], "x");

        let content = &spec["paths"]["/pet"]["post"]["requestBody"]["content"];
        assert!(content["application/json"]["schema"]["properties"]["name"].is_object());
        assert!(spec["components"]["schemas"].is_object());
    }

    #[test]
    fn models_go_into_definitions() {
        let schema = menu_item(
            "schema1",
            "Pet",
            "apiSchema",
            serde_json::json!({
                "jsonSchema": {
                    "type": "object",
                    "properties": [{ "name": "id", "type": "integer" }]
                }
            }),
        );
        let spec = build_export_spec(&[schema], false, None);

        assert_eq!(spec["definitions"]["Pet"]["type"], "object");
        assert!(spec["definitions"]["Pet"]["properties"]["id"].is_object());
    }

    #[test]
    fn selective_export_filters_by_menu_ids() {
        let keep = api_detail("keep", "保留", "get", "/keep", serde_json::json!({}), None);
        let drop = api_detail("drop", "丢弃", "get", "/drop", serde_json::json!({}), None);

        let spec = build_export_spec(&[keep, drop], false, Some(&["keep"]));

        assert!(spec["paths"]["/keep"]["get"].is_object());
        assert!(spec["paths"].get("/drop").is_none());
    }
}
