//! Apifox 原生格式（`apifox export --format apifox`）导入器。
//!
//! 与 OpenAPI 导入器的差异（实测 8 个项目 / 649 个接口）：
//!
//! - 路径原样保留 `{{变量}}` 占位符，base url 变量语义不丢；
//! - 目录树完整（含空目录），OpenAPI 只能靠 `x-apifox-folder` 推断出一级目录；
//! - 同 `method + path` 可以有多个接口（实测 41 个），OpenAPI 的 map 结构表达不了。
//!
//! 因此接口的身份用 Apifox 内部 id（`api.id`）而不是 `method + path`：
//! 后者会把同路径的多个接口合并成一个。

use std::collections::HashMap;

use rusqlite::Connection;
use serde_json::{json, Map, Value};
use uuid::Uuid;

use crate::db::menu_repo;
use crate::errors::AppError;
use crate::models::CreateMenuItemPayload;
use crate::services::import_service::{now_iso, ImportCtx, API_STATUSES};

/// 原生格式文档的判定：顶层有 `apiCollection` 或 `apifoxProject`。
/// 原生格式没有 `openapi` / `swagger` / `paths` 键，与 OpenAPI 文档不会混淆。
pub(crate) fn is_native_document(doc: &Value) -> bool {
    doc.get("apiCollection").is_some() || doc.get("apifoxProject").is_some()
}

/// 参数类型映射到前端 `ParamType` 枚举；原生用 `text` 表示字符串，其余同名。
fn param_type(raw: Option<&str>) -> &'static str {
    match raw {
        Some("integer") => "integer",
        Some("boolean") => "boolean",
        Some("number") => "number",
        Some("array") => "array",
        Some("file") => "file",
        _ => "string",
    }
}

/// 原生响应内容类型 → 前端 `ContentType` 枚举；`noContent` 归到 raw。
fn content_type(raw: Option<&str>) -> &'static str {
    match raw {
        Some("xml") => "xml",
        Some("html") => "html",
        Some("raw") => "raw",
        Some("binary") => "binary",
        Some("noContent") => "raw",
        _ => "json",
    }
}

/// 原生请求体类型 → 前端 `BodyType` 枚举（原生取值本来就是 BodyType 的值）。
fn body_type(raw: Option<&str>) -> &'static str {
    match raw {
        Some("application/json") => "application/json",
        Some("multipart/form-data") => "multipart/form-data",
        Some("application/x-www-form-urlencoded") => "application/x-www-form-urlencoded",
        Some("application/xml") | Some("text/xml") => "application/xml",
        Some("text/plain") => "text/plain",
        Some("application/octet-stream") => "application/octet-stream",
        _ => "none",
    }
}

/// 接口状态：原生值落在 `ApiStatus` 枚举内才用，否则降级为 designing。
fn api_status(raw: Option<&str>) -> &str {
    match raw {
        Some(s) if API_STATUSES.contains(&s) => s,
        _ => "designing",
    }
}

/// 参数对象：原生四组参数（path / query / header / cookie）转成前端 `Parameter`。
fn build_parameters(api: &Value) -> Value {
    let Some(groups) = api.get("parameters").and_then(|v| v.as_object()) else {
        return Value::Null;
    };

    let mut result = Map::new();
    for group in ["path", "query", "header", "cookie"] {
        let Some(list) = groups.get(group).and_then(|v| v.as_array()) else {
            continue;
        };
        if list.is_empty() {
            continue;
        }
        let items: Vec<Value> = list.iter().map(build_parameter).collect();
        result.insert(group.to_string(), Value::Array(items));
    }

    if result.is_empty() {
        Value::Null
    } else {
        Value::Object(result)
    }
}

/// 单个参数：类型可能放在 `type` 或 `schema.type` 上，缺失时降级为 string。
fn build_parameter(param: &Value) -> Value {
    let raw_type = param.get("type").and_then(|v| v.as_str()).or_else(|| {
        param
            .get("schema")
            .and_then(|s| s.get("type"))
            .and_then(|v| v.as_str())
    });

    let mut item = Map::new();
    item.insert(
        "id".into(),
        json!(param
            .get("id")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| Uuid::new_v4().to_string())),
    );
    item.insert(
        "name".into(),
        json!(param.get("name").and_then(|v| v.as_str()).unwrap_or("")),
    );
    item.insert(
        "description".into(),
        json!(param
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")),
    );
    item.insert(
        "required".into(),
        json!(param
            .get("required")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)),
    );
    item.insert(
        "enable".into(),
        json!(param
            .get("enable")
            .and_then(|v| v.as_bool())
            .unwrap_or(true)),
    );
    item.insert("type".into(), json!(param_type(raw_type)));
    if let Some(example) = param.get("example") {
        if !example.is_null() {
            item.insert("example".into(), example.clone());
        }
    }
    Value::Object(item)
}

/// 请求体：原生 requestBody → 前端 `ApiRequestBody`。
fn build_request_body(api: &Value) -> Value {
    let Some(rb) = api.get("requestBody") else {
        return Value::Null;
    };

    let mut body = Map::new();
    body.insert(
        "type".into(),
        json!(body_type(rb.get("type").and_then(|v| v.as_str()))),
    );

    if let Some(list) = rb.get("parameters").and_then(|v| v.as_array()) {
        if !list.is_empty() {
            body.insert(
                "parameters".into(),
                Value::Array(list.iter().map(build_parameter).collect()),
            );
        }
    }
    if let Some(schema) = rb.get("jsonSchema") {
        if !schema.is_null() {
            body.insert("jsonSchema".into(), schema.clone());
        }
    }
    if let Some(required) = rb.get("required").and_then(|v| v.as_bool()) {
        body.insert("required".into(), json!(required));
    }
    if let Some(description) = rb
        .get("description")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        body.insert("description".into(), json!(description));
    }
    if let Some(examples) = rb.get("examples").and_then(|v| v.as_array()) {
        if !examples.is_empty() {
            body.insert(
                "examples".into(),
                Value::Array(
                    examples
                        .iter()
                        .enumerate()
                        .map(|(i, ex)| {
                            json!({
                                "name": ex
                                    .get("description")
                                    .and_then(|v| v.as_str())
                                    .filter(|s| !s.is_empty())
                                    .map(str::to_string)
                                    .unwrap_or_else(|| format!("示例 {}", i + 1)),
                                "value": parse_example_value(ex.get("value")),
                            })
                        })
                        .collect(),
                ),
            );
        }
    }

    Value::Object(body)
}

/// 原生示例值是 JSON 文本，能解析就解析成对象，解析不了保留原字符串。
fn parse_example_value(value: Option<&Value>) -> Value {
    match value {
        Some(Value::String(text)) => {
            serde_json::from_str::<Value>(text).unwrap_or_else(|_| Value::String(text.clone()))
        }
        Some(other) => other.clone(),
        None => Value::Null,
    }
}

/// 响应数组：原生 responses → 前端 `ApiDetailsResponse`。
///
/// TODO: `referencedResponseId` 指向 `responseCollection` 里的共享响应，
/// 本轮未导入共享响应实体，这类响应只有状态码没有 schema。
fn build_responses(api: &Value) -> Value {
    let Some(list) = api.get("responses").and_then(|v| v.as_array()) else {
        return Value::Array(vec![]);
    };

    let items: Vec<Value> = list
        .iter()
        .map(|r| {
            json!({
                "id": r.get("id")
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
                    .unwrap_or_else(|| Uuid::new_v4().to_string()),
                "code": r.get("code").and_then(|v| v.as_i64()).unwrap_or(200),
                "name": r.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                "description": r.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                "contentType": content_type(r.get("contentType").and_then(|v| v.as_str())),
                "jsonSchema": r.get("jsonSchema").cloned().unwrap_or(Value::Null),
            })
        })
        .collect();

    Value::Array(items)
}

/// 收集模型节点：原生模型 id（`#/definitions/数字`）→ 模型名。
/// 原生 `$ref` 指向数字 id，前端按 `$ref` 末段匹配模型名，必须重写。
fn collect_model_ref_map(doc: &Value) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Some(collection) = doc.get("schemaCollection").and_then(|v| v.as_array()) else {
        return map;
    };

    fn walk(nodes: &[Value], map: &mut HashMap<String, String>) {
        for node in nodes {
            if let (Some(id), Some(name)) = (
                node.get("id").and_then(|v| v.as_str()),
                node.get("name").and_then(|v| v.as_str()),
            ) {
                map.insert(id.to_string(), name.to_string());
            }
            if let Some(children) = node.get("items").and_then(|v| v.as_array()) {
                walk(children, map);
            }
        }
    }

    for root in collection {
        if let Some(items) = root.get("items").and_then(|v| v.as_array()) {
            walk(items, &mut map);
        }
    }
    map
}

/// 递归重写 `$ref`：命中模型映射的换成 `#/definitions/<模型名>`。
fn rewrite_refs(value: &mut Value, map: &HashMap<String, String>) {
    match value {
        Value::Object(obj) => {
            let ref_value = obj.get("$ref").and_then(|v| v.as_str()).map(str::to_string);
            if let Some(reference) = ref_value {
                if let Some(name) = map.get(&reference) {
                    obj.insert(
                        "$ref".into(),
                        Value::String(format!("#/definitions/{name}")),
                    );
                }
            }
            for child in obj.values_mut() {
                rewrite_refs(child, map);
            }
        }
        Value::Array(items) => {
            for item in items.iter_mut() {
                rewrite_refs(item, map);
            }
        }
        _ => {}
    }
}

/// 节点 id：Apifox 里目录 id 是数字、接口 id 是字符串，统一成字符串。
fn node_id(node: &Value) -> Option<String> {
    match node.get("id") {
        Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}

/// 原生节点身份索引：来源 + Apifox 节点 id → 菜单项 id。
///
/// 接口按 Apifox 接口 id 认，目录按 Apifox 目录 id 认：
/// 原生格式允许同 `method + path` 存在多个接口（实测 41 个），也允许同级出现
/// 同名目录（实测 manage.yoursclass 有 2 对），用路径 / 名字做键会把它们合并掉。
/// 模型仍按名字认：Apifox 的模型名在项目内唯一。
struct NativeIndex {
    /// 接口：来源 + Apifox 接口 id → (菜单项 id, createdAt)
    apis: HashMap<(String, String), (String, Option<String>)>,
    /// 目录：来源 + Apifox 目录 id → 菜单项 id
    folders: HashMap<(String, String), String>,
}

impl NativeIndex {
    fn load(conn: &Connection, project_id: &str) -> Result<Self, AppError> {
        let mut stmt = conn.prepare(
            "SELECT id, type,
                    COALESCE(json_extract(data_json, '$.source'), ''),
                    json_extract(data_json, '$.apifoxApiId'),
                    json_extract(data_json, '$.apifoxFolderId'),
                    json_extract(data_json, '$.createdAt')
             FROM menu_items
             WHERE project_id = ?1
               AND type IN ('apiDetail', 'apiDetailFolder', 'apiSchemaFolder')",
        )?;
        let rows = stmt.query_map(rusqlite::params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })?;

        let mut index = Self {
            apis: HashMap::new(),
            folders: HashMap::new(),
        };
        for row in rows {
            let (id, menu_type, source, apifox_id, apifox_folder_id, created_at) = row?;
            if menu_type == "apiDetail" {
                if let Some(apifox_id) = apifox_id {
                    index
                        .apis
                        .entry((source, apifox_id))
                        .or_insert((id, created_at));
                }
            } else if let Some(apifox_folder_id) = apifox_folder_id {
                index
                    .folders
                    .entry((source, apifox_folder_id))
                    .or_insert(id);
            }
        }
        Ok(index)
    }

    fn api_entry(&self, source: &str, apifox_id: &str) -> Option<(&str, Option<&str>)> {
        self.apis
            .get(&(source.to_string(), apifox_id.to_string()))
            .map(|(id, created_at)| (id.as_str(), created_at.as_deref()))
    }

    fn remember_api(&mut self, source: &str, apifox_id: &str, id: &str, created_at: Option<&str>) {
        self.apis
            .entry((source.to_string(), apifox_id.to_string()))
            .or_insert_with(|| (id.to_string(), created_at.map(str::to_string)));
    }

    fn folder_entry(&self, source: &str, apifox_folder_id: &str) -> Option<&str> {
        self.folders
            .get(&(source.to_string(), apifox_folder_id.to_string()))
            .map(String::as_str)
    }

    fn remember_folder(&mut self, source: &str, apifox_folder_id: &str, id: &str) {
        self.folders
            .entry((source.to_string(), apifox_folder_id.to_string()))
            .or_insert_with(|| id.to_string());
    }
}

/// 原生导入过程的可变状态。
struct NativeImport<'a> {
    conn: &'a Connection,
    project_id: &'a str,
    /// 原生 $ref → 模型名
    ref_map: HashMap<String, String>,
    /// 原生节点身份索引
    index: NativeIndex,
    /// 无 id 接口的兜底计数（同 method+path 第几次出现）
    fallback_counter: HashMap<(String, String), u32>,
    now: String,
}

/// 导入 Apifox 原生格式文档。
pub(crate) fn import_native(
    conn: &Connection,
    project_id: &str,
    doc: &Value,
    ctx: &mut ImportCtx,
) -> Result<(), AppError> {
    let mut importer = NativeImport {
        conn,
        project_id,
        ref_map: collect_model_ref_map(doc),
        index: NativeIndex::load(conn, project_id)?,
        fallback_counter: HashMap::new(),
        now: now_iso(),
    };

    if let Some(collection) = doc.get("apiCollection").and_then(|v| v.as_array()) {
        for root in collection {
            // 根目录本身不落库，它的子节点才是顶层目录 / 顶层接口
            let items: &[Value] = root
                .get("items")
                .and_then(|v| v.as_array())
                .map_or(&[], |v| v.as_slice());
            importer.import_api_nodes(items, None, ctx)?;
        }
    }

    importer.import_models(doc, ctx)?;

    Ok(())
}

impl<'a> NativeImport<'a> {
    /// 遍历目录树节点：带 `api` 的是接口，其余是目录。
    fn import_api_nodes(
        &mut self,
        nodes: &[Value],
        parent_id: Option<&str>,
        ctx: &mut ImportCtx,
    ) -> Result<(), AppError> {
        for node in nodes {
            if node.get("api").is_some() {
                self.import_api(node, parent_id, ctx)?;
            } else {
                let folder_id = self.ensure_folder(node, parent_id, ctx)?;
                if let Some(children) = node.get("items").and_then(|v| v.as_array()) {
                    self.import_api_nodes(children, Some(&folder_id), ctx)?;
                }
            }
        }
        Ok(())
    }

    /// 目录：按 Apifox 目录 id 复用（同名同级目录各自分开，不合并）。
    /// 没有原生 id 的目录退回「来源 + 父级 + 类型 + 名字」的幂等键。
    fn ensure_folder(
        &mut self,
        node: &Value,
        parent_id: Option<&str>,
        ctx: &mut ImportCtx,
    ) -> Result<String, AppError> {
        let name = node
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let description = node
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let source = ctx.source.clone();
        let native_id = node_id(node);

        if let Some(native_id) = &native_id {
            if let Some(id) = self.index.folder_entry(&source, native_id) {
                return Ok(id.to_string());
            }
        } else if let Some(id) = ctx
            .index
            .menu_id(&source, parent_id, "apiDetailFolder", &name)
        {
            return Ok(id.to_string());
        }

        let id = Uuid::new_v4().to_string();
        let mut data = Map::new();
        data.insert("name".into(), json!(name));
        data.insert("description".into(), json!(description));
        data.insert("source".into(), json!(source));
        if let Some(native_id) = &native_id {
            data.insert("apifoxFolderId".into(), json!(native_id));
        }
        let payload = CreateMenuItemPayload {
            id: id.clone(),
            parent_id: parent_id.map(str::to_string),
            name: name.clone(),
            menu_type: "apiDetailFolder".to_string(),
            data_json: Some(Value::Object(data)),
            run_tab_json: None,
            sort_order: Some(ctx.sort_order),
        };
        menu_repo::create_menu_item_conn(self.conn, self.project_id, &payload)?;
        ctx.sort_order += 1;
        if let Some(native_id) = &native_id {
            self.index.remember_folder(&source, native_id, &id);
        }
        ctx.index
            .remember_menu(&source, parent_id, "apiDetailFolder", &name, &id);
        Ok(id)
    }

    /// 接口：按 Apifox 内部 id 幂等写入。
    fn import_api(
        &mut self,
        node: &Value,
        parent_id: Option<&str>,
        ctx: &mut ImportCtx,
    ) -> Result<(), AppError> {
        let Some(api) = node.get("api") else {
            return Ok(());
        };

        let name = node
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let method = api
            .get("method")
            .and_then(|v| v.as_str())
            .unwrap_or("get")
            .to_uppercase();
        let path = api
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let source = ctx.source.clone();

        // 身份：优先 Apifox 内部 id；缺失时退回 method+path（同路径第几次出现）
        let identity = match node_id(api) {
            Some(id) => id,
            _ => {
                let counter = self
                    .fallback_counter
                    .entry((method.clone(), path.clone()))
                    .or_insert(0);
                *counter += 1;
                format!("{method} {path}#{counter}")
            }
        };

        let existing = self
            .index
            .api_entry(&source, &identity)
            .map(|(id, at)| (id.to_string(), at.map(str::to_string)));
        let (api_id, created_at) = match &existing {
            Some((id, created_at)) => (
                id.clone(),
                created_at.clone().unwrap_or_else(|| self.now.clone()),
            ),
            None => (Uuid::new_v4().to_string(), self.now.clone()),
        };

        let mut request_body = build_request_body(api);
        rewrite_refs(&mut request_body, &self.ref_map);
        let mut responses = build_responses(api);
        rewrite_refs(&mut responses, &self.ref_map);

        let mut data = Map::new();
        data.insert("id".into(), json!(api_id));
        data.insert("method".into(), json!(method));
        data.insert("path".into(), json!(path));
        data.insert("name".into(), json!(name));
        data.insert(
            "status".into(),
            json!(api_status(api.get("status").and_then(|v| v.as_str()))),
        );
        data.insert(
            "description".into(),
            json!(api
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")),
        );
        data.insert(
            "tags".into(),
            api.get("tags")
                .cloned()
                .unwrap_or_else(|| Value::Array(vec![])),
        );
        data.insert("parameters".into(), build_parameters(api));
        data.insert("requestBody".into(), request_body);
        data.insert("responses".into(), responses);
        data.insert("createdAt".into(), json!(created_at));
        data.insert("updatedAt".into(), json!(self.now));
        data.insert("source".into(), json!(source));
        data.insert("apifoxApiId".into(), json!(identity));
        if let Some(operation_id) = api
            .get("operationId")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            data.insert("operationId".into(), json!(operation_id));
        }
        let data_json = Value::Object(data);

        match existing {
            Some((item_id, _)) => {
                let mut updates = json!({ "name": name, "data": data_json });
                // 只有明确归属目录时才移动，避免把已有归位信息清空
                if let Some(parent_id) = parent_id {
                    updates["parentId"] = json!(parent_id);
                }
                menu_repo::update_menu_item_conn(self.conn, self.project_id, &item_id, &updates)?;
            }
            None => {
                let payload = CreateMenuItemPayload {
                    id: api_id.clone(),
                    parent_id: parent_id.map(str::to_string),
                    name,
                    menu_type: "apiDetail".to_string(),
                    data_json: Some(data_json),
                    run_tab_json: None,
                    sort_order: Some(ctx.sort_order),
                };
                menu_repo::create_menu_item_conn(self.conn, self.project_id, &payload)?;
                ctx.sort_order += 1;
                self.index
                    .remember_api(&source, &identity, &api_id, Some(&self.now));
            }
        }

        Ok(())
    }

    /// 数据模型：`schemaCollection` 的叶子节点是模型，中间层是模型目录。
    fn import_models(&mut self, doc: &Value, ctx: &mut ImportCtx) -> Result<(), AppError> {
        let Some(collection) = doc.get("schemaCollection").and_then(|v| v.as_array()) else {
            return Ok(());
        };
        for root in collection {
            let items: &[Value] = root
                .get("items")
                .and_then(|v| v.as_array())
                .map_or(&[], |v| v.as_slice());
            self.import_model_nodes(items, None, ctx)?;
        }
        Ok(())
    }

    fn import_model_nodes(
        &mut self,
        nodes: &[Value],
        parent_id: Option<&str>,
        ctx: &mut ImportCtx,
    ) -> Result<(), AppError> {
        for node in nodes {
            let name = node
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue;
            }

            if let Some(schema) = node.get("schema").and_then(|s| s.get("jsonSchema")) {
                let mut schema = schema.clone();
                rewrite_refs(&mut schema, &self.ref_map);
                let data_json = json!({
                    "jsonSchema": schema,
                    "source": ctx.source,
                });
                self.upsert_model(&name, parent_id, data_json, ctx)?;
            } else if let Some(children) = node.get("items").and_then(|v| v.as_array()) {
                let folder_id = self.ensure_model_folder(node, &name, parent_id, ctx)?;
                self.import_model_nodes(children, Some(&folder_id), ctx)?;
            }
        }
        Ok(())
    }

    /// 模型目录（`schemaCollection` 的中间层）：按 Apifox 节点 id 复用。
    fn ensure_model_folder(
        &mut self,
        node: &Value,
        name: &str,
        parent_id: Option<&str>,
        ctx: &mut ImportCtx,
    ) -> Result<String, AppError> {
        let source = ctx.source.clone();
        let native_id = node_id(node);

        if let Some(native_id) = &native_id {
            if let Some(id) = self.index.folder_entry(&source, native_id) {
                return Ok(id.to_string());
            }
        } else if let Some(id) = ctx
            .index
            .menu_id(&source, parent_id, "apiSchemaFolder", name)
        {
            return Ok(id.to_string());
        }

        let id = Uuid::new_v4().to_string();
        let mut data = Map::new();
        data.insert("name".into(), json!(name));
        data.insert("description".into(), json!(""));
        data.insert("source".into(), json!(source));
        if let Some(native_id) = &native_id {
            data.insert("apifoxFolderId".into(), json!(native_id));
        }
        let payload = CreateMenuItemPayload {
            id: id.clone(),
            parent_id: parent_id.map(str::to_string),
            name: name.to_string(),
            menu_type: "apiSchemaFolder".to_string(),
            data_json: Some(Value::Object(data)),
            run_tab_json: None,
            sort_order: Some(ctx.sort_order),
        };
        menu_repo::create_menu_item_conn(self.conn, self.project_id, &payload)?;
        ctx.sort_order += 1;
        if let Some(native_id) = &native_id {
            self.index.remember_folder(&source, native_id, &id);
        }
        ctx.index
            .remember_menu(&source, parent_id, "apiSchemaFolder", name, &id);
        Ok(id)
    }

    /// 模型：同名同级模型覆盖内容，不重复新建。
    fn upsert_model(
        &mut self,
        name: &str,
        parent_id: Option<&str>,
        data_json: Value,
        ctx: &mut ImportCtx,
    ) -> Result<(), AppError> {
        let source = ctx.source.clone();
        match ctx
            .index
            .menu_id(&source, parent_id, "apiSchema", name)
            .map(str::to_string)
        {
            Some(item_id) => {
                let updates = json!({ "name": name, "data": data_json });
                menu_repo::update_menu_item_conn(self.conn, self.project_id, &item_id, &updates)?;
            }
            None => {
                let id = Uuid::new_v4().to_string();
                ctx.index
                    .remember_menu(&source, parent_id, "apiSchema", name, &id);
                let payload = CreateMenuItemPayload {
                    id,
                    parent_id: parent_id.map(str::to_string),
                    name: name.to_string(),
                    menu_type: "apiSchema".to_string(),
                    data_json: Some(data_json),
                    run_tab_json: None,
                    sort_order: Some(ctx.sort_order),
                };
                menu_repo::create_menu_item_conn(self.conn, self.project_id, &payload)?;
                ctx.sort_order += 1;
            }
        }
        Ok(())
    }
}

/// 全局变量：原生 `globalVariables[].variables[]` → 前端 `ApiEnvironmentValue`。
///
/// 原生导出里 `environments` 恒为空数组（两种方向的导出都不含环境数据），
/// 所以环境只能由 `apifox environment list` 单独取，本轮不导入。
/// 提取原生文档里的环境列表，映射成 ApiMocktle 的 `ApiEnvironment`。
///
/// Apifox 的两种导出**都不含环境数据**（实测 `environments` 恒为空数组），
/// 需要用 `apifox environment list` 单独取回后注入本字段，再走同一条导入路径。
///
/// 映射：Apifox `{id, name, baseUrls:{default}, parameters:{...}}`
/// → ApiMocktle `{id, name, url, baseUrls:[{id,url}], variables, parameters}`
pub(crate) fn native_environments(doc: &Value) -> Vec<Value> {
    let Some(envs) = doc.get("environments").and_then(|v| v.as_array()) else {
        return vec![];
    };

    envs
        .iter()
        .filter_map(|env| {
            let name = env.get("name").and_then(|v| v.as_str())?;
            let id = match env.get("id") {
                Some(Value::String(s)) => s.clone(),
                Some(v) => v.to_string(),
                None => Uuid::new_v4().to_string(),
            };
            let base_urls = env.get("baseUrls").and_then(|v| v.as_object());
            let default_url = base_urls
                .and_then(|m| m.get("default"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let base_url_list: Vec<Value> = base_urls
                .map(|m| {
                    m.iter()
                        .map(|(k, v)| json!({ "id": k, "url": v.as_str().unwrap_or("") }))
                        .collect()
                })
                .unwrap_or_default();

            Some(json!({
                "id": id,
                "name": name,
                "url": default_url,
                "baseUrls": base_url_list,
                "variables": [],
                "parameters": {
                    "header": [],
                    "cookie": [],
                    "query": [],
                    "body": []
                }
            }))
        })
        .collect()
}

/// 同名环境按新值替换，没有则追加。
pub(crate) fn merge_environments(mut existing: Vec<Value>, imported: Vec<Value>) -> Vec<Value> {
    for item in imported {
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
        match existing
            .iter_mut()
            .find(|slot| slot.get("name").and_then(|v| v.as_str()) == Some(name))
        {
            Some(slot) => *slot = item,
            None => existing.push(item),
        }
    }
    existing
}

pub(crate) fn native_global_variables(doc: &Value) -> Vec<Value> {
    let Some(groups) = doc.get("globalVariables").and_then(|v| v.as_array()) else {
        return vec![];
    };

    let mut result = vec![];
    for group in groups {
        let Some(variables) = group.get("variables").and_then(|v| v.as_array()) else {
            continue;
        };
        for variable in variables {
            let Some(name) = variable.get("name").and_then(|v| v.as_str()) else {
                continue;
            };
            let value = variable
                .get("value")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .or_else(|| variable.get("initialValue").and_then(|v| v.as_str()))
                .unwrap_or("");
            result.push(json!({
                "id": variable
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
                    .unwrap_or_else(|| Uuid::new_v4().to_string()),
                "name": name,
                "value": value,
                "enable": true,
            }));
        }
    }
    result
}

/// 全局变量合并：同名以导入的为准，其余保留项目里已有的。
pub(crate) fn merge_global_variables(mut existing: Vec<Value>, imported: Vec<Value>) -> Vec<Value> {
    for item in imported {
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
        match existing
            .iter_mut()
            .find(|slot| slot.get("name").and_then(|v| v.as_str()) == Some(name))
        {
            Some(slot) => *slot = item,
            None => existing.push(item),
        }
    }
    existing
}

#[cfg(test)]
mod tests {
    /// 环境映射：Apifox 环境 → ApiMocktle 的 ApiEnvironment。
    #[test]
    fn native_environments_are_mapped() {
        let doc = json!({
            "environments": [
                {
                    "id": 802349,
                    "name": "test-php",
                    "baseUrls": { "default": "https://manage-test.kaisaile.org" },
                    "parameters": { "cookie": [], "query": [], "header": [], "body": [] }
                },
                { "id": 2741630, "name": "云端 Mock", "baseUrls": { "default": "" }, "parameters": {} }
            ]
        });

        let envs = native_environments(&doc);
        assert_eq!(envs.len(), 2);
        assert_eq!(envs[0]["name"], "test-php");
        assert_eq!(envs[0]["id"], "802349", "数字 id 应转成字符串");
        assert_eq!(envs[0]["url"], "https://manage-test.kaisaile.org");
        assert_eq!(envs[0]["baseUrls"][0]["url"], "https://manage-test.kaisaile.org");
        assert_eq!(envs[1]["url"], "", "空 base url 也要保留环境");
    }

    /// 同名环境覆盖、不同名追加。
    #[test]
    fn merge_environments_replaces_by_name() {
        let existing = vec![json!({ "id": "1", "name": "dev", "url": "https://old" })];
        let imported = vec![
            json!({ "id": "2", "name": "dev", "url": "https://new" }),
            json!({ "id": "3", "name": "prod", "url": "https://prod" }),
        ];

        let merged = merge_environments(existing, imported);
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0]["url"], "https://new", "同名环境应被新值替换");
        assert_eq!(merged[1]["name"], "prod");
    }

    use super::*;
    use crate::db::client::Db;
    use crate::db::project_repo;
    use serde_json::json;

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

    fn new_ctx(db: &Db, source: &str) -> ImportCtx {
        ImportCtx {
            sort_order: 0,
            source: source.to_string(),
            folder_cache: HashMap::new(),
            index: menu_repo::build_menu_index(db, "p1").unwrap(),
        }
    }

    fn import_doc(db: &Db, doc: &Value, source: &str) {
        let mut ctx = new_ctx(db, source);
        let conn = db.0.lock().unwrap();
        import_native(&conn, "p1", doc, &mut ctx).unwrap();
    }

    /// 目录：根 > 一级 > 二级，接口挂在二级目录下。
    fn sample_doc() -> Value {
        json!({
            "apifoxProject": { "id": "1", "name": "demo" },
            "apiCollection": [{
                "id": 100,
                "name": "根目录",
                "parentId": 0,
                "items": [
                    {
                        "id": 200,
                        "name": "一级目录",
                        "parentId": 0,
                        "items": [
                            {
                                "id": 300,
                                "name": "二级目录",
                                "parentId": 200,
                                "items": [
                                    {
                                        "name": "接口A",
                                        "api": {
                                            "id": "9001",
                                            "method": "post",
                                            "path": "/{{base}}/api/a",
                                            "description": "说明",
                                            "status": "released",
                                            "tags": ["分组"],
                                            "operationId": "opA",
                                            "parameters": {
                                                "path": [],
                                                "query": [
                                                    { "name": "q", "required": true, "description": "关键字", "type": "text", "id": "p1", "example": "x" },
                                                    { "name": "n", "required": false, "description": "", "type": "integer", "id": "p2" }
                                                ],
                                                "cookie": [],
                                                "header": []
                                            },
                                            "requestBody": {
                                                "type": "application/json",
                                                "parameters": [],
                                                "examples": [{ "value": "{\"a\":1}", "mediaType": "application/json", "description": "" }]
                                            },
                                            "responses": [
                                                { "id": "r1", "code": 200, "name": "成功", "contentType": "json", "jsonSchema": { "type": "object" } },
                                                { "id": "r2", "code": 401, "name": "未授权", "contentType": "json", "jsonSchema": { "type": "object" } }
                                            ]
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }],
            "schemaCollection": [{
                "id": 1,
                "name": "根目录",
                "items": [
                    {
                        "id": 2,
                        "name": "模型目录",
                        "items": [
                            {
                                "name": "User",
                                "id": "#/definitions/12345",
                                "schema": { "jsonSchema": { "type": "object", "properties": { "id": { "type": "integer" } } } }
                            }
                        ]
                    },
                    {
                        "name": "Order",
                        "id": "#/definitions/67890",
                        "schema": { "jsonSchema": { "type": "object", "properties": { "user": { "$ref": "#/definitions/12345" } } } }
                    }
                ]
            }],
            "globalVariables": [
                { "id": "1", "variables": [
                    { "name": "base", "value": "/index.php", "description": "", "initialValue": "/index.php", "isBindInitial": false, "isSync": true }
                ] }
            ],
            "environments": []
        })
    }

    #[test]
    fn directory_tree_parent_ids_are_correct() {
        let db = test_db();
        import_doc(&db, &sample_doc(), "src-a");

        let state = project_repo::get_project_state(&db, "p1").unwrap();
        let folder = |name: &str| {
            state
                .menu_raw_list
                .iter()
                .find(|i| i.menu_type == "apiDetailFolder" && i.name == name)
                .unwrap_or_else(|| panic!("缺少目录 {name}"))
                .id
                .clone()
        };
        let one = folder("一级目录");
        let two = folder("二级目录");

        let state = project_repo::get_project_state(&db, "p1").unwrap();
        let api = state
            .menu_raw_list
            .iter()
            .find(|i| i.menu_type == "apiDetail")
            .unwrap();
        assert_eq!(
            api.parent_id.as_deref(),
            Some(two.as_str()),
            "接口挂在二级目录下"
        );

        let two_item = state.menu_raw_list.iter().find(|i| i.id == two).unwrap();
        assert_eq!(two_item.parent_id.as_deref(), Some(one.as_str()));
        let one_item = state.menu_raw_list.iter().find(|i| i.id == one).unwrap();
        assert_eq!(one_item.parent_id, None, "一级目录在根级");
    }

    #[test]
    fn api_fields_are_mapped() {
        let db = test_db();
        import_doc(&db, &sample_doc(), "src-a");

        let state = project_repo::get_project_state(&db, "p1").unwrap();
        let api = state
            .menu_raw_list
            .iter()
            .find(|i| i.menu_type == "apiDetail")
            .unwrap();
        let data = api.data_json.as_ref().unwrap();

        assert_eq!(data["method"], "POST");
        assert_eq!(
            data["path"], "/{{base}}/api/a",
            "路径里的 {{变量}} 必须原样保留"
        );
        assert_eq!(data["status"], "released");
        assert_eq!(data["tags"][0], "分组");
        assert_eq!(data["operationId"], "opA");
        assert_eq!(data["source"], "src-a");

        assert_eq!(
            data["responses"].as_array().unwrap().len(),
            2,
            "多响应都要保留"
        );
        assert_eq!(data["responses"][0]["name"], "成功");
        assert_eq!(data["responses"][0]["contentType"], "json");
        assert_eq!(data["responses"][1]["code"], 401);

        let query = data["parameters"]["query"].as_array().unwrap();
        assert_eq!(query[0]["type"], "string", "原生 text 降级为 string");
        assert_eq!(query[0]["required"], true);
        assert_eq!(query[1]["type"], "integer");

        assert_eq!(data["requestBody"]["type"], "application/json");
        assert_eq!(data["requestBody"]["examples"][0]["value"]["a"], 1);
    }

    #[test]
    fn model_ref_is_rewritten_to_model_name() {
        let db = test_db();
        import_doc(&db, &sample_doc(), "src-a");

        let state = project_repo::get_project_state(&db, "p1").unwrap();
        let order = state
            .menu_raw_list
            .iter()
            .find(|i| i.menu_type == "apiSchema" && i.name == "Order")
            .unwrap();
        let data = order.data_json.as_ref().unwrap();
        // 读出时 properties 已归一成数组（后端 normalize_json_schema）
        let props = data["jsonSchema"]["properties"].as_array().unwrap();
        let user = props.iter().find(|p| p["name"] == "user").unwrap();
        assert_eq!(
            user["$ref"], "#/definitions/User",
            "原生数字 id 必须重写成模型名"
        );

        // 模型目录单独落一个 apiSchemaFolder
        assert!(state
            .menu_raw_list
            .iter()
            .any(|i| i.menu_type == "apiSchemaFolder" && i.name == "模型目录"));
    }

    #[test]
    fn import_is_idempotent() {
        let db = test_db();
        let doc = sample_doc();
        import_doc(&db, &doc, "src-a");
        let first = project_repo::get_project_state(&db, "p1").unwrap();
        import_doc(&db, &doc, "src-a");
        let second = project_repo::get_project_state(&db, "p1").unwrap();

        assert_eq!(
            second.menu_raw_list.len(),
            first.menu_raw_list.len(),
            "同一文档重复导入不应新增菜单项"
        );
    }

    #[test]
    fn different_sources_do_not_overwrite_each_other() {
        let db = test_db();
        let doc = sample_doc();
        import_doc(&db, &doc, "src-a");
        import_doc(&db, &doc, "src-b");

        let state = project_repo::get_project_state(&db, "p1").unwrap();
        let apis = state
            .menu_raw_list
            .iter()
            .filter(|i| i.menu_type == "apiDetail")
            .count();
        assert_eq!(apis, 2, "两个来源的同名接口应各自入库");
    }

    #[test]
    fn duplicate_method_path_interfaces_are_both_kept() {
        let db = test_db();
        let mut doc = sample_doc();
        let api = doc["apiCollection"][0]["items"][0]["items"][0]["items"][0]["api"].clone();
        let mut twin = api.clone();
        twin["id"] = json!("9002");
        doc["apiCollection"][0]["items"][0]["items"][0]["items"] =
            json!([{"name": "接口A", "api": api}, {"name": "接口A副本", "api": twin}]);

        import_doc(&db, &doc, "src-a");
        let state = project_repo::get_project_state(&db, "p1").unwrap();
        let apis = state
            .menu_raw_list
            .iter()
            .filter(|i| i.menu_type == "apiDetail")
            .count();
        assert_eq!(apis, 2, "同 method+path 的两个接口都要保留");

        // 再导一次仍然是 2 个
        import_doc(&db, &doc, "src-a");
        let state = project_repo::get_project_state(&db, "p1").unwrap();
        let apis = state
            .menu_raw_list
            .iter()
            .filter(|i| i.menu_type == "apiDetail")
            .count();
        assert_eq!(apis, 2, "重复导入不能把同路径接口合并掉");
    }

    #[test]
    fn global_variables_are_extracted() {
        let doc = sample_doc();
        let vars = native_global_variables(&doc);
        assert_eq!(vars.len(), 1);
        assert_eq!(vars[0]["name"], "base");
        assert_eq!(vars[0]["value"], "/index.php");
    }

    #[test]
    fn native_document_detection() {
        assert!(is_native_document(&sample_doc()));
        assert!(!is_native_document(
            &json!({ "openapi": "3.0.0", "paths": {} })
        ));
    }
}
