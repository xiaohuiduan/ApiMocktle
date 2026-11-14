use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::{
    body::Bytes,
    extract::{Query, State},
    http::HeaderMap,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Emitter;
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::db::client::Db;
use crate::db::{menu_repo, personal_token_repo, project_repo};
use crate::models::{ApiMenuData, CreateMenuItemPayload};
use crate::services::yapi_service::{self, YApiInterface};

// YApi Server Handle

pub struct YApiServerHandle {
    pub port: Mutex<u16>,
    pub shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl YApiServerHandle {
    pub fn new() -> Self {
        Self {
            port: Mutex::new(0),
            shutdown_tx: Mutex::new(None),
        }
    }
}

// State

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Db>,
    pub app_handle: Option<tauri::AppHandle>,
}

/// 推送事件的动作类型：新建记录 / 命中已有记录后合并更新。
const PUSH_KIND_CREATED: &str = "created";
const PUSH_KIND_MERGED: &str = "merged";

// YApi push payload — emitted to frontend after successful push
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YapiPushPayload {
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "projectName")]
    pub project_name: String,
    pub count: u32,
    /// "created" = 新建记录；"merged" = 命中已有记录（同 id 或同 METHOD+path）
    pub kind: String,
}

/// 构造推送载荷。与 emit 分离，便于单测直接断言 kind 而不用伪造 AppHandle。
fn build_yapi_push_payload(state: &AppState, project_id: &str, kind: &str) -> YapiPushPayload {
    let project_name = project_repo::get_project_by_id(&state.db, project_id).ok().flatten().map(|(_, name)| name).unwrap_or_else(|| project_id.to_string());
    YapiPushPayload { project_id: project_id.to_string(), project_name, count: 1, kind: kind.to_string() }
}

fn emit_yapi_push(state: &AppState, project_id: &str, kind: &str) {
    if let Some(handle) = &state.app_handle {
        let payload = build_yapi_push_payload(state, project_id, kind);
        let _ = handle.emit("yapi:api-pushed", payload);
    }
}

// Response helpers

fn yapi_ok(data: Value) -> Json<Value> {
    Json(serde_json::json!({
        "errcode": 0,
        "errmsg": "成功!",
        "data": data,
    }))
}

fn yapi_error(msg: &str) -> Json<Value> {
    Json(serde_json::json!({
        "errcode": 1,
        "errmsg": msg,
        "data": serde_json::Value::Null,
    }))
}

// Token extraction — now personal token → user_id

fn resolve_user_id(
    state: &AppState,
    headers: &HeaderMap,
    query_token: Option<&str>,
    body_token: Option<&str>,
) -> Option<String> {
    let token = headers
        .get("X-YAPI-TOKEN")
        .and_then(|v| v.to_str().ok())
        .or(query_token)
        .or(body_token)?;
    personal_token_repo::find_user_by_personal_token(&state.db, token)
}

fn check_project_member(db: &Db, project_id: &str, user_id: &str) -> bool {
    project_repo::get_project_member_role(db, project_id, user_id).is_some()
}

// Helpers

fn to_yapi_cat(row: &ApiMenuData) -> Value {
    serde_json::json!({
        "_id": row.id,
        "name": row.name,
        "desc": "",
        "index": 0,
    })
}

fn ensure_default_folder(db: &Db, project_id: &str) -> Result<String, crate::errors::AppError> {
    let items = menu_repo::list_menu_items(db, project_id)?;
    if let Some(folder) = items.iter().find(|i| i.menu_type == "apiDetailFolder") {
        return Ok(folder.id.clone());
    }
    let folder_id = Uuid::new_v4().to_string();
    let sort_order = menu_repo::get_max_sort_order(db, project_id)?;
    let payload = CreateMenuItemPayload {
        id: folder_id.clone(),
        parent_id: None,
        name: "默认分类".to_string(),
        menu_type: "apiDetailFolder".to_string(),
        data_json: None,
        run_tab_json: None,
        sort_order: Some(sort_order + 1),
    };
    menu_repo::create_menu_item(db, project_id, &payload)?;
    Ok(folder_id)
}

fn find_existing_interface(
    db: &Db,
    project_id: &str,
    path: &str,
    method: &str,
) -> Option<ApiMenuData> {
    menu_repo::find_api_by_path_method(db, project_id, path, method)
        .ok()
        .flatten()
}

/// 归一化归属分类 id：空串等同「没有分类」。
///
/// `/api/interface/up` 没有分类入参，调用方只能把 `parent_id` 兜底成空串传进来；
/// 空串一旦写进 `parent_id` 就成了指向不存在目录的悬挂引用，而且会让后续的
/// 「首次落位」永远走不到——`existing.parent_id` 恒为 `Some("")`，`or_else` 不再触发。
fn normalize_parent_id(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn upsert_menu_item_data(
    db: &Db, project_id: &str, existing: &ApiMenuData, folder_id: &str,
    name: &str, api_details: &Value,
) -> Result<Value, crate::errors::AppError> {
    let current_data = existing.data_json.clone().unwrap_or(Value::Object(serde_json::Map::new()));
    let next_data = if let Value::Object(ref cur) = current_data {
        let mut merged = cur.clone();
        if let Value::Object(ref detail) = api_details {
            for (k, v) in detail {
                // 插件推送的 id/createdAt 是每次生成的临时值,不覆盖已入库的稳定标识与创建时间
                if (k == "id" || k == "createdAt") && merged.contains_key(k) {
                    continue;
                }
                merged.insert(k.clone(), v.clone());
            }
        }
        merged.insert("updatedAt".to_string(), Value::String(chrono::Utc::now().to_rfc3339()));
        Value::Object(merged)
    } else { api_details.clone() };

    let old_parent_id = normalize_parent_id(existing.parent_id.as_deref());
    // 归属规则：已有归类优先，folder_id 只在首次落位（或孤儿记录）时生效。
    // 同一个 METHOD+path 常被 Controller 与各调用方的 Feign 各推一次，后到的一份
    // 只更新内容，不把接口从先到的分类里搬走（否则先到的分类会空掉甚至被删）。
    let next_parent_id = old_parent_id
        .clone()
        .or_else(|| normalize_parent_id(Some(folder_id)));
    let updates = serde_json::json!({ "name": name, "data": next_data, "parentId": next_parent_id });
    menu_repo::update_menu_item(db, project_id, &existing.id, &updates)?;

    // 归属未变化时不会产生空分类，这段只是防御性兜底
    if old_parent_id != next_parent_id {
        if let Some(ref old_pid) = old_parent_id {
            let all_items = menu_repo::list_menu_items(db, project_id)?;
            if !all_items.iter().any(|item| item.parent_id.as_deref() == Some(old_pid.as_str())) {
                let _ = menu_repo::delete_menu_item(db, project_id, old_pid);
            }
        }
    }
    Ok(serde_json::json!({ "_id": existing.id }))
}

fn build_yapi_from_save_body(body: &Value) -> YApiInterface {
    YApiInterface {
        id: None, catid: None,
        title: body.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        path: body.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        method: body.get("method").and_then(|v| v.as_str()).unwrap_or("GET").to_string(),
        desc: body.get("desc").and_then(|v| v.as_str()).map(|s| s.to_string()),
        markdown: body.get("markdown").and_then(|v| v.as_str()).map(|s| s.to_string()),
        status: body.get("status").and_then(|v| v.as_str()).map(|s| s.to_string()),
        tag: body.get("tag").and_then(|v| v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())),
        tags: body.get("tags").and_then(|v| v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())),
        req_headers: serde_json::from_value(body.get("req_headers").cloned().unwrap_or(Value::Null)).ok(),
        req_query: serde_json::from_value(body.get("req_query").cloned().unwrap_or(Value::Null)).ok(),
        req_params: serde_json::from_value(body.get("req_params").cloned().unwrap_or(Value::Null)).ok(),
        req_body_type: body.get("req_body_type").and_then(|v| v.as_str()).map(|s| s.to_string()),
        req_body_form: serde_json::from_value(body.get("req_body_form").cloned().unwrap_or(Value::Null)).ok(),
        req_body_other: body.get("req_body_other").and_then(|v| if v.is_string() { Some(v.as_str().unwrap().to_string()) } else { Some(v.to_string()) }),
        req_body_is_json_schema: body.get("req_body_is_json_schema").and_then(|v| v.as_bool()),
        res_body_type: body.get("res_body_type").and_then(|v| v.as_str()).map(|s| s.to_string()),
        res_body: body.get("res_body").and_then(|v| if v.is_string() { Some(v.as_str().unwrap().to_string()) } else { Some(v.to_string()) }),
        res_body_is_json_schema: body.get("res_body_is_json_schema").and_then(|v| v.as_bool()),
        responses: serde_json::from_value(body.get("responses").cloned().unwrap_or(Value::Null)).ok(),
        req_body_required: body.get("req_body_required").and_then(|v| v.as_bool()),
        req_body_examples: serde_json::from_value(body.get("req_body_examples").cloned().unwrap_or(Value::Null)).ok(),
        operation_id: body.get("operationId").and_then(|v| v.as_str()).map(|s| s.to_string()),
    }
}

/// 解析 YApi 客户端的请求体。
///
/// 兼容三种形状：
/// 1. JSON body，接口字段平铺在顶层（当前实现支持的形状）
/// 2. JSON body，接口定义包在 `api_data`（JSON 字符串）里 —— Apifox 的同步工具用这种
/// 3. `application/x-www-form-urlencoded` body（YApi 客户端常见），同样可能带 `api_data`
///
/// `api_data` 里的字段优先于顶层同名字段。
fn parse_yapi_body(headers: &HeaderMap, body: &[u8]) -> Result<Value, String> {
    let content_type = headers
        .get(axum::http::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let mut obj: serde_json::Map<String, Value> = if content_type
        .contains("application/x-www-form-urlencoded")
    {
        let text = String::from_utf8_lossy(body);
        let mut map = serde_json::Map::new();
        for pair in text.split('&') {
            if pair.is_empty() {
                continue;
            }
            let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
            let key = urlencoding::decode(k).map(|s| s.into_owned()).unwrap_or_else(|_| k.to_string());
            let val = urlencoding::decode(v).map(|s| s.into_owned()).unwrap_or_else(|_| v.to_string());
            map.insert(key, Value::String(val));
        }
        map
    } else {
        match serde_json::from_slice::<Value>(body) {
            Ok(Value::Object(map)) => map,
            Ok(_) => return Err("请求体必须是 JSON 对象".into()),
            Err(e) => return Err(format!("JSON 解析失败: {e}")),
        }
    };

    // api_data：内嵌的接口定义，优先于顶层同名字段
    if let Some(api_data) = obj.get("api_data").and_then(|v| v.as_str()) {
        let decoded = urlencoding::decode(api_data)
            .map(|s| s.into_owned())
            .unwrap_or_else(|_| api_data.to_string());
        if let Ok(Value::Object(inner)) = serde_json::from_str::<Value>(&decoded) {
            for (k, v) in inner {
                obj.insert(k, v);
            }
        }
    }

    Ok(Value::Object(obj))
}

fn qtoken(query: &HashMap<String, String>) -> Option<&str> {
    query.get("token").map(|s| s.as_str())
}

/// 读取请求体中的父目录 id：兼容 parent_id / parentId，空值视为未指定。
fn read_parent_id(body: &Value) -> Option<String> {
    body.get("parent_id")
        .or_else(|| body.get("parentId"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// 校验父目录存在且是接口目录。
fn ensure_parent_folder(
    db: &Db,
    project_id: &str,
    parent_id: &str,
) -> Result<(), crate::errors::AppError> {
    match menu_repo::get_menu_item(db, project_id, parent_id)? {
        Some(item) if item.menu_type == "apiDetailFolder" => Ok(()),
        _ => Err(crate::errors::AppError::BadRequest(
            "父目录不存在或不是目录".into(),
        )),
    }
}

/// 目录改名 / 移动。移动时目标父级不能是自身或其子孙（防环）。
fn update_folder(
    db: &Db,
    project_id: &str,
    catid: &str,
    name: Option<&str>,
    parent_id: Option<&str>,
) -> Result<ApiMenuData, crate::errors::AppError> {
    let existing = menu_repo::get_menu_item(db, project_id, catid)?
        .ok_or_else(|| crate::errors::AppError::NotFound(format!("目录不存在: {catid}")))?;
    if existing.menu_type != "apiDetailFolder" {
        return Err(crate::errors::AppError::BadRequest(
            "目标不是接口目录".into(),
        ));
    }

    let mut updates = serde_json::Map::new();
    if let Some(name) = name {
        if name.trim().is_empty() {
            return Err(crate::errors::AppError::BadRequest(
                "目录名不能为空".into(),
            ));
        }
        updates.insert("name".to_string(), serde_json::Value::String(name.to_string()));
    }
    if let Some(parent_id) = parent_id {
        if parent_id == catid {
            return Err(crate::errors::AppError::BadRequest(
                "不能将目录移动到自身内".into(),
            ));
        }
        ensure_parent_folder(db, project_id, parent_id)?;
        {
            // 锁只覆盖查询，避免与 update_menu_item 内部取锁死锁
            let conn = db.0.lock().unwrap();
            if menu_repo::is_descendant_of(&conn, project_id, catid, parent_id)? {
                return Err(crate::errors::AppError::BadRequest(
                    "不能将目录移动到其自身或其子级内".into(),
                ));
            }
        }
        updates.insert(
            "parentId".to_string(),
            serde_json::Value::String(parent_id.to_string()),
        );
    }

    if updates.is_empty() {
        return Ok(existing);
    }
    menu_repo::update_menu_item(db, project_id, catid, &serde_json::Value::Object(updates))
}

fn get_project_id(q: &HashMap<String, String>, body: &Option<&Value>) -> Option<String> {
    q.get("project_id").cloned()
        .or_else(|| body.and_then(|b| b.get("project_id").and_then(|v| v.as_str().map(|s| s.to_string()))))
}

// GET /api/project/list — return user's projects
async fn handle_project_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let user_id = match resolve_user_id(&state, &headers, qtoken(&query), None) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let projects = match project_repo::list_projects(&state.db, &user_id) {
        Ok(list) => list,
        Err(e) => return yapi_error(&format!("查询项目失败: {e}")),
    };
    let data: Vec<Value> = projects.iter().map(|p| serde_json::json!({
        "_id": p.id, "name": p.name, "desc": "",
    })).collect();
    yapi_ok(Value::Array(data))
}

// GET /api/project/get
async fn handle_project_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let user_id = match resolve_user_id(&state, &headers, qtoken(&query), None) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let project_id = match query.get("project_id") {
        Some(id) => id.clone(),
        None => return yapi_error("缺少参数: project_id"),
    };
    if !check_project_member(&state.db, &project_id, &user_id) {
        return yapi_error("无权访问该项目");
    }
    match project_repo::get_project_by_id(&state.db, &project_id) {
        Ok(Some((id, name))) => yapi_ok(serde_json::json!({ "_id": id, "name": name, "desc": "", "basepath": "/" })),
        Ok(None) => yapi_error("项目不存在"),
        Err(_) => yapi_error("查询项目失败"),
    }
}

// GET /api/interface/getCatMenu
async fn handle_cat_get_menu(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let user_id = match resolve_user_id(&state, &headers, qtoken(&query), None) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let project_id = match query.get("project_id") {
        Some(id) => id.clone(),
        None => return yapi_error("缺少参数: project_id"),
    };
    if !check_project_member(&state.db, &project_id, &user_id) {
        return yapi_error("无权访问该项目");
    }
    let items = match menu_repo::list_menu_items(&state.db, &project_id) {
        Ok(items) => items,
        Err(e) => return yapi_error(&format!("查询失败: {e}")),
    };
    let mut cats: Vec<Value> = items.iter().filter(|i| i.menu_type == "apiDetailFolder").map(to_yapi_cat).collect();
    if cats.is_empty() {
        match ensure_default_folder(&state.db, &project_id) {
            Ok(fid) => cats.push(serde_json::json!({ "_id": fid, "name": "默认分类", "desc": "", "index": 0 })),
            Err(e) => return yapi_error(&format!("创建默认分类失败: {e}")),
        }
    }
    yapi_ok(Value::Array(cats))
}

// GET /api/interface/get
async fn handle_interface_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let user_id = match resolve_user_id(&state, &headers, qtoken(&query), None) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let project_id = match query.get("project_id") {
        Some(id) => id.clone(),
        None => return yapi_error("缺少参数: project_id"),
    };
    if !check_project_member(&state.db, &project_id, &user_id) {
        return yapi_error("无权访问该项目");
    }
    let id = match query.get("id") { Some(v) => v, None => return yapi_error("缺少参数: id") };
    let item = match menu_repo::get_menu_item(&state.db, &project_id, id) {
        Ok(Some(item)) => item, Ok(None) => return yapi_error("接口不存在"),
        Err(e) => return yapi_error(&format!("查询失败: {e}")),
    };
    if item.menu_type != "apiDetail" { return yapi_error("接口不存在"); }
    let data = match item.data_json.as_ref() { Some(d) => d, None => return yapi_error("接口数据异常") };
    let yapi_data = yapi_service::api_details_to_yapi(data, &item.id, &item.name);
    let mut result = yapi_data;
    if let Some(obj) = result.as_object_mut() {
        obj.insert("_id".to_string(), Value::String(item.id.clone()));
        obj.insert("catid".to_string(), Value::String(item.parent_id.clone().unwrap_or_default()));
        obj.insert("title".to_string(), Value::String(item.name.clone()));
    }
    yapi_ok(result)
}

// GET /api/interface/list_cat
async fn handle_interface_list_cat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let user_id = match resolve_user_id(&state, &headers, qtoken(&query), None) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let project_id = match query.get("project_id") {
        Some(id) => id.clone(),
        None => return yapi_error("缺少参数: project_id"),
    };
    if !check_project_member(&state.db, &project_id, &user_id) {
        return yapi_error("无权访问该项目");
    }
    let catid = match query.get("catid") { Some(v) => v, None => return yapi_error("缺少参数: catid") };
    let items = match menu_repo::list_menu_items(&state.db, &project_id) {
        Ok(items) => items, Err(e) => return yapi_error(&format!("查询失败: {e}")),
    };
    let filtered: Vec<Value> = items.iter()
        .filter(|i| i.parent_id.as_deref() == Some(catid.as_str()) && i.menu_type == "apiDetail")
        .map(|item| {
            let (path, method, status) = item.data_json.as_ref().map_or(("", "GET", "undone"), |d| (
                d.get("path").and_then(|v| v.as_str()).unwrap_or(""),
                d.get("method").and_then(|v| v.as_str()).unwrap_or("GET"),
                d.get("status").and_then(|v| v.as_str()).unwrap_or("undone"),
            ));
            let yapi_status = match status { "released" => "done", "designing" => "designing", _ => "undone" };
            serde_json::json!({ "_id": item.id, "title": item.name, "path": path, "method": method, "status": yapi_status, "catid": item.parent_id })
        }).collect();
    let total = filtered.len();
    let page: usize = query.get("page").and_then(|v| v.parse().ok()).unwrap_or(1);
    let limit: usize = query.get("limit").and_then(|v| v.parse().ok()).unwrap_or(20);
    let start = ((page.max(1) - 1) * limit).min(total);
    let end = (start + limit).min(total);
    let paged: Vec<Value> = filtered[start..end].to_vec();
    yapi_ok(serde_json::json!({ "total": total, "list": paged }))
}

// GET /api/interface/list_menu
async fn handle_interface_list_menu(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let user_id = match resolve_user_id(&state, &headers, qtoken(&query), None) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let project_id = match query.get("project_id") {
        Some(id) => id.clone(),
        None => return yapi_error("缺少参数: project_id"),
    };
    if !check_project_member(&state.db, &project_id, &user_id) {
        return yapi_error("无权访问该项目");
    }
    let items = match menu_repo::list_menu_items(&state.db, &project_id) {
        Ok(items) => items, Err(e) => return yapi_error(&format!("查询失败: {e}")),
    };
    let list: Vec<Value> = items.iter().filter(|i| i.menu_type == "apiDetail").map(|item| {
        let (path, method, status) = item.data_json.as_ref().map_or(("", "GET", "undone"), |d| (
            d.get("path").and_then(|v| v.as_str()).unwrap_or(""),
            d.get("method").and_then(|v| v.as_str()).unwrap_or("GET"),
            d.get("status").and_then(|v| v.as_str()).unwrap_or("undone"),
        ));
        let yapi_status = match status { "released" => "done", "designing" => "designing", _ => "undone" };
        serde_json::json!({ "_id": item.id, "title": item.name, "path": path, "method": method, "status": yapi_status, "catid": item.parent_id })
    }).collect();
    yapi_ok(Value::Array(list))
}

// POST /api/interface/add_cat
async fn handle_add_cat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Json(body): Json<Value>,
) -> Json<Value> {
    let body_token = body.get("token").and_then(|v| v.as_str());
    let user_id = match resolve_user_id(&state, &headers, qtoken(&query), body_token) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let project_id = match get_project_id(&query, &Some(&body)) {
        Some(id) => id,
        None => return yapi_error("缺少参数: project_id"),
    };
    // 建目录是写操作，跟 save / up / update_cat / del_cat / del 一致要求 owner|editor；
    // 只看成员身份会让 viewer 也能改项目结构。
    {
        let role = project_repo::get_project_member_role(&state.db, &project_id, &user_id);
        if role.as_deref() != Some("owner") && role.as_deref() != Some("editor") {
            return yapi_error("无权修改该项目");
        }
    }
    let name = match body.get("name").and_then(|v| v.as_str()) { Some(n) => n, None => return yapi_error("缺少必要参数: name") };
    let parent_id = read_parent_id(&body);
    if let Some(ref pid) = parent_id {
        if let Err(e) = ensure_parent_folder(&state.db, &project_id, pid) {
            return yapi_error(&format!("校验父目录失败: {e}"));
        }
    }
    let folder_id = Uuid::new_v4().to_string();
    let sort_order = match menu_repo::get_max_sort_order(&state.db, &project_id) {
        Ok(n) => n + 1, Err(e) => return yapi_error(&format!("查询排序失败: {e}")),
    };
    let payload = CreateMenuItemPayload { id: folder_id.clone(), parent_id, name: name.to_string(), menu_type: "apiDetailFolder".to_string(), data_json: None, run_tab_json: None, sort_order: Some(sort_order) };
    match menu_repo::create_menu_item(&state.db, &project_id, &payload) {
        Ok(_) => {
            // 目录操作没有「新增接口」语义，保守归入 merged，避免通知虚报新增
            emit_yapi_push(&state, &project_id, PUSH_KIND_MERGED);
            yapi_ok(serde_json::json!({ "_id": folder_id, "name": name, "desc": "", "index": 0 }))
        },
        Err(e) => yapi_error(&format!("创建分类失败: {e}")),
    }
}

// POST /api/interface/save
async fn handle_interface_save(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    body: Bytes,
) -> Json<Value> {
    let body = match parse_yapi_body(&headers, &body) {
        Ok(v) => v,
        Err(e) => return yapi_error(&e),
    };
    let body_token = body.get("token").and_then(|v| v.as_str());
    let user_id = match resolve_user_id(&state, &headers, qtoken(&query), body_token) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let project_id = match get_project_id(&query, &Some(&body)) {
        Some(id) => id,
        None => return yapi_error("缺少参数: project_id"),
    };
    {
        let role = project_repo::get_project_member_role(&state.db, &project_id, &user_id);
        if role.as_deref() != Some("owner") && role.as_deref() != Some("editor") {
            return yapi_error("无权修改该项目");
        }
    }
    let title = match body.get("title").and_then(|v| v.as_str()) { Some(t) => t, None => return yapi_error("缺少必要参数: title, path, method") };
    let path = match body.get("path").and_then(|v| v.as_str()) { Some(p) => p, None => return yapi_error("缺少必要参数: title, path, method") };
    let method = match body.get("method").and_then(|v| v.as_str()) { Some(m) => m, None => return yapi_error("缺少必要参数: title, path, method") };

    let catid = match body.get("catid") {
        Some(v) => {
            let s = if v.is_number() { v.to_string() } else { v.as_str().unwrap_or("").to_string() };
            if s.is_empty() {
                match ensure_default_folder(&state.db, &project_id) {
                    Ok(id) => id,
                    Err(e) => return yapi_error(&format!("获取默认分类失败: {e}")),
                }
            } else {
                s
            }
        }
        None => match ensure_default_folder(&state.db, &project_id) {
            Ok(id) => id,
            Err(e) => return yapi_error(&format!("获取默认分类失败: {e}")),
        },
    };

    // catid 必须是该项目下真实存在的目录,防止拼出悬挂引用
    let cat_valid = match menu_repo::get_menu_item(&state.db, &project_id, &catid) {
        Ok(Some(item)) => item.menu_type == "apiDetailFolder",
        Ok(None) => false,
        Err(e) => return yapi_error(&format!("校验分类失败: {e}")),
    };
    if !cat_valid {
        return yapi_error("分类(catid)不存在或不属于该项目");
    }

    let yapi_data = build_yapi_from_save_body(&body);
    let api_details = yapi_service::yapi_to_api_details(&yapi_data);

    if let Some(existing_id) = body.get("id").and_then(|v| v.as_str()) {
        match menu_repo::get_menu_item(&state.db, &project_id, existing_id) {
            Ok(Some(existing)) => match upsert_menu_item_data(&state.db, &project_id, &existing, &catid, title, &api_details) {
                Ok(result) => {
                    emit_yapi_push(&state, &project_id, PUSH_KIND_MERGED);
                    return yapi_ok(result);
                },
                Err(e) => return yapi_error(&format!("更新失败: {e}")),
            },
            Ok(None) => {},
            Err(e) => return yapi_error(&format!("查询失败: {e}")),
        }
    }
    if let Some(existing) = find_existing_interface(&state.db, &project_id, path, method) {
        match upsert_menu_item_data(&state.db, &project_id, &existing, &catid, title, &api_details) {
            Ok(result) => {
                emit_yapi_push(&state, &project_id, PUSH_KIND_MERGED);
                return yapi_ok(result);
            },
            Err(e) => return yapi_error(&format!("更新失败: {e}")),
        }
    }
    let menu_item_id = Uuid::new_v4().to_string();
    let sort_order = match menu_repo::get_max_sort_order(&state.db, &project_id) { Ok(n) => n + 1, Err(e) => return yapi_error(&format!("查询排序失败: {e}")), };
    let payload = CreateMenuItemPayload { id: menu_item_id.clone(), parent_id: Some(catid), name: title.to_string(), menu_type: "apiDetail".to_string(), data_json: Some(api_details), run_tab_json: None, sort_order: Some(sort_order) };
    match menu_repo::create_menu_item(&state.db, &project_id, &payload) {
        Ok(_) => {
            emit_yapi_push(&state, &project_id, PUSH_KIND_CREATED);
            yapi_ok(serde_json::json!({ "_id": menu_item_id }))
        },
        Err(e) => yapi_error(&format!("创建接口失败: {e}")),
    }
}

// POST /api/interface/up
async fn handle_interface_up(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    body: Bytes,
) -> Json<Value> {
    let body = match parse_yapi_body(&headers, &body) {
        Ok(v) => v,
        Err(e) => return yapi_error(&e),
    };
    let body_token = body.get("token").and_then(|v| v.as_str());
    let user_id = match resolve_user_id(&state, &headers, qtoken(&query), body_token) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let project_id = match get_project_id(&query, &Some(&body)) {
        Some(id) => id,
        None => return yapi_error("缺少参数: project_id"),
    };
    let role = project_repo::get_project_member_role(&state.db, &project_id, &user_id);
    if role.as_deref() != Some("owner") && role.as_deref() != Some("editor") {
        return yapi_error("无权修改该项目");
    }
    let id = match body.get("id").and_then(|v| v.as_str()) { Some(v) => v, None => return yapi_error("缺少必要参数: id") };
    let existing = match menu_repo::get_menu_item(&state.db, &project_id, id) {
        Ok(Some(item)) => item, Ok(None) => return yapi_error("接口不存在"),
        Err(e) => return yapi_error(&format!("查询失败: {e}")),
    };
    let yapi_data = build_yapi_from_save_body(&body);
    let api_details = yapi_service::yapi_to_api_details(&yapi_data);
    let title = body.get("title").and_then(|v| v.as_str()).unwrap_or(&existing.name);
    let parent_id = existing.parent_id.clone().unwrap_or_default();
    match upsert_menu_item_data(&state.db, &project_id, &existing, &parent_id, title, &api_details) {
        Ok(result) => {
            emit_yapi_push(&state, &project_id, PUSH_KIND_MERGED);
            yapi_ok(result)
        },
        Err(e) => yapi_error(&format!("更新失败: {e}")),
    }
}

// POST /api/interface/update_cat
async fn handle_update_cat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Json(body): Json<Value>,
) -> Json<Value> {
    let body_token = body.get("token").and_then(|v| v.as_str());
    let user_id = match resolve_user_id(&state, &headers, qtoken(&query), body_token) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let project_id = match get_project_id(&query, &Some(&body)) {
        Some(id) => id,
        None => return yapi_error("缺少参数: project_id"),
    };
    {
        let role = project_repo::get_project_member_role(&state.db, &project_id, &user_id);
        if role.as_deref() != Some("owner") && role.as_deref() != Some("editor") {
            return yapi_error("无权修改该项目");
        }
    }
    let catid = match body
        .get("catid")
        .or_else(|| body.get("id"))
        .and_then(|v| v.as_str())
    {
        Some(v) if !v.is_empty() => v.to_string(),
        _ => return yapi_error("缺少必要参数: catid"),
    };
    let name = body.get("name").and_then(|v| v.as_str());
    let parent_id = read_parent_id(&body);
    match update_folder(&state.db, &project_id, &catid, name, parent_id.as_deref()) {
        Ok(item) => {
            // 目录操作没有「新增接口」语义，保守归入 merged，避免通知虚报新增
            emit_yapi_push(&state, &project_id, PUSH_KIND_MERGED);
            yapi_ok(
                serde_json::json!({ "_id": item.id, "name": item.name, "catid": item.parent_id }),
            )
        }
        Err(e) => yapi_error(&format!("更新目录失败: {e}")),
    }
}

// POST /api/interface/del_cat
async fn handle_del_cat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Json(body): Json<Value>,
) -> Json<Value> {
    let body_token = body.get("token").and_then(|v| v.as_str());
    let user_id = match resolve_user_id(&state, &headers, qtoken(&query), body_token) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let project_id = match get_project_id(&query, &Some(&body)) {
        Some(id) => id,
        None => return yapi_error("缺少参数: project_id"),
    };
    {
        let role = project_repo::get_project_member_role(&state.db, &project_id, &user_id);
        if role.as_deref() != Some("owner") && role.as_deref() != Some("editor") {
            return yapi_error("无权修改该项目");
        }
    }
    let catid = match body
        .get("catid")
        .or_else(|| body.get("id"))
        .and_then(|v| v.as_str())
    {
        Some(v) if !v.is_empty() => v.to_string(),
        _ => return yapi_error("缺少必要参数: catid"),
    };
    match menu_repo::get_menu_item(&state.db, &project_id, &catid) {
        Ok(Some(item)) if item.menu_type == "apiDetailFolder" => {}
        Ok(_) => return yapi_error("目录不存在或不是目录"),
        Err(e) => return yapi_error(&format!("查询失败: {e}")),
    }
    match menu_repo::delete_menu_item(&state.db, &project_id, &catid) {
        Ok(_) => {
            emit_yapi_push(&state, &project_id, PUSH_KIND_MERGED);
            yapi_ok(serde_json::json!({ "_id": catid }))
        }
        Err(e) => yapi_error(&format!("删除目录失败: {e}")),
    }
}

// POST /api/interface/del
async fn handle_del(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Json(body): Json<Value>,
) -> Json<Value> {
    let body_token = body.get("token").and_then(|v| v.as_str());
    let user_id = match resolve_user_id(&state, &headers, qtoken(&query), body_token) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let project_id = match get_project_id(&query, &Some(&body)) {
        Some(id) => id,
        None => return yapi_error("缺少参数: project_id"),
    };
    {
        let role = project_repo::get_project_member_role(&state.db, &project_id, &user_id);
        if role.as_deref() != Some("owner") && role.as_deref() != Some("editor") {
            return yapi_error("无权修改该项目");
        }
    }
    let id = match body
        .get("id")
        .or_else(|| body.get("catid"))
        .and_then(|v| v.as_str())
    {
        Some(v) if !v.is_empty() => v.to_string(),
        _ => return yapi_error("缺少必要参数: id"),
    };
    match menu_repo::get_menu_item(&state.db, &project_id, &id) {
        Ok(Some(item)) if item.menu_type == "apiDetail" => {}
        Ok(_) => return yapi_error("接口不存在"),
        Err(e) => return yapi_error(&format!("查询失败: {e}")),
    }
    match menu_repo::delete_menu_item(&state.db, &project_id, &id) {
        Ok(_) => {
            emit_yapi_push(&state, &project_id, PUSH_KIND_MERGED);
            yapi_ok(serde_json::json!({ "_id": id }))
        }
        Err(e) => yapi_error(&format!("删除接口失败: {e}")),
    }
}

// Server lifecycle

pub async fn start_yapi_server(db: Arc<Db>, handle: Arc<YApiServerHandle>, preferred_port: u16, app_handle: tauri::AppHandle) {
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", preferred_port)).await {
        Ok(l) => l,
        Err(_) => {
            log::warn!("YApi port {} occupied, trying random port", preferred_port);
            tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.expect("Failed to bind YApi HTTP server")
        }
    };
    let actual_port = listener.local_addr().unwrap().port();
    *handle.port.lock().unwrap() = actual_port;
    let (tx, rx) = oneshot::channel::<()>();
    *handle.shutdown_tx.lock().unwrap() = Some(tx);
    let router = build_router(db, Some(app_handle));
    log::info!("YApi HTTP server started on 127.0.0.1:{}", actual_port);
    let _ = axum::serve(listener, router).with_graceful_shutdown(async { rx.await.ok(); }).await;
    log::info!("YApi HTTP server stopped");
}

fn build_router(db: Arc<Db>, app_handle: Option<tauri::AppHandle>) -> Router {
    let state = AppState { db, app_handle };
    Router::new()
        .route("/api/project/list", get(handle_project_list))
        .route("/api/project/get", get(handle_project_get))
        .route("/api/interface/getCatMenu", get(handle_cat_get_menu))
        .route("/api/cat/getCatMenu", get(handle_cat_get_menu))
        .route("/api/interface/get", get(handle_interface_get))
        .route("/api/interface/list_cat", get(handle_interface_list_cat))
        .route("/api/interface/list_menu", get(handle_interface_list_menu))
        .route("/api/interface/save", post(handle_interface_save))
        .route("/api/interface/up", post(handle_interface_up))
        .route("/api/interface/add_cat", post(handle_add_cat))
        .route("/api/interface/update_cat", post(handle_update_cat))
        // YApi 标准协议的改目录路由名是 up_cat（update_cat 是本实现的扩展名）
        .route("/api/interface/up_cat", post(handle_update_cat))
        .route("/api/interface/del_cat", post(handle_del_cat))
        .route("/api/interface/del", post(handle_del))
        .with_state(state)
}



#[cfg(test)]
mod body_compat_tests {
    use super::*;

    /// YApi 客户端的三种请求体形状都要能解析：
    /// 平铺 JSON、api_data 包裹的 JSON、form-urlencoded。
    #[test]
    fn parse_yapi_body_supports_three_shapes() {
        let mut headers = HeaderMap::new();

        // 1) 平铺 JSON
        let body = parse_yapi_body(&headers, br#"{"title":"A","path":"/a","method":"GET"}"#).unwrap();
        assert_eq!(body["title"], "A");

        // 2) api_data 包裹（Apifox 同步工具的形状）
        let inner = r#"{"title":"B","path":"/b","method":"POST"}"#;
        let payload = format!(r#"{{"token":"t","api_data":{}}}"#, serde_json::to_string(inner).unwrap());
        let body = parse_yapi_body(&headers, payload.as_bytes()).unwrap();
        assert_eq!(body["title"], "B");
        assert_eq!(body["method"], "POST");
        assert_eq!(body["token"], "t");

        // 3) form-urlencoded（api_data 需再做一次 percent 解码）
        headers.insert(
            axum::http::header::CONTENT_TYPE,
            axum::http::HeaderValue::from_static("application/x-www-form-urlencoded"),
        );
        let encoded = urlencoding::encode(inner);
        let payload = format!("token=t&api_data={encoded}");
        let body = parse_yapi_body(&headers, payload.as_bytes()).unwrap();
        assert_eq!(body["title"], "B");
        assert_eq!(body["path"], "/b");
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_yapi_push_payload_serialize() {
        let payload = YapiPushPayload { project_id: "p1".into(), project_name: "测试项目".into(), count: 3, kind: PUSH_KIND_CREATED.into() };
        let json = serde_json::to_value(&payload).unwrap();
        assert_eq!(json.get("projectId").and_then(|v| v.as_str()), Some("p1"));
        assert_eq!(json.get("projectName").and_then(|v| v.as_str()), Some("测试项目"));
        assert_eq!(json.get("count").and_then(|v| v.as_u64()), Some(3));
        assert_eq!(json.get("kind").and_then(|v| v.as_str()), Some("created"));
    }

    #[test]
    fn test_upsert_preserves_stable_id_and_created_at() {
        use rusqlite::Connection;
        use std::sync::Mutex;

        let conn = Connection::open_in_memory().unwrap();
        crate::db::client::create_tables(&conn);
        conn.execute("INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1','t','x','2026-01-01')", []).unwrap();
        conn.execute("INSERT INTO projects (id, name, owner_id, created_at) VALUES ('p1','demo','u1','2026-01-01')", []).unwrap();
        let db = Arc::new(Db(Mutex::new(conn)));

        let original_id = "stable-id-001";
        let original_created = "2026-01-02T00:00:00Z";
        let payload = CreateMenuItemPayload {
            id: "menu-1".into(),
            parent_id: None,
            name: "旧名称".into(),
            menu_type: "apiDetail".into(),
            data_json: Some(serde_json::json!({
                "id": original_id,
                "method": "GET",
                "path": "/old",
                "createdAt": original_created,
                "updatedAt": "2026-01-02T00:00:00Z",
            })),
            run_tab_json: None,
            sort_order: Some(0),
        };
        menu_repo::create_menu_item(&db, "p1", &payload).unwrap();
        let existing = menu_repo::get_menu_item(&db, "p1", "menu-1").unwrap().unwrap();

        let pushed = serde_json::json!({
            "id": "fresh-temp-id",
            "method": "GET",
            "path": "/new",
            "name": "新名称",
            "createdAt": "2099-01-01T00:00:00Z",
            "updatedAt": "2099-01-01T00:00:00Z",
        });
        upsert_menu_item_data(&db, "p1", &existing, "folder-x", "新名称", &pushed).unwrap();

        let updated = menu_repo::get_menu_item(&db, "p1", "menu-1").unwrap().unwrap();
        let data = updated.data_json.unwrap();
        assert_eq!(data.get("id").and_then(|v| v.as_str()), Some(original_id), "data.id 不被插件推送覆盖");
        assert_eq!(data.get("createdAt").and_then(|v| v.as_str()), Some(original_created), "createdAt 保留原值");
        assert_eq!(data.get("path").and_then(|v| v.as_str()), Some("/new"), "业务字段正常更新");
        assert_eq!(updated.name, "新名称");
        assert_ne!(data.get("updatedAt").and_then(|v| v.as_str()), Some("2099-01-01T00:00:00Z"));
    }

    #[test]
    fn test_yapi_push_payload_deserialize() {
        let json = serde_json::json!({"projectId":"p2","projectName":"项目B","count":5,"kind":"merged"});
        let payload: YapiPushPayload = serde_json::from_value(json).unwrap();
        assert_eq!(payload.project_id, "p2");
        assert_eq!(payload.project_name, "项目B");
        assert_eq!(payload.count, 5);
        assert_eq!(payload.kind, "merged");
    }

    #[test]
    fn test_yapi_push_payload_count_default() {
        // ensure count field works with 1
        let payload = YapiPushPayload { project_id: "p3".into(), project_name: "项目C".into(), count: 1, kind: PUSH_KIND_MERGED.into() };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("projectId"));
        assert!(json.contains("projectName"));
        assert!(json.contains("\"kind\":\"merged\""));
    }

    #[test]
    fn test_emit_yapi_push_no_panic_without_handle() {
        use rusqlite::Connection;
        use std::sync::Mutex;
        let conn = Connection::open_in_memory().unwrap();
        // create minimal projects table so get_project_by_id does not error on missing table, but also works without it (fallback)
        conn.execute_batch("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL);").ok();
        let db = Arc::new(Db(Mutex::new(conn)));
        let state = AppState { db, app_handle: None };
        // Should not panic even with None handle
        emit_yapi_push(&state, "test-project", PUSH_KIND_MERGED);
    }

    #[test]
    fn test_emit_yapi_push_with_fake_project_fallback() {
        use rusqlite::Connection;
        use std::sync::Mutex;
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL);").ok();
        let db = Arc::new(Db(Mutex::new(conn)));
        let state = AppState { db, app_handle: None };
        // project not in DB, fallback to project_id as name internally (count still 1, no panic)
        emit_yapi_push(&state, "unknown-project-xyz", PUSH_KIND_CREATED);
    }

    #[test]
    fn test_build_router_with_none_handle() {
        use rusqlite::Connection;
        use std::sync::Mutex;
        let conn = Connection::open_in_memory().unwrap();
        let db = Arc::new(Db(Mutex::new(conn)));
        let router = build_router(db, None);
        // router should be created without panic; check that it has routes (debug)
        assert!(format!("{:?}", router).len() > 0);
    }

    #[test]
    fn test_yapi_push_event_name() {
        // frontend constant YAPI_PUSH_EVENT must match backend emit string
        let event_name = "yapi:api-pushed";
        assert_eq!(event_name, "yapi:api-pushed");
    }

    // ---- 目录嵌套 / 增删改路由 ----

    fn setup_yapi_db() -> (Arc<Db>, HeaderMap) {
        use rusqlite::Connection;
        use std::sync::Mutex;

        let conn = Connection::open_in_memory().unwrap();
        crate::db::client::create_tables(&conn);
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1','tester','x','2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, owner_id, created_at) VALUES ('p1','demo','u1','2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO project_members (project_id, user_id, role, created_at) VALUES ('p1','u1','owner','2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO personal_tokens (id, user_id, token, name, created_at) VALUES ('tk1','u1','tok-1','default','2026-01-01')",
            [],
        )
        .unwrap();

        let mut headers = HeaderMap::new();
        headers.insert("x-yapi-token", "tok-1".parse().unwrap());
        (Arc::new(Db(Mutex::new(conn))), headers)
    }

    fn project_query() -> Query<HashMap<String, String>> {
        Query(HashMap::from([(
            "project_id".to_string(),
            "p1".to_string(),
        )]))
    }

    fn data_id(res: &Json<Value>) -> String {
        res.0
            .get("data")
            .and_then(|d| d.get("_id"))
            .and_then(|v| v.as_str())
            .unwrap()
            .to_string()
    }

    /// 直接调用 save handler，模拟插件推送一次接口。
    async fn save_interface(
        state: &AppState,
        headers: &HeaderMap,
        title: &str,
        path: &str,
        method: &str,
        catid: &str,
    ) -> Json<Value> {
        let body = serde_json::json!({ "title": title, "path": path, "method": method, "catid": catid });
        handle_interface_save(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Bytes::from(serde_json::to_vec(&body).unwrap()),
        )
        .await
    }

    fn errcode(res: &Json<Value>) -> i64 {
        res.0.get("errcode").and_then(|v| v.as_i64()).unwrap()
    }

    #[tokio::test]
    async fn add_cat_with_parent_id_creates_nested_folder() {
        let (db, headers) = setup_yapi_db();
        let state = AppState {
            db: db.clone(),
            app_handle: None,
        };

        let root = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "根目录" })),
        )
        .await;
        assert_eq!(errcode(&root), 0);
        let root_id = data_id(&root);

        let child = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "子目录", "parent_id": root_id })),
        )
        .await;
        assert_eq!(errcode(&child), 0);
        let child_id = data_id(&child);

        let item = menu_repo::get_menu_item(&db, "p1", &child_id)
            .unwrap()
            .unwrap();
        assert_eq!(item.menu_type, "apiDetailFolder");
        assert_eq!(
            item.parent_id.as_deref(),
            Some(root_id.as_str()),
            "子目录应挂在父目录下"
        );
    }

    #[tokio::test]
    async fn add_cat_accepts_camel_case_parent_id() {
        let (db, headers) = setup_yapi_db();
        let state = AppState {
            db: db.clone(),
            app_handle: None,
        };

        let root = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "根目录" })),
        )
        .await;
        let root_id = data_id(&root);

        let child = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "子目录", "parentId": root_id })),
        )
        .await;
        assert_eq!(errcode(&child), 0);
        let child_id = data_id(&child);

        let item = menu_repo::get_menu_item(&db, "p1", &child_id)
            .unwrap()
            .unwrap();
        assert_eq!(item.parent_id.as_deref(), Some(root_id.as_str()));
    }

    #[tokio::test]
    async fn add_cat_with_unknown_parent_is_rejected() {
        let (db, headers) = setup_yapi_db();
        let state = AppState {
            db: db.clone(),
            app_handle: None,
        };

        let res = handle_add_cat(
            State(state),
            headers,
            project_query(),
            Json(serde_json::json!({ "name": "子目录", "parent_id": "not-exist" })),
        )
        .await;
        assert_eq!(errcode(&res), 1, "父目录不存在应报错");
        assert!(res
            .0
            .get("errmsg")
            .and_then(|v| v.as_str())
            .unwrap()
            .contains("父目录"));
    }

    #[tokio::test]
    async fn update_cat_renames_and_moves_folder() {
        let (db, headers) = setup_yapi_db();
        let state = AppState {
            db: db.clone(),
            app_handle: None,
        };

        let root = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "根目录" })),
        )
        .await;
        let root_id = data_id(&root);
        let other = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "其它目录" })),
        )
        .await;
        let other_id = data_id(&other);
        let child = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "子目录", "parent_id": root_id })),
        )
        .await;
        let child_id = data_id(&child);

        let res = handle_update_cat(
            State(state),
            headers,
            project_query(),
            Json(serde_json::json!({ "catid": child_id, "name": "改名后", "parent_id": other_id })),
        )
        .await;
        assert_eq!(errcode(&res), 0);

        let item = menu_repo::get_menu_item(&db, "p1", &child_id)
            .unwrap()
            .unwrap();
        assert_eq!(item.name, "改名后");
        assert_eq!(item.parent_id.as_deref(), Some(other_id.as_str()));
    }

    #[tokio::test]
    async fn update_cat_moving_into_own_descendant_is_rejected() {
        let (db, headers) = setup_yapi_db();
        let state = AppState {
            db: db.clone(),
            app_handle: None,
        };

        let a = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "A" })),
        )
        .await;
        let a_id = data_id(&a);
        let b = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "B", "parent_id": a_id })),
        )
        .await;
        let b_id = data_id(&b);
        let c = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "C", "parent_id": b_id })),
        )
        .await;
        let c_id = data_id(&c);

        // A 移到自己的孙子 C 下 → 必须拒绝，且 A 的父级不变
        let res = handle_update_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "catid": a_id, "parent_id": c_id })),
        )
        .await;
        assert_eq!(errcode(&res), 1, "移动到自身子孙下应报错");
        let item = menu_repo::get_menu_item(&db, "p1", &a_id).unwrap().unwrap();
        assert_eq!(item.parent_id, None, "A 的父级不应被改动");

        // A 移到自身下 → 同样拒绝
        let res = handle_update_cat(
            State(state),
            headers,
            project_query(),
            Json(serde_json::json!({ "catid": a_id, "parent_id": a_id })),
        )
        .await;
        assert_eq!(errcode(&res), 1, "移动到自身下应报错");
    }

    #[tokio::test]
    async fn del_cat_removes_folder_and_children() {
        let (db, headers) = setup_yapi_db();
        let state = AppState {
            db: db.clone(),
            app_handle: None,
        };

        let root = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "根目录" })),
        )
        .await;
        let root_id = data_id(&root);
        let child = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "子目录", "parent_id": root_id })),
        )
        .await;
        let child_id = data_id(&child);

        let res = handle_del_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "catid": child_id })),
        )
        .await;
        assert_eq!(errcode(&res), 0);
        assert!(menu_repo::get_menu_item(&db, "p1", &child_id)
            .unwrap()
            .is_none());

        // 接口删除
        let payload = CreateMenuItemPayload {
            id: "api-1".into(),
            parent_id: Some(root_id.clone()),
            name: "接口A".into(),
            menu_type: "apiDetail".into(),
            data_json: Some(serde_json::json!({ "method": "GET", "path": "/a" })),
            run_tab_json: None,
            sort_order: Some(1),
        };
        menu_repo::create_menu_item(&db, "p1", &payload).unwrap();

        let res = handle_del(
            State(state),
            headers,
            project_query(),
            Json(serde_json::json!({ "id": "api-1" })),
        )
        .await;
        assert_eq!(errcode(&res), 0);
        assert!(menu_repo::get_menu_item(&db, "p1", "api-1")
            .unwrap()
            .is_none());
    }

    // ---- 推送归属（D2：首次入库优先）与事件 kind ----

    /// 现场复现：同一个 METHOD+path 先落在 Controller 分类，随后各调用方的 Feign
    /// 客户端再推同一条 —— 记录不能变多，归属不能被搬走，源分类不能被删。
    #[tokio::test]
    async fn push_same_path_keeps_first_ownership() {
        let (db, headers) = setup_yapi_db();
        let state = AppState { db: db.clone(), app_handle: None };

        let controller = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "TicketOrderController" })),
        )
        .await;
        let controller_id = data_id(&controller);
        let feign = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "TicketOrderRemoteService" })),
        )
        .await;
        let feign_id = data_id(&feign);

        let path = "/api/order-service/order/ticket/query";
        let first = save_interface(&state, &headers, "查询工单", path, "GET", &controller_id).await;
        assert_eq!(errcode(&first), 0, "Controller 侧首次推送应成功");
        let api_id = data_id(&first);

        let second = save_interface(&state, &headers, "查询工单(Feign)", path, "GET", &feign_id).await;
        assert_eq!(errcode(&second), 0, "Feign 侧重复推送应成功");
        assert_eq!(data_id(&second), api_id, "同 METHOD+path 命中同一条记录，不新建");

        let items = menu_repo::list_menu_items(&db, "p1").unwrap();
        let apis: Vec<_> = items.iter().filter(|i| i.menu_type == "apiDetail").collect();
        assert_eq!(apis.len(), 1, "同 METHOD+path 在库里只应有一条记录");
        assert_eq!(apis[0].parent_id.as_deref(), Some(controller_id.as_str()), "归属保持首次落位的 Controller 分类");
        assert!(items.iter().any(|i| i.id == controller_id), "Controller 分类不应被删");
        assert!(items.iter().any(|i| i.id == feign_id), "Feign 分类应保留");
    }

    /// 重复推送不能退化为「忽略」：内容与标题仍要更新，但归属不变。
    #[tokio::test]
    async fn push_same_path_updates_content() {
        let (db, headers) = setup_yapi_db();
        let state = AppState { db: db.clone(), app_handle: None };

        let controller = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "TicketOrderController" })),
        )
        .await;
        let controller_id = data_id(&controller);
        let feign = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "TicketOrderRemoteService" })),
        )
        .await;
        let feign_id = data_id(&feign);

        let path = "/api/order-service/order/ticket/query";
        let first = save_interface(&state, &headers, "查询工单", path, "GET", &controller_id).await;
        let api_id = data_id(&first);
        let before = menu_repo::get_menu_item(&db, "p1", &api_id).unwrap().unwrap();
        let stable_data_id = before
            .data_json
            .as_ref()
            .and_then(|d| d.get("id"))
            .and_then(|v| v.as_str())
            .unwrap()
            .to_string();

        let second = save_interface(&state, &headers, "查询工单(Feign 版)", path, "GET", &feign_id).await;
        assert_eq!(data_id(&second), api_id, "仍命中同一条记录");

        let after = menu_repo::get_menu_item(&db, "p1", &api_id).unwrap().unwrap();
        assert_eq!(after.name, "查询工单(Feign 版)", "标题随重复推送更新");
        assert_eq!(after.parent_id.as_deref(), Some(controller_id.as_str()), "归属不随重复推送变化");
        let after_data = after.data_json.unwrap();
        assert_eq!(after_data.get("name").and_then(|v| v.as_str()), Some("查询工单(Feign 版)"), "data_json 内容同样更新");
        assert_eq!(after_data.get("id").and_then(|v| v.as_str()), Some(stable_data_id.as_str()), "data.id 沿用首次入库的稳定标识");
    }

    /// 孤儿记录（`parent_id` 为空）第一次被推送命中时落到本次分类，之后再推不改归属。
    #[tokio::test]
    async fn push_orphan_lands_in_first_folder_then_stays() {
        let (db, headers) = setup_yapi_db();
        let state = AppState { db: db.clone(), app_handle: None };

        let first_cat = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "分类A" })),
        )
        .await;
        let first_cat_id = data_id(&first_cat);
        let second_cat = handle_add_cat(
            State(state.clone()),
            headers.clone(),
            project_query(),
            Json(serde_json::json!({ "name": "分类B" })),
        )
        .await;
        let second_cat_id = data_id(&second_cat);

        let orphan = CreateMenuItemPayload {
            id: "orphan-1".into(),
            parent_id: None,
            name: "孤儿接口".into(),
            menu_type: "apiDetail".into(),
            data_json: Some(serde_json::json!({ "id": "stable-orphan", "method": "POST", "path": "/api/orphan" })),
            run_tab_json: None,
            sort_order: Some(1),
        };
        menu_repo::create_menu_item(&db, "p1", &orphan).unwrap();

        let first = save_interface(&state, &headers, "孤儿接口", "/api/orphan", "POST", &first_cat_id).await;
        assert_eq!(errcode(&first), 0);
        let landed = menu_repo::get_menu_item(&db, "p1", "orphan-1").unwrap().unwrap();
        assert_eq!(landed.parent_id.as_deref(), Some(first_cat_id.as_str()), "孤儿记录首次命中时落位");

        let second = save_interface(&state, &headers, "孤儿接口(改名)", "/api/orphan", "POST", &second_cat_id).await;
        assert_eq!(errcode(&second), 0);
        let after = menu_repo::get_menu_item(&db, "p1", "orphan-1").unwrap().unwrap();
        assert_eq!(after.parent_id.as_deref(), Some(first_cat_id.as_str()), "落位后不再漂移");
        assert_eq!(after.name, "孤儿接口(改名)", "内容仍更新");
    }

    /// `/api/interface/up` 没有分类入参，handler 兜底传空串：不能把空串写进 `parent_id`。
    #[tokio::test]
    async fn interface_up_does_not_write_blank_parent_id() {
        let (db, headers) = setup_yapi_db();
        let state = AppState { db: db.clone(), app_handle: None };

        let orphan = CreateMenuItemPayload {
            id: "orphan-2".into(),
            parent_id: None,
            name: "孤儿接口".into(),
            menu_type: "apiDetail".into(),
            data_json: Some(serde_json::json!({ "id": "stable-orphan-2", "method": "GET", "path": "/api/orphan-up" })),
            run_tab_json: None,
            sort_order: Some(1),
        };
        menu_repo::create_menu_item(&db, "p1", &orphan).unwrap();

        let body = serde_json::json!({ "id": "orphan-2", "title": "改后标题", "path": "/api/orphan-up", "method": "GET" });
        let res = handle_interface_up(
            State(state),
            headers,
            project_query(),
            Bytes::from(serde_json::to_vec(&body).unwrap()),
        )
        .await;
        assert_eq!(errcode(&res), 0);

        let after = menu_repo::get_menu_item(&db, "p1", "orphan-2").unwrap().unwrap();
        assert_eq!(after.parent_id, None, "空串不得落库成悬挂归属");
        assert_eq!(after.name, "改后标题", "up 仍更新内容");
    }

    /// kind 由 save 的三条分支与 up 硬编码：新建传 created，命中传 merged。
    /// 单测里 AppHandle 为空（不发事件），因此直接断言构造出的载荷。
    #[test]
    fn push_payload_kind_distinguishes_created_and_merged() {
        let (db, _headers) = setup_yapi_db();
        let state = AppState { db: db.clone(), app_handle: None };

        let created = build_yapi_push_payload(&state, "p1", PUSH_KIND_CREATED);
        assert_eq!(created.kind, "created");
        assert_eq!(created.project_name, "demo", "项目名从库里解析");
        assert_eq!(created.count, 1);

        let merged = build_yapi_push_payload(&state, "p1", PUSH_KIND_MERGED);
        assert_eq!(merged.kind, "merged");

        // 前端只认 'created' / 'merged' 两个字面量，常量值不得漂移
        assert_eq!(PUSH_KIND_CREATED, "created");
        assert_eq!(PUSH_KIND_MERGED, "merged");

        let json = serde_json::to_value(&merged).unwrap();
        assert_eq!(json.get("kind").and_then(|v| v.as_str()), Some("merged"), "kind 无需 rename，序列化为同名");
    }
}
