use std::collections::{HashMap, HashSet};

use serde_json::Value;
use uuid::Uuid;

use crate::db::client::Db;
use crate::db::{menu_repo, project_repo};
use crate::errors::AppError;
use crate::models::{CreateMenuItemPayload, ProjectStateSnapshot};

const HTTP_METHODS: &[&str] = &[
    "get", "post", "put", "delete", "patch", "options", "head", "trace",
];

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn parse_content(content: &str, format: &str) -> Result<Value, AppError> {
    match format {
        "yaml" | "yml" => serde_yaml::from_str(content)
            .map_err(|e| AppError::BadRequest(format!("YAML 解析失败: {e}"))),
        "json" => serde_json::from_str(content)
            .map_err(|e| AppError::BadRequest(format!("JSON 解析失败: {e}"))),
        _ => serde_json::from_str(content)
            .or_else(|_| serde_yaml::from_str(content))
            .map_err(|_| AppError::BadRequest("无法解析文档内容，请确认是 JSON 或 YAML 格式".into())),
    }
}

struct TagInfo {
    name: String,
    description: String,
}

fn extract_tags(doc: &Value) -> Vec<TagInfo> {
    doc.get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| {
                    Some(TagInfo {
                        name: t.get("name")?.as_str()?.to_string(),
                        description: t
                            .get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("")
                            .to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn is_http_method(method: &str) -> bool {
    HTTP_METHODS.contains(&method.to_lowercase().as_str())
}

fn build_openapi_parameters(
    path_item: &Value,
    operation: &Value,
) -> Value {
    let mut all_params: Vec<Value> = Vec::new();

    // Path-level parameters (shared across all methods)
    if let Some(params) = path_item.get("parameters").and_then(|v| v.as_array()) {
        all_params.extend(params.iter().cloned());
    }

    // Operation-level parameters
    if let Some(params) = operation.get("parameters").and_then(|v| v.as_array()) {
        all_params.extend(params.iter().cloned());
    }

    if all_params.is_empty() {
        return Value::Null;
    }

    let mut query_params: Vec<Value> = Vec::new();
    let mut path_params: Vec<Value> = Vec::new();
    let mut header_params: Vec<Value> = Vec::new();
    let mut cookie_params: Vec<Value> = Vec::new();

    for param in &all_params {
        let param_in = param.get("in").and_then(|v| v.as_str()).unwrap_or("");
        let name = param.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let required = param.get("required").and_then(|v| v.as_bool()).unwrap_or(false);
        let description = param.get("description").and_then(|v| v.as_str()).unwrap_or("");

        // Build a simplified parameter object matching the frontend's Parameter type
        let frontend_param = serde_json::json!({
            "id": Uuid::new_v4().to_string(),
            "name": name,
            "description": description,
            "required": required,
            "enable": true,
            "type": "string",
        });

        match param_in {
            "query" => query_params.push(frontend_param),
            "path" => path_params.push(frontend_param),
            "header" => header_params.push(frontend_param),
            "cookie" => cookie_params.push(frontend_param),
            _ => {}
        }
    }

    let mut result = serde_json::Map::new();
    if !query_params.is_empty() {
        result.insert("query".to_string(), Value::Array(query_params));
    }
    if !path_params.is_empty() {
        result.insert("path".to_string(), Value::Array(path_params));
    }
    if !header_params.is_empty() {
        result.insert("header".to_string(), Value::Array(header_params));
    }
    if !cookie_params.is_empty() {
        result.insert("cookie".to_string(), Value::Array(cookie_params));
    }

    if result.is_empty() {
        Value::Null
    } else {
        Value::Object(result)
    }
}

fn build_openapi_request_body(operation: &Value) -> Value {
    let request_body = match operation.get("requestBody") {
        Some(rb) => rb,
        None => return Value::Null,
    };

    // Try OpenAPI 3.x content structure
    if let Some(content) = request_body.get("content") {
        if let Some(json_content) = content.get("application/json") {
            let schema = json_content.get("schema").cloned();
            return serde_json::json!({
                "type": "application/json",
                "jsonSchema": schema.unwrap_or(Value::Null),
            });
        }
        if let Some(form_content) = content.get("multipart/form-data") {
            let schema = form_content.get("schema").cloned();
            return serde_json::json!({
                "type": "multipart/form-data",
                "jsonSchema": schema.unwrap_or(Value::Null),
            });
        }
        if let Some(form_content) = content.get("application/x-www-form-urlencoded") {
            let schema = form_content.get("schema").cloned();
            return serde_json::json!({
                "type": "application/x-www-form-urlencoded",
                "jsonSchema": schema.unwrap_or(Value::Null),
            });
        }
        // Return first content type found
        if let Some((content_type, content_val)) = content.as_object().and_then(|o| o.iter().next()) {
            let schema = content_val.get("schema").cloned();
            return serde_json::json!({
                "type": content_type,
                "jsonSchema": schema.unwrap_or(Value::Null),
            });
        }
    }

    Value::Null
}

fn build_openapi_responses(operation: &Value) -> Value {
    let responses = match operation.get("responses") {
        Some(r) => r,
        None => return Value::Array(vec![]),
    };

    let response_obj = match responses.as_object() {
        Some(o) => o,
        None => return Value::Array(vec![]),
    };

    let mut result: Vec<Value> = Vec::new();
    for (status_code, response) in response_obj {
        let code: i32 = status_code.parse().unwrap_or(200);
        let name = format!("HTTP {}", status_code);
        let description = response
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let content_type;
        let json_schema;

        // Extract content/schema from response
        if let Some(content) = response.get("content") {
            content_type = content
                .as_object()
                .and_then(|o| o.keys().next())
                .cloned()
                .unwrap_or_else(|| "application/json".to_string());
            json_schema = content
                .get(&content_type)
                .and_then(|c| c.get("schema"))
                .cloned();
        } else {
            content_type = "application/json".to_string();
            json_schema = None;
        }

        result.push(serde_json::json!({
            "id": Uuid::new_v4().to_string(),
            "code": code,
            "name": format!("{} {}", name, description),
            "contentType": content_type,
            "jsonSchema": json_schema,
        }));
    }

    Value::Array(result)
}

/// Import an OpenAPI 3.x document
fn import_openapi3(
    db: &Db,
    project_id: &str,
    doc: &Value,
) -> Result<ProjectStateSnapshot, AppError> {
    let paths = doc.get("paths").and_then(|v| v.as_object());
    let tags_info = extract_tags(doc);
    let now = now_iso();
    let mut sort_order: i32 = 0;

    // First pass: collect all used tags
    let mut used_tags: HashSet<String> = HashSet::new();
    if let Some(paths_obj) = paths {
        for (_path_str, path_item) in paths_obj {
            if let Some(obj) = path_item.as_object() {
                for (method, operation) in obj {
                    if is_http_method(method) {
                        if let Some(op_tags) = operation.get("tags").and_then(|t| t.as_array()) {
                            for tag in op_tags {
                                if let Some(tag_name) = tag.as_str() {
                                    used_tags.insert(tag_name.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Create folders for used tags
    let mut tag_folder_ids: HashMap<String, String> = HashMap::new();
    for tag_name in &used_tags {
        let folder_id = Uuid::new_v4().to_string();
        let tag_desc = tags_info
            .iter()
            .find(|t| t.name == *tag_name)
            .map(|t| t.description.clone())
            .unwrap_or_default();

        let folder_data = serde_json::json!({
            "name": tag_name,
            "description": tag_desc,
        });

        let payload = CreateMenuItemPayload {
            id: folder_id.clone(),
            parent_id: None,
            name: tag_name.clone(),
            menu_type: "apiDetailFolder".to_string(),
            data_json: Some(folder_data),
            sort_order: Some(sort_order),
        };
        menu_repo::create_menu_item(db, project_id, &payload)?;
        tag_folder_ids.insert(tag_name.clone(), folder_id);
        sort_order += 1;
    }

    // Second pass: create API details for each path+method
    if let Some(paths_obj) = paths {
        for (path_str, path_item) in paths_obj {
            let path_obj = match path_item.as_object() {
                Some(o) => o,
                None => continue,
            };

            for (method, operation) in path_obj {
                if !is_http_method(method) {
                    continue;
                }

                let api_id = Uuid::new_v4().to_string();
                let op_name = operation
                    .get("summary")
                    .or(operation.get("operationId"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&format!("{} {}", method.to_uppercase(), path_str))
                    .to_string();

                let description = operation
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let op_tags: Vec<String> = operation
                    .get("tags")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|t| t.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();

                let parent_id = op_tags
                    .first()
                    .and_then(|t| tag_folder_ids.get(t).cloned());

                let parameters = build_openapi_parameters(path_item, operation);
                let request_body = build_openapi_request_body(operation);
                let responses = build_openapi_responses(operation);

                let data_json = serde_json::json!({
                    "id": api_id,
                    "method": method.to_uppercase(),
                    "path": path_str,
                    "name": op_name,
                    "status": "designing",
                    "description": description,
                    "tags": op_tags,
                    "parameters": parameters,
                    "requestBody": request_body,
                    "responses": responses,
                    "createdAt": now,
                    "updatedAt": now,
                });

                let payload = CreateMenuItemPayload {
                    id: api_id,
                    parent_id,
                    name: op_name,
                    menu_type: "apiDetail".to_string(),
                    data_json: Some(data_json),
                    sort_order: Some(sort_order),
                };
                menu_repo::create_menu_item(db, project_id, &payload)?;
                sort_order += 1;
            }
        }
    }

    // Import schemas/components from OpenAPI 3.x
    if let Some(schemas) = doc.get("components").and_then(|c| c.get("schemas")).and_then(|s| s.as_object()) {
        import_schemas(db, project_id, schemas, &mut sort_order)?;
    }

    project_repo::get_project_state(db, project_id)
}

/// Import a Swagger 2.0 document
fn import_swagger2(
    db: &Db,
    project_id: &str,
    doc: &Value,
) -> Result<ProjectStateSnapshot, AppError> {
    let paths = doc.get("paths").and_then(|v| v.as_object());
    let tags_info = extract_tags(doc);
    let now = now_iso();
    let mut sort_order: i32 = 0;

    // Collect tags from operations
    let mut used_tags: HashSet<String> = HashSet::new();
    if let Some(paths_obj) = paths {
        for (_path_str, path_item) in paths_obj {
            if let Some(obj) = path_item.as_object() {
                for (method, operation) in obj {
                    if is_http_method(method) {
                        if let Some(op_tags) = operation.get("tags").and_then(|t| t.as_array()) {
                            for tag in op_tags {
                                if let Some(tag_name) = tag.as_str() {
                                    used_tags.insert(tag_name.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Create folders for used tags
    let mut tag_folder_ids: HashMap<String, String> = HashMap::new();
    for tag_name in &used_tags {
        let folder_id = Uuid::new_v4().to_string();
        let tag_desc = tags_info
            .iter()
            .find(|t| t.name == *tag_name)
            .map(|t| t.description.clone())
            .unwrap_or_default();

        let folder_data = serde_json::json!({
            "name": tag_name,
            "description": tag_desc,
        });

        let payload = CreateMenuItemPayload {
            id: folder_id.clone(),
            parent_id: None,
            name: tag_name.clone(),
            menu_type: "apiDetailFolder".to_string(),
            data_json: Some(folder_data),
            sort_order: Some(sort_order),
        };
        menu_repo::create_menu_item(db, project_id, &payload)?;
        tag_folder_ids.insert(tag_name.clone(), folder_id);
        sort_order += 1;
    }

    // Create API details
    if let Some(paths_obj) = paths {
        for (path_str, path_item) in paths_obj {
            let path_obj = match path_item.as_object() {
                Some(o) => o,
                None => continue,
            };

            for (method, operation) in path_obj {
                if !is_http_method(method) {
                    continue;
                }

                let api_id = Uuid::new_v4().to_string();
                let op_name = operation
                    .get("summary")
                    .or(operation.get("operationId"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&format!("{} {}", method.to_uppercase(), path_str))
                    .to_string();

                let description = operation
                    .get("description")
                    .or(operation.get("summary"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let op_tags: Vec<String> = operation
                    .get("tags")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|t| t.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();

                let parent_id = op_tags
                    .first()
                    .and_then(|t| tag_folder_ids.get(t).cloned());

                // Swagger 2.0 uses "parameters" at both path and operation level
                let parameters = build_openapi_parameters(path_item, operation);

                // Swagger 2.0 uses "consumes" and "produces" at top level or operation level
                // and parameters with "in": "body" for request body
                let request_body = build_swagger2_request_body(doc, operation);

                // Swagger 2.0 responses
                let responses = build_openapi_responses(operation);

                let data_json = serde_json::json!({
                    "id": api_id,
                    "method": method.to_uppercase(),
                    "path": path_str,
                    "name": op_name,
                    "status": "designing",
                    "description": description,
                    "tags": op_tags,
                    "parameters": parameters,
                    "requestBody": request_body,
                    "responses": responses,
                    "createdAt": now,
                    "updatedAt": now,
                });

                let payload = CreateMenuItemPayload {
                    id: api_id,
                    parent_id,
                    name: op_name,
                    menu_type: "apiDetail".to_string(),
                    data_json: Some(data_json),
                    sort_order: Some(sort_order),
                };
                menu_repo::create_menu_item(db, project_id, &payload)?;
                sort_order += 1;
            }
        }
    }

    // Import schemas/definitions from Swagger 2.0
    if let Some(definitions) = doc.get("definitions").and_then(|d| d.as_object()) {
        import_schemas(db, project_id, definitions, &mut sort_order)?;
    }

    project_repo::get_project_state(db, project_id)
}

fn build_swagger2_request_body(doc: &Value, operation: &Value) -> Value {
    // Swagger 2.0 has body param in parameters array
    if let Some(params) = operation
        .get("parameters")
        .and_then(|v| v.as_array())
    {
        for param in params {
            if param.get("in").and_then(|v| v.as_str()) == Some("body") {
                let schema = param.get("schema").cloned();
                let consumes = operation
                    .get("consumes")
                    .or(doc.get("consumes"))
                    .and_then(|v| v.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|v| v.as_str())
                    .unwrap_or("application/json");

                return serde_json::json!({
                    "type": consumes,
                    "jsonSchema": schema,
                });
            }
        }
    }
    Value::Null
}

/// Import schemas (OpenAPI 3.x components.schemas or Swagger 2.0 definitions)
fn import_schemas(
    db: &Db,
    project_id: &str,
    schemas: &serde_json::Map<String, Value>,
    sort_order: &mut i32,
) -> Result<(), AppError> {
    for (name, schema) in schemas {
        let schema_id = Uuid::new_v4().to_string();

        let data_json = serde_json::json!({
            "jsonSchema": schema,
        });

        let payload = CreateMenuItemPayload {
            id: schema_id,
            parent_id: None,
            name: name.clone(),
            menu_type: "apiSchema".to_string(),
            data_json: Some(data_json),
            sort_order: Some(*sort_order),
        };
        menu_repo::create_menu_item(db, project_id, &payload)?;
        *sort_order += 1;
    }

    Ok(())
}

/// Detect document type and import accordingly
fn detect_and_import(
    db: &Db,
    project_id: &str,
    doc: &Value,
) -> Result<ProjectStateSnapshot, AppError> {
    if doc.get("openapi").is_some() {
        import_openapi3(db, project_id, doc)
    } else if doc.get("swagger").is_some() {
        import_swagger2(db, project_id, doc)
    } else if doc.get("paths").is_some() {
        // Treat as generic OpenAPI
        import_openapi3(db, project_id, doc)
    } else {
        Err(AppError::BadRequest(
            "不支持的文档格式，仅支持 OpenAPI 3.x、Swagger 2.0 格式".into(),
        ))
    }
}

pub fn import_api_document(
    db: &Db,
    project_id: &str,
    format: &str,
    content: &str,
) -> Result<ProjectStateSnapshot, AppError> {
    let doc = parse_content(content, format)?;
    detect_and_import(db, project_id, &doc)
}
