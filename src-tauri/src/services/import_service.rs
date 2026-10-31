use std::collections::HashMap;

use rusqlite::Connection;
use serde_json::Value;
use uuid::Uuid;

use crate::db::client::Db;
use crate::db::{menu_repo, project_repo};
use crate::errors::AppError;
use crate::models::{CreateMenuItemPayload, ProjectStateSnapshot};
use crate::services::import_native;

const HTTP_METHODS: &[&str] = &[
    "get", "post", "put", "delete", "patch", "options", "head", "trace",
];

/// 前端 `ParamType` 枚举的合法取值，其余类型一律降级为 string。
const PARAM_TYPES: [&str; 6] = ["integer", "string", "boolean", "number", "array", "file"];

/// 前端 `ApiStatus` 枚举的合法取值，未知值降级为 designing。
pub(crate) const API_STATUSES: [&str; 10] = [
    "designing",
    "pending",
    "developing",
    "obsolete",
    "integrating",
    "testing",
    "tested",
    "released",
    "deprecated",
    "exception",
];

/// 请求体优先使用的媒体类型，其余媒体类型取第一个。
const REQUEST_BODY_MEDIA_TYPES: [&str; 3] = [
    "application/json",
    "multipart/form-data",
    "application/x-www-form-urlencoded",
];

pub(crate) fn now_iso() -> String {
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

/// 取参数类型：OpenAPI 3 用 `schema.type`，Swagger 2 用平铺的 `type`。
/// 结果必须落在前端 `ParamType` 枚举内，否则降级为 string。
fn param_type(param: &Value) -> &str {
    let raw = param
        .get("schema")
        .and_then(|s| s.get("type"))
        .and_then(|t| t.as_str())
        .or_else(|| param.get("type").and_then(|t| t.as_str()))
        .unwrap_or("string");
    if PARAM_TYPES.contains(&raw) {
        raw
    } else {
        "string"
    }
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
            "type": param_type(param),
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

/// 从媒体类型对象提取示例，统一成 `[{ name?, value }]` 形态（与前端 `ApiRequestBody.examples` 一致）。
fn extract_body_examples(media: &Value) -> Option<Value> {
    if let Some(example) = media.get("example") {
        return Some(serde_json::json!([{ "value": example }]));
    }
    let examples = media.get("examples").and_then(|v| v.as_object())?;
    let list: Vec<Value> = examples
        .iter()
        .map(|(name, item)| {
            // OpenAPI 3 的 Example Object 把示例放在 value 字段；旧写法直接给示例值
            let value = item.get("value").unwrap_or(item);
            serde_json::json!({ "name": name, "value": value })
        })
        .collect();
    if list.is_empty() {
        None
    } else {
        Some(Value::Array(list))
    }
}

fn build_openapi_request_body(operation: &Value) -> Value {
    let request_body = match operation.get("requestBody") {
        Some(rb) => rb,
        None => return Value::Null,
    };

    // Try OpenAPI 3.x content structure
    let content = match request_body.get("content").and_then(|c| c.as_object()) {
        Some(c) => c,
        None => return Value::Null,
    };
    let picked = REQUEST_BODY_MEDIA_TYPES
        .iter()
        .find_map(|m| content.get_key_value(*m))
        .or_else(|| content.iter().next());
    let (media_type, media) = match picked {
        Some((k, v)) => (k.clone(), v),
        None => return Value::Null,
    };

    let mut body = serde_json::Map::new();
    body.insert("type".into(), Value::String(media_type));
    body.insert(
        "jsonSchema".into(),
        media.get("schema").cloned().unwrap_or(Value::Null),
    );
    if let Some(required) = request_body.get("required").and_then(|v| v.as_bool()) {
        body.insert("required".into(), Value::Bool(required));
    }
    if let Some(description) = request_body
        .get("description")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        body.insert("description".into(), Value::String(description.to_string()));
    }
    if let Some(examples) = extract_body_examples(media) {
        body.insert("examples".into(), examples);
    }

    Value::Object(body)
}

/// 媒体类型映射到前端 `ContentType` 枚举值。
fn map_content_type(media_type: &str) -> &'static str {
    let base = media_type.split(';').next().unwrap_or("").trim();
    if base.is_empty() || base == "application/json" || base.ends_with("+json") {
        "json"
    } else if base == "application/xml" || base == "text/xml" || base.ends_with("+xml") {
        "xml"
    } else if base == "text/html" {
        "html"
    } else {
        "binary"
    }
}

fn build_openapi_responses(operation: &Value) -> Value {
    let response_obj = match operation.get("responses").and_then(|r| r.as_object()) {
        Some(o) => o,
        None => return Value::Array(vec![]),
    };

    let mut result: Vec<Value> = Vec::new();
    for (status_code, response) in response_obj {
        let code: i32 = status_code.parse().unwrap_or(200);

        // 响应媒体类型：OpenAPI 3 取 content 的第一个键，Swagger 2 从 examples 推断
        let media_type = response
            .get("content")
            .and_then(|c| c.as_object())
            .and_then(|o| o.keys().next())
            .or_else(|| {
                response
                    .get("examples")
                    .and_then(|e| e.as_object())
                    .and_then(|o| o.keys().next())
            })
            .cloned();
        let content_type = map_content_type(media_type.as_deref().unwrap_or(""));

        // OpenAPI 3 从 content[media].schema 取；Swagger 2 直接放在 response.schema
        let json_schema = media_type
            .as_deref()
            .and_then(|mt| response.get("content")?.get(mt))
            .and_then(|c| c.get("schema"))
            .cloned()
            .or_else(|| response.get("schema").cloned());

        let description = response
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        // 名称优先级：x-apifox-name → description → HTTP {code}，不再把整段描述拼进名字
        let name = response
            .get("x-apifox-name")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .or(Some(description).filter(|s| !s.is_empty()))
            .map(str::to_string)
            .unwrap_or_else(|| format!("HTTP {}", status_code));

        result.push(serde_json::json!({
            "id": Uuid::new_v4().to_string(),
            "code": code,
            "name": name,
            "description": description,
            "contentType": content_type,
            "jsonSchema": json_schema,
        }));
    }

    Value::Array(result)
}

/// 接口状态：优先 Apifox 扩展，未知值降级为 designing。
fn api_status(operation: &Value) -> &str {
    operation
        .get("x-apifox-status")
        .and_then(|v| v.as_str())
        .filter(|s| API_STATUSES.contains(s))
        .unwrap_or("designing")
}

/// Apifox 的 `x-apifox-folder` 形如 `A/B/C`，按 `/` 拆分出目录层级。
fn split_folder_path(folder: &str) -> Vec<String> {
    folder
        .split('/')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// 逐段确保目录存在，返回最深一级目录 id（无层级时返回 None）。
/// 同级同名目录直接复用，保证重复导入不产生重复目录。
/// 导入过程中的可变上下文：排序号、目录路径缓存、查重索引。
///
/// 收拢成结构体而不是给每个函数加参数 —— 参数超过 7 个后调用点已经读不出
/// 「谁负责改什么」。
pub(crate) struct ImportCtx {
    pub(crate) sort_order: i32,
    /// 来源标识（文件名 / 上游项目名），参与幂等键：不同来源互不覆盖
    pub(crate) source: String,
    /// 目录全路径 → 目录 id，避免同一条路径反复解析
    pub(crate) folder_cache: HashMap<String, String>,
    /// 一次性建立的查重索引
    pub(crate) index: menu_repo::MenuIndex,
}

fn ensure_folder_path(
    conn: &Connection,
    project_id: &str,
    segments: &[String],
    description: &str,
    ctx: &mut ImportCtx,
) -> Result<Option<String>, AppError> {
    let mut parent_id: Option<String> = None;
    let mut key = String::new();

    for segment in segments {
        if !key.is_empty() {
            key.push('/');
        }
        key.push_str(segment);

        if let Some(cached) = ctx.folder_cache.get(&key) {
            parent_id = Some(cached.clone());
            continue;
        }

        let source = ctx.source.clone();
        let folder_id = match ctx
            .index
            .menu_id(&source, parent_id.as_deref(), "apiDetailFolder", segment)
            .map(str::to_string)
        {
            Some(id) => id,
            None => {
                let id = Uuid::new_v4().to_string();
                let payload = CreateMenuItemPayload {
                    id: id.clone(),
                    parent_id: parent_id.clone(),
                    name: segment.clone(),
                    menu_type: "apiDetailFolder".to_string(),
                    data_json: Some(serde_json::json!({
                        "name": segment,
                        "description": description,
                        "source": source,
                    })),
                    run_tab_json: None,
                    sort_order: Some(ctx.sort_order),
                };
                menu_repo::create_menu_item_conn(conn, project_id, &payload)?;
                ctx.sort_order += 1;
                id
            }
        };
        ctx.index.remember_menu(
            &source,
            parent_id.as_deref(),
            "apiDetailFolder",
            segment,
            &folder_id,
        );
        ctx.folder_cache.insert(key.clone(), folder_id.clone());
        parent_id = Some(folder_id);
    }

    Ok(parent_id)
}

/// 解析接口归属目录：优先 `x-apifox-folder`，其次第一个 tag（两者都可能是 `A/B/C`）。
fn resolve_parent_folder(
    conn: &Connection,
    project_id: &str,
    operation: &Value,
    op_tags: &[String],
    tags_info: &[TagInfo],
    ctx: &mut ImportCtx,
) -> Result<Option<String>, AppError> {
    let folder_path = operation
        .get("x-apifox-folder")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .or_else(|| op_tags.first().cloned());
    let Some(folder_path) = folder_path else {
        return Ok(None);
    };
    let description = tags_info
        .iter()
        .find(|t| t.name == folder_path)
        .map(|t| t.description.clone())
        .unwrap_or_default();
    ensure_folder_path(
        conn,
        project_id,
        &split_folder_path(&folder_path),
        &description,
        ctx,
    )
}

/// 待入库的接口数据（OpenAPI 3 / Swagger 2 共用）。
struct ImportedApi<'a> {
    path: &'a str,
    method: &'a str,
    name: String,
    description: String,
    tags: &'a [String],
    status: &'a str,
    parent_id: Option<String>,
    parameters: Value,
    request_body: Value,
    responses: Value,
}

/// 按 method + path 幂等写入接口：命中则覆盖内容并保留原 id / createdAt，未命中才新建。
fn upsert_api_detail(
    conn: &Connection,
    project_id: &str,
    api: ImportedApi<'_>,
    now: &str,
    ctx: &mut ImportCtx,
) -> Result<(), AppError> {
    // 查重走一次性建立的索引，不再每条全表扫描 + 解析 data_json
    let source = ctx.source.clone();
    let existing = ctx
        .index
        .api_entry(&source, api.method, api.path)
        .map(|(id, created_at)| (id.to_string(), created_at.map(str::to_string)));
    let (api_id, created_at) = match &existing {
        Some((id, created_at)) => (
            id.clone(),
            created_at.clone().unwrap_or_else(|| now.to_string()),
        ),
        None => (Uuid::new_v4().to_string(), now.to_string()),
    };

    let data_json = serde_json::json!({
        "id": api_id,
        "method": api.method.to_uppercase(),
        "path": api.path,
        "name": api.name,
        "status": api.status,
        "description": api.description,
        "tags": api.tags,
        "parameters": api.parameters,
        "requestBody": api.request_body,
        "responses": api.responses,
        "createdAt": created_at,
        "updatedAt": now,
        "source": source,
    });

    match existing {
        Some((item_id, _)) => {
            let mut updates = serde_json::json!({ "name": api.name, "data": data_json });
            // 只有明确归属目录时才移动，避免把已有归位信息清空
            if api.parent_id.is_some() {
                updates["parentId"] = serde_json::json!(api.parent_id);
            }
            menu_repo::update_menu_item_conn(conn, project_id, &item_id, &updates)?;
        }
        None => {
            ctx.index
                .remember_api(&source, api.method, api.path, &api_id, Some(now));
            let payload = CreateMenuItemPayload {
                id: api_id,
                parent_id: api.parent_id,
                name: api.name,
                menu_type: "apiDetail".to_string(),
                data_json: Some(data_json),
                run_tab_json: None,
                sort_order: Some(ctx.sort_order),
            };
            menu_repo::create_menu_item_conn(conn, project_id, &payload)?;
            ctx.sort_order += 1;
        }
    }

    Ok(())
}

/// Import an OpenAPI 3.x document
fn import_openapi3(
    conn: &Connection,
    project_id: &str,
    doc: &Value,
    ctx: &mut ImportCtx,
) -> Result<(), AppError> {
    let paths = doc.get("paths").and_then(|v| v.as_object());
    let tags_info = extract_tags(doc);
    let now = now_iso();

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

                let parent_id = resolve_parent_folder(
                    conn,
                    project_id,
                    operation,
                    &op_tags,
                    &tags_info,
                    ctx,
                )?;

                upsert_api_detail(
                    conn,
                    project_id,
                    ImportedApi {
                        path: path_str,
                        method,
                        name: op_name,
                        description,
                        tags: &op_tags,
                        status: api_status(operation),
                        parent_id,
                        parameters: build_openapi_parameters(path_item, operation),
                        request_body: build_openapi_request_body(operation),
                        responses: build_openapi_responses(operation),
                    },
                    &now,
                    ctx,
                )?;
            }
        }
    }

    // Import schemas/components from OpenAPI 3.x
    if let Some(schemas) = doc.get("components").and_then(|c| c.get("schemas")).and_then(|s| s.as_object()) {
        import_schemas(conn, project_id, schemas, ctx)?;
    }

    Ok(())
}

/// Import a Swagger 2.0 document
fn import_swagger2(
    conn: &Connection,
    project_id: &str,
    doc: &Value,
    ctx: &mut ImportCtx,
) -> Result<(), AppError> {
    let paths = doc.get("paths").and_then(|v| v.as_object());
    let tags_info = extract_tags(doc);
    let now = now_iso();

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

                let parent_id = resolve_parent_folder(
                    conn,
                    project_id,
                    operation,
                    &op_tags,
                    &tags_info,
                    ctx,
                )?;

                upsert_api_detail(
                    conn,
                    project_id,
                    ImportedApi {
                        path: path_str,
                        method,
                        name: op_name,
                        description,
                        tags: &op_tags,
                        status: api_status(operation),
                        parent_id,
                        // Swagger 2.0 的 body/formData 参数同样在 parameters 数组里
                        parameters: build_openapi_parameters(path_item, operation),
                        request_body: build_swagger2_request_body(doc, operation),
                        responses: build_openapi_responses(operation),
                    },
                    &now,
                    ctx,
                )?;
            }
        }
    }

    // Import schemas/definitions from Swagger 2.0
    if let Some(definitions) = doc.get("definitions").and_then(|d| d.as_object()) {
        import_schemas(conn, project_id, definitions, ctx)?;
    }

    Ok(())
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
    conn: &Connection,
    project_id: &str,
    schemas: &serde_json::Map<String, Value>,
    ctx: &mut ImportCtx,
) -> Result<(), AppError> {
    for (name, schema) in schemas {
        let data_json = serde_json::json!({
            "jsonSchema": schema,
            "source": ctx.source,
        });

        // 按名称幂等：同名模型覆盖内容，不重复新建（走索引，不逐条查库）
        let source = ctx.source.clone();
        match ctx
            .index
            .menu_id(&source, None, "apiSchema", name)
            .map(str::to_string)
        {
            Some(item_id) => {
                let updates = serde_json::json!({ "name": name, "data": data_json });
                menu_repo::update_menu_item_conn(conn, project_id, &item_id, &updates)?;
            }
            None => {
                let id = Uuid::new_v4().to_string();
                ctx.index.remember_menu(&source, None, "apiSchema", name, &id);
                let payload = CreateMenuItemPayload {
                    id,
                    parent_id: None,
                    name: name.clone(),
                    menu_type: "apiSchema".to_string(),
                    data_json: Some(data_json),
                    run_tab_json: None,
                    sort_order: Some(ctx.sort_order),
                };
                menu_repo::create_menu_item_conn(conn, project_id, &payload)?;
                ctx.sort_order += 1;
            }
        }
    }

    Ok(())
}

/// Detect document type and import accordingly
fn detect_and_import(
    db: &Db,
    project_id: &str,
    doc: &Value,
    source: Option<&str>,
) -> Result<ProjectStateSnapshot, AppError> {
    // 查重索引在事务外建：一次扫表，事务里只查内存
    let mut ctx = ImportCtx {
        sort_order: 0,
        source: source.unwrap_or_default().trim().to_string(),
        folder_cache: HashMap::new(),
        index: menu_repo::build_menu_index(db, project_id)?,
    };

    // 整批写入放进一个事务：逐条提交时每条都要 fsync，慢盘上能把一次导入
    // 拖成几十秒；一个事务只 fsync 一次。中途失败整体回滚，不留半套数据。
    let native = import_native::is_native_document(doc);
    {
        let mut guard = db.0.lock().unwrap();
        let tx = guard.transaction()?;
        let conn: &Connection = &tx;

        // Apifox 原生格式放最前面：它没有 openapi / swagger / paths 键，不会与其它格式混淆
        if native {
            import_native::import_native(conn, project_id, doc, &mut ctx)?;
        } else if doc.get("openapi").is_some() || doc.get("paths").is_some() {
            import_openapi3(conn, project_id, doc, &mut ctx)?;
        } else if doc.get("swagger").is_some() {
            import_swagger2(conn, project_id, doc, &mut ctx)?;
        } else {
            return Err(AppError::BadRequest(
                "不支持的文档格式，仅支持 Apifox 原生格式、OpenAPI 3.x、Swagger 2.0 格式".into(),
            ));
        }

        tx.commit()?;
    }

    // 全局变量与环境：Apifox 导出里 environments 恒为空（环境需另外取数注入），
    // 全局变量只有部分项目有。save_project_environments 内部会取 db 锁，
    // 必须放在事务外调用。
    if native {
        let variables = import_native::native_global_variables(doc);
        let environments = import_native::native_environments(doc);
        if !variables.is_empty() || !environments.is_empty() {
            let mut config =
                project_repo::get_project_state(db, project_id)?.project_environment_config;
            if !variables.is_empty() {
                config.global_variables =
                    import_native::merge_global_variables(config.global_variables, variables);
            }
            if !environments.is_empty() {
                config.environments =
                    import_native::merge_environments(config.environments, environments);
            }
            menu_repo::save_project_environments(db, project_id, &config)?;
        }
    }

    project_repo::get_project_state(db, project_id)
}

pub fn import_api_document(
    db: &Db,
    project_id: &str,
    format: &str,
    content: &str,
    source: Option<&str>,
) -> Result<ProjectStateSnapshot, AppError> {
    let doc = parse_content(content, format)?;
    detect_and_import(db, project_id, &doc, source)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_swagger2_response_schema_extraction() {
        let operation = json!({
            "responses": {
                "200": {
                    "description": "成功",
                    "schema": {
                        "$ref": "#/definitions/UserResponse",
                        "description": "用户信息"
                    }
                },
                "400": {
                    "description": "参数错误",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "code": { "type": "integer" },
                            "message": { "type": "string" }
                        }
                    }
                }
            }
        });

        let result = build_openapi_responses(&operation);
        let arr = result.as_array().unwrap();
        assert_eq!(arr.len(), 2, "应该有 2 个 response");

        let resp200 = &arr[0];
        assert_eq!(resp200["code"], 200);
        assert!(resp200["jsonSchema"].is_object(), "Swagger 2.0 response schema 不能为 null");
        assert_eq!(resp200["jsonSchema"]["$ref"], "#/definitions/UserResponse");

        let resp400 = &arr[1];
        assert_eq!(resp400["code"], 400);
        assert!(resp400["jsonSchema"].is_object());
        assert_eq!(resp400["jsonSchema"]["type"], "object");
        assert_eq!(resp400["jsonSchema"]["properties"]["code"]["type"], "integer");
    }

    #[test]
    fn test_openapi3_response_schema_extraction() {
        let operation = json!({
            "responses": {
                "200": {
                    "description": "成功",
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": "#/components/schemas/Pet"
                            }
                        }
                    }
                }
            }
        });

        let result = build_openapi_responses(&operation);
        let arr = result.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        let resp = &arr[0];
        assert_eq!(resp["code"], 200);
        assert_eq!(resp["contentType"], "json");
        assert!(resp["jsonSchema"].is_object(), "OpenAPI 3.x response schema 不能为 null");
        assert_eq!(resp["jsonSchema"]["$ref"], "#/components/schemas/Pet");
    }

    #[test]
    fn test_response_without_schema_returns_null() {
        let operation = json!({
            "responses": {
                "204": {
                    "description": "No Content"
                }
            }
        });

        let result = build_openapi_responses(&operation);
        let arr = result.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert!(arr[0]["jsonSchema"].is_null(), "无 schema 时应为 null");
    }

    #[test]
    fn test_swagger2_response_with_examples() {
        let operation = json!({
            "responses": {
                "200": {
                    "description": "成功",
                    "examples": {
                        "application/json": {
                            "code": 0,
                            "data": { "name": "test" }
                        }
                    }
                }
            }
        });

        let result = build_openapi_responses(&operation);
        let arr = result.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["contentType"], "json");
        // examples 中只有示例数据，没有 schema
        assert!(arr[0]["jsonSchema"].is_null());
    }

    #[test]
    fn openapi_parameters_keep_schema_types() {
        let path_item = json!({});
        let operation = json!({
            "parameters": [
                { "name": "id", "in": "query", "schema": { "type": "integer" } },
                { "name": "flag", "in": "query", "schema": { "type": "boolean" } },
                { "name": "legacy", "in": "query", "type": "number" },
                { "name": "unsupported", "in": "query", "schema": { "type": "object" } }
            ]
        });

        let result = build_openapi_parameters(&path_item, &operation);
        let query = result["query"].as_array().unwrap();
        assert_eq!(query[0]["type"], "integer");
        assert_eq!(query[1]["type"], "boolean");
        assert_eq!(query[2]["type"], "number");
        assert_eq!(query[3]["type"], "string", "不在 ParamType 集合内应降级为 string");
    }

    #[test]
    fn response_name_priority_and_description_kept() {
        let operation = json!({
            "responses": {
                "200": { "description": "成功描述", "x-apifox-name": "成功" },
                "401": { "description": "未授权" },
                "500": {}
            }
        });

        let arr = build_openapi_responses(&operation);
        let arr = arr.as_array().unwrap();
        assert_eq!(arr[0]["name"], "成功");
        assert_eq!(arr[0]["description"], "成功描述");
        assert_eq!(arr[1]["name"], "未授权");
        assert_eq!(arr[2]["name"], "HTTP 500");
        assert_eq!(arr[2]["description"], "");
    }

    #[test]
    fn request_body_keeps_required_description_and_examples() {
        let operation = json!({
            "requestBody": {
                "required": true,
                "description": "创建参数",
                "content": {
                    "application/json": {
                        "schema": { "type": "object" },
                        "example": { "name": "Tom" }
                    }
                }
            }
        });

        let body = build_openapi_request_body(&operation);
        assert_eq!(body["type"], "application/json");
        assert_eq!(body["required"], true);
        assert_eq!(body["description"], "创建参数");
        assert_eq!(body["examples"][0]["value"]["name"], "Tom");
    }

    #[test]
    fn request_body_examples_map_is_flattened() {
        let operation = json!({
            "requestBody": {
                "content": {
                    "application/json": {
                        "schema": { "type": "object" },
                        "examples": {
                            "示例一": { "value": { "id": 1 } },
                            "示例二": { "value": { "id": 2 } }
                        }
                    }
                }
            }
        });

        let body = build_openapi_request_body(&operation);
        let examples = body["examples"].as_array().unwrap();
        assert_eq!(examples.len(), 2);
        assert!(examples.iter().any(|e| e["name"] == "示例一" && e["value"]["id"] == 1));
    }

    #[test]
    fn apifox_status_maps_or_defaults() {
        assert_eq!(
            api_status(&json!({ "x-apifox-status": "released" })),
            "released"
        );
        assert_eq!(
            api_status(&json!({ "x-apifox-status": "unknown" })),
            "designing"
        );
        assert_eq!(api_status(&json!({})), "designing");
    }

    #[test]
    fn folder_path_splits_on_slash() {
        assert_eq!(split_folder_path("A/B/C"), vec!["A", "B", "C"]);
        assert!(split_folder_path(" / ").is_empty());
    }

    fn test_db() -> Db {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::client::create_tables(&conn);
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1', 'tester', 'x', '2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, owner_id, created_at) VALUES ('p1', 'demo', 'u1', '2026-01-01')",
            [],
        )
        .unwrap();
        Db(std::sync::Mutex::new(conn))
    }

    fn sample_doc() -> Value {
        json!({
            "openapi": "3.0.0",
            "paths": {
                "/a/b": {
                    "post": {
                        "summary": "创建",
                        "x-apifox-folder": "A/B/C",
                        "x-apifox-status": "released",
                        "responses": {
                            "200": { "description": "成功", "x-apifox-name": "成功" }
                        }
                    }
                }
            },
            "components": {
                "schemas": { "Pet": { "type": "object" } }
            }
        })
    }

    #[test]
    fn import_builds_nested_folders_and_is_idempotent() {
        let db = test_db();
        let content = sample_doc().to_string();

        let first = import_api_document(&db, "p1", "json", &content, Some("test-src")).unwrap();
        let second = import_api_document(&db, "p1", "json", &content, Some("test-src")).unwrap();
        assert_eq!(
            second.menu_raw_list.len(),
            first.menu_raw_list.len(),
            "同一文档重复导入不应新增菜单项"
        );

        let items = &second.menu_raw_list;
        let folder = |name: &str| {
            items
                .iter()
                .find(|i| i.menu_type == "apiDetailFolder" && i.name == name)
                .unwrap_or_else(|| panic!("缺少目录 {name}"))
        };
        let a = folder("A");
        let b = folder("B");
        let c = folder("C");
        assert_eq!(a.parent_id, None, "A 位于根级");
        assert_eq!(b.parent_id.as_deref(), Some(a.id.as_str()));
        assert_eq!(c.parent_id.as_deref(), Some(b.id.as_str()));

        let api = items.iter().find(|i| i.menu_type == "apiDetail").unwrap();
        assert_eq!(api.parent_id.as_deref(), Some(c.id.as_str()), "接口挂在最深一级目录");
        let data = api.data_json.as_ref().unwrap();
        assert_eq!(data["status"], "released");
        assert_eq!(data["responses"][0]["name"], "成功");
        assert_eq!(data["responses"][0]["contentType"], "json");
    }

    #[test]
    fn import_then_export_keeps_apifox_extensions() {
        let db = test_db();
        import_api_document(&db, "p1", "json", &sample_doc().to_string(), Some("test-src")).unwrap();

        let state = project_repo::get_project_state(&db, "p1").unwrap();
        let spec = crate::commands::exports::build_export_spec(&state.menu_raw_list, true, None);
        let op = &spec["paths"]["/a/b"]["post"];
        assert_eq!(op["x-apifox-folder"], "A/B/C");
        assert_eq!(op["x-apifox-status"], "released");
        assert_eq!(op["responses"]["200"]["x-apifox-name"], "成功");
    }

    #[test]
    fn reimport_updates_existing_interface_in_place() {
        let db = test_db();
        let mut doc = sample_doc();
        import_api_document(&db, "p1", "json", &doc.to_string(), Some("test-src")).unwrap();
        let first_id = {
            let state = project_repo::get_project_state(&db, "p1").unwrap();
            state
                .menu_raw_list
                .iter()
                .find(|i| i.menu_type == "apiDetail")
                .unwrap()
                .id
                .clone()
        };

        doc["paths"]["/a/b"]["post"]["summary"] = json!("创建(更新)");
        import_api_document(&db, "p1", "json", &doc.to_string(), Some("test-src")).unwrap();

        let state = project_repo::get_project_state(&db, "p1").unwrap();
        let api = state
            .menu_raw_list
            .iter()
            .find(|i| i.menu_type == "apiDetail")
            .unwrap();
        assert_eq!(api.id, first_id, "同 method+path 应保留原 id");
        assert_eq!(api.name, "创建(更新)", "内容应被更新");
    }

    /// 原生格式导入时，环境与全局变量一并写入 environmentConfig。
    #[test]
    fn native_import_writes_environments_and_global_variables() {
        let db = test_db();
        let doc = json!({
            "apifoxProject": "1.0.0",
            "info": { "name": "demo" },
            "apiCollection": [{
                "name": "根目录",
                "id": 1,
                "items": [{
                    "name": "示例接口",
                    "api": { "id": 100, "method": "get", "path": "/a", "responses": [] }
                }]
            }],
            "schemaCollection": [],
            "environments": [
                {
                    "id": 802349,
                    "name": "test-php",
                    "baseUrls": { "default": "https://manage-test.kaisaile.org" }
                }
            ],
            "globalVariables": [
                { "id": "g1", "variables": [{ "name": "restcore", "value": "/index.php/RestCore" }] }
            ]
        });

        let state = import_api_document(&db, "p1", "json", &doc.to_string(), Some("src-a")).unwrap();
        let config = &state.project_environment_config;

        assert_eq!(config.environments.len(), 1, "环境应写入 environmentConfig");
        assert_eq!(config.environments[0]["name"], "test-php");
        assert_eq!(
            config.environments[0]["url"],
            "https://manage-test.kaisaile.org"
        );
        assert_eq!(config.global_variables.len(), 1, "全局变量应写入 environmentConfig");
        assert_eq!(config.global_variables[0]["name"], "restcore");
    }

    /// 不同来源的同名接口 / 目录 / 模型互不覆盖（幂等键含来源维度）。
    #[test]
    fn different_sources_do_not_overwrite_each_other() {
        let db = test_db();
        let content = sample_doc().to_string();

        import_api_document(&db, "p1", "json", &content, Some("src-a")).unwrap();
        import_api_document(&db, "p1", "json", &content, Some("src-b")).unwrap();

        let state = project_repo::get_project_state(&db, "p1").unwrap();
        let apis = state
            .menu_raw_list
            .iter()
            .filter(|i| i.menu_type == "apiDetail")
            .count();
        let folders = state
            .menu_raw_list
            .iter()
            .filter(|i| i.menu_type == "apiDetailFolder")
            .count();

        assert_eq!(apis, 2, "两个来源的同名接口应各自入库，不互相覆盖");
        assert_eq!(folders, 6, "两个来源的目录树应各自完整");
    }

    /// 计费用例（不参与常规测试）：对比「逐条查重」与「一次性索引」的耗时。
    ///
    /// cargo test --lib import_dedupe_cost -- --ignored --nocapture
    ///
    /// 断言只校验索引查得准；耗时仅打印 —— 时间断言在 CI 上必然不稳。
    #[test]
    #[ignore]
    fn import_dedupe_cost() {
        use std::time::Instant;

        let db = test_db();
        let n = 800;
        for i in 0..n {
            let payload = CreateMenuItemPayload {
                id: format!("api-{i}"),
                parent_id: None,
                name: format!("api {i}"),
                menu_type: "apiDetail".to_string(),
                data_json: Some(json!({
                    "method": "GET",
                    "path": format!("/p/{i}"),
                    "responses": [{
                        "code": 200,
                        "name": "成功",
                        "jsonSchema": {
                            "type": "object",
                            "properties": {
                                "a": { "type": "string" },
                                "b": { "type": "integer" }
                            }
                        }
                    }]
                })),
                run_tab_json: None,
                sort_order: Some(i),
            };
            menu_repo::create_menu_item(&db, "p1", &payload).unwrap();
        }

        let t0 = Instant::now();
        for i in 0..n {
            let found =
                menu_repo::find_api_by_path_method(&db, "p1", &format!("/p/{i}"), "GET").unwrap();
            assert!(found.is_some());
        }
        let per_call = t0.elapsed();

        let t1 = Instant::now();
        let index = menu_repo::build_menu_index(&db, "p1").unwrap();
        for i in 0..n {
            assert!(index.api_entry("", "GET", &format!("/p/{i}")).is_some());
        }
        let indexed = t1.elapsed();

        println!("N={n}  逐条查重 {per_call:?}  一次性索引 {indexed:?}");
        assert_eq!(
            index.api_entry("", "GET", "/p/0").map(|(id, _)| id.to_string()),
            Some("api-0".to_string())
        );
    }
}
