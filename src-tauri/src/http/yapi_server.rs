use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::{
    extract::{Query, State},
    http::HeaderMap,
    response::Json,
    routing::{get, post},
    Router,
};
use serde_json::Value;
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::db::client::Db;
use crate::db::{menu_repo, project_repo, token_repo};
use crate::models::{ApiMenuData, CreateMenuItemPayload};
use crate::services::yapi_service::{self, YApiInterface};

// ── YApi Server Handle ──

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

// ── State ──

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Db>,
}

// ── Response helpers ──

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

// ── Token extraction ──

fn resolve_project_id(
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
    token_repo::find_project_by_token(&state.db, token)
}

// ── Helpers ──

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
        sort_order: Some(sort_order + 1),
    };
    menu_repo::create_menu_item(db, project_id, &payload)?;
    Ok(folder_id)
}

fn find_existing_interface(db: &Db, project_id: &str, path: &str, method: &str) -> Option<ApiMenuData> {
    let items = menu_repo::list_menu_items(db, project_id).ok()?;
    let upper_method = method.to_uppercase();
    items.into_iter().find(|item| {
        if item.menu_type != "apiDetail" {
            return false;
        }
        item.data_json.as_ref().is_some_and(|data| {
            let p = data.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let m = data.get("method").and_then(|v| v.as_str()).unwrap_or("");
            p == path && m.to_uppercase() == upper_method
        })
    })
}

fn upsert_menu_item_data(
    db: &Db,
    project_id: &str,
    existing: &ApiMenuData,
    folder_id: &str,
    name: &str,
    api_details: &Value,
) -> Result<Value, crate::errors::AppError> {
    let current_data = existing.data_json.clone().unwrap_or(Value::Object(serde_json::Map::new()));
    let next_data = if let Value::Object(ref cur) = current_data {
        let mut merged = cur.clone();
        if let Value::Object(ref detail) = api_details {
            for (k, v) in detail {
                merged.insert(k.clone(), v.clone());
            }
        }
        let detail_id = api_details.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if !detail_id.is_empty() {
            merged.insert("id".to_string(), Value::String(detail_id.to_string()));
        }
        Value::Object(merged)
    } else {
        api_details.clone()
    };

    let old_parent_id = existing.parent_id.clone();

    let updates = serde_json::json!({
        "name": name,
        "data": next_data,
        "parentId": folder_id,
    });
    menu_repo::update_menu_item(db, project_id, &existing.id, &updates)?;

    // Clean up empty source folder
    if let Some(ref old_pid) = old_parent_id {
        if old_pid != folder_id {
            let all_items = menu_repo::list_menu_items(db, project_id)?;
            let has_children = all_items.iter().any(|item| item.parent_id.as_deref() == Some(old_pid.as_str()));
            if !has_children {
                let _ = menu_repo::delete_menu_item(db, project_id, old_pid);
            }
        }
    }

    Ok(serde_json::json!({ "_id": existing.id }))
}

fn build_yapi_from_save_body(body: &Value) -> YApiInterface {
    YApiInterface {
        id: None,
        catid: None,
        title: body.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        path: body.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        method: body.get("method").and_then(|v| v.as_str()).unwrap_or("GET").to_string(),
        desc: body.get("desc").and_then(|v| v.as_str()).map(|s| s.to_string()),
        markdown: body.get("markdown").and_then(|v| v.as_str()).map(|s| s.to_string()),
        status: body.get("status").and_then(|v| v.as_str()).map(|s| s.to_string()),
        tag: body.get("tag").and_then(|v| {
            v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
        }),
        tags: body.get("tags").and_then(|v| {
            v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
        }),
        req_headers: serde_json::from_value(
            body.get("req_headers").cloned().unwrap_or(Value::Null)
        ).ok(),
        req_query: serde_json::from_value(
            body.get("req_query").cloned().unwrap_or(Value::Null)
        ).ok(),
        req_params: serde_json::from_value(
            body.get("req_params").cloned().unwrap_or(Value::Null)
        ).ok(),
        req_body_type: body.get("req_body_type").and_then(|v| v.as_str()).map(|s| s.to_string()),
        req_body_form: serde_json::from_value(
            body.get("req_body_form").cloned().unwrap_or(Value::Null)
        ).ok(),
        req_body_other: body.get("req_body_other").and_then(|v| {
            if v.is_string() { Some(v.as_str().unwrap().to_string()) }
            else { Some(v.to_string()) }
        }),
        req_body_is_json_schema: body.get("req_body_is_json_schema").and_then(|v| v.as_bool()),
        res_body_type: body.get("res_body_type").and_then(|v| v.as_str()).map(|s| s.to_string()),
        res_body: body.get("res_body").and_then(|v| {
            if v.is_string() { Some(v.as_str().unwrap().to_string()) }
            else { Some(v.to_string()) }
        }),
        res_body_is_json_schema: body.get("res_body_is_json_schema").and_then(|v| v.as_bool()),
    }
}

// Helper to get query token
fn qtoken(query: &HashMap<String, String>) -> Option<&str> {
    query.get("token").map(|s| s.as_str())
}

// ── GET handlers ──

async fn handle_project_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let project_id = match resolve_project_id(&state, &headers, qtoken(&query), None) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    match project_repo::get_project_by_id(&state.db, &project_id) {
        Ok(Some((id, name))) => yapi_ok(serde_json::json!({
            "_id": id,
            "name": name,
            "desc": "",
            "basepath": "/",
        })),
        Ok(None) => yapi_error("项目不存在"),
        Err(_) => yapi_error("查询项目失败"),
    }
}

async fn handle_cat_get_menu(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let project_id = match resolve_project_id(&state, &headers, qtoken(&query), None) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let items = match menu_repo::list_menu_items(&state.db, &project_id) {
        Ok(items) => items,
        Err(e) => return yapi_error(&format!("查询失败: {e}")),
    };
    let mut cats: Vec<Value> = items
        .iter()
        .filter(|i| i.menu_type == "apiDetailFolder")
        .map(to_yapi_cat)
        .collect();
    if cats.is_empty() {
        match ensure_default_folder(&state.db, &project_id) {
            Ok(folder_id) => {
                cats.push(serde_json::json!({
                    "_id": folder_id,
                    "name": "默认分类",
                    "desc": "",
                    "index": 0,
                }));
            }
            Err(e) => return yapi_error(&format!("创建默认分类失败: {e}")),
        }
    }
    yapi_ok(Value::Array(cats))
}

async fn handle_interface_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let project_id = match resolve_project_id(&state, &headers, qtoken(&query), None) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let id = match query.get("id") {
        Some(v) => v,
        None => return yapi_error("缺少参数: id"),
    };
    let item = match menu_repo::get_menu_item(&state.db, &project_id, id) {
        Ok(Some(item)) => item,
        Ok(None) => return yapi_error("接口不存在"),
        Err(e) => return yapi_error(&format!("查询失败: {e}")),
    };
    if item.menu_type != "apiDetail" {
        return yapi_error("接口不存在");
    }
    let data = match item.data_json.as_ref() {
        Some(d) => d,
        None => return yapi_error("接口数据异常"),
    };
    let yapi_data = yapi_service::api_details_to_yapi(data, &item.id, &item.name);
    let mut result = yapi_data;
    if let Some(obj) = result.as_object_mut() {
        obj.insert("_id".to_string(), Value::String(item.id.clone()));
        obj.insert("catid".to_string(), Value::String(item.parent_id.clone().unwrap_or_default()));
        obj.insert("title".to_string(), Value::String(item.name.clone()));
    }
    yapi_ok(result)
}

async fn handle_interface_list_cat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let project_id = match resolve_project_id(&state, &headers, qtoken(&query), None) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let catid = match query.get("catid") {
        Some(v) => v,
        None => return yapi_error("缺少参数: catid"),
    };
    let items = match menu_repo::list_menu_items(&state.db, &project_id) {
        Ok(items) => items,
        Err(e) => return yapi_error(&format!("查询失败: {e}")),
    };
    let filtered: Vec<Value> = items
        .iter()
        .filter(|i| i.parent_id.as_deref() == Some(catid.as_str()) && i.menu_type == "apiDetail")
        .map(|item| {
            let (path, method, status) = item.data_json.as_ref().map_or(
                ("", "GET", "undone"),
                |d| (
                    d.get("path").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("method").and_then(|v| v.as_str()).unwrap_or("GET"),
                    d.get("status").and_then(|v| v.as_str()).unwrap_or("undone"),
                ),
            );
            let yapi_status = match status {
                "released" => "done",
                "designing" => "designing",
                _ => "undone",
            };
            serde_json::json!({
                "_id": item.id,
                "title": item.name,
                "path": path,
                "method": method,
                "status": yapi_status,
                "catid": item.parent_id,
            })
        })
        .collect();

    let total = filtered.len();
    let page: usize = query.get("page").and_then(|v| v.parse().ok()).unwrap_or(1);
    let limit: usize = query.get("limit").and_then(|v| v.parse().ok()).unwrap_or(20);
    let start = ((page.max(1) - 1) * limit).min(total);
    let end = (start + limit).min(total);
    let paged: Vec<Value> = filtered[start..end].to_vec();

    yapi_ok(serde_json::json!({
        "total": total,
        "list": paged,
    }))
}

async fn handle_interface_list_menu(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let project_id = match resolve_project_id(&state, &headers, qtoken(&query), None) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let items = match menu_repo::list_menu_items(&state.db, &project_id) {
        Ok(items) => items,
        Err(e) => return yapi_error(&format!("查询失败: {e}")),
    };
    let list: Vec<Value> = items
        .iter()
        .filter(|i| i.menu_type == "apiDetail")
        .map(|item| {
            let (path, method, status) = item.data_json.as_ref().map_or(
                ("", "GET", "undone"),
                |d| (
                    d.get("path").and_then(|v| v.as_str()).unwrap_or(""),
                    d.get("method").and_then(|v| v.as_str()).unwrap_or("GET"),
                    d.get("status").and_then(|v| v.as_str()).unwrap_or("undone"),
                ),
            );
            let yapi_status = match status {
                "released" => "done",
                "designing" => "designing",
                _ => "undone",
            };
            serde_json::json!({
                "_id": item.id,
                "title": item.name,
                "path": path,
                "method": method,
                "status": yapi_status,
                "catid": item.parent_id,
            })
        })
        .collect();

    yapi_ok(Value::Array(list))
}

// ── POST handlers ──

async fn handle_add_cat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Json(body): Json<Value>,
) -> Json<Value> {
    let body_token = body.get("token").and_then(|v| v.as_str());
    let project_id = match resolve_project_id(&state, &headers, qtoken(&query), body_token) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let name = match body.get("name").and_then(|v| v.as_str()) {
        Some(n) => n,
        None => return yapi_error("缺少必要参数: name"),
    };
    let folder_id = Uuid::new_v4().to_string();
    let sort_order = match menu_repo::get_max_sort_order(&state.db, &project_id) {
        Ok(n) => n + 1,
        Err(e) => return yapi_error(&format!("查询排序失败: {e}")),
    };
    let desc = body.get("desc").and_then(|v| v.as_str()).unwrap_or("");
    let payload = CreateMenuItemPayload {
        id: folder_id.clone(),
        parent_id: None,
        name: name.to_string(),
        menu_type: "apiDetailFolder".to_string(),
        data_json: None,
        sort_order: Some(sort_order),
    };
    match menu_repo::create_menu_item(&state.db, &project_id, &payload) {
        Ok(_) => yapi_ok(serde_json::json!({
            "_id": folder_id,
            "name": name,
            "desc": desc,
            "index": 0,
        })),
        Err(e) => yapi_error(&format!("创建分类失败: {e}")),
    }
}

async fn handle_interface_save(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Json(body): Json<Value>,
) -> Json<Value> {
    let body_token = body.get("token").and_then(|v| v.as_str());
    let project_id = match resolve_project_id(&state, &headers, qtoken(&query), body_token) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let title = match body.get("title").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return yapi_error("缺少必要参数: title, path, method"),
    };
    let path = match body.get("path").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return yapi_error("缺少必要参数: title, path, method"),
    };
    let method = match body.get("method").and_then(|v| v.as_str()) {
        Some(m) => m,
        None => return yapi_error("缺少必要参数: title, path, method"),
    };

    // Resolve category
    let catid_raw = body.get("catid");
    let catid = if let Some(v) = catid_raw {
        let s = if v.is_number() { v.to_string() } else { v.as_str().unwrap_or("").to_string() };
        if s.is_empty() {
            match ensure_default_folder(&state.db, &project_id) {
                Ok(id) => id,
                Err(e) => return yapi_error(&format!("创建默认分类失败: {e}")),
            }
        } else {
            s
        }
    } else {
        match ensure_default_folder(&state.db, &project_id) {
            Ok(id) => id,
            Err(e) => return yapi_error(&format!("创建默认分类失败: {e}")),
        }
    };

    let yapi_data = build_yapi_from_save_body(&body);
    let api_details = yapi_service::yapi_to_api_details(&yapi_data);

    // If id is provided, update the existing item directly
    if let Some(existing_id) = body.get("id").and_then(|v| v.as_str()) {
        match menu_repo::get_menu_item(&state.db, &project_id, existing_id) {
            Ok(Some(existing)) => {
                match upsert_menu_item_data(&state.db, &project_id, &existing, &catid, title, &api_details) {
                    Ok(result) => return yapi_ok(result),
                    Err(e) => return yapi_error(&format!("更新失败: {e}")),
                }
            }
            Ok(None) => { /* fall through to create new */ }
            Err(e) => return yapi_error(&format!("查询失败: {e}")),
        }
    }

    // Try to find by path+method project-wide
    if let Some(existing) = find_existing_interface(&state.db, &project_id, path, method) {
        match upsert_menu_item_data(&state.db, &project_id, &existing, &catid, title, &api_details) {
            Ok(result) => return yapi_ok(result),
            Err(e) => return yapi_error(&format!("更新失败: {e}")),
        }
    }

    // Create new
    let menu_item_id = Uuid::new_v4().to_string();
    let sort_order = match menu_repo::get_max_sort_order(&state.db, &project_id) {
        Ok(n) => n + 1,
        Err(e) => return yapi_error(&format!("查询排序失败: {e}")),
    };
    let payload = CreateMenuItemPayload {
        id: menu_item_id.clone(),
        parent_id: Some(catid),
        name: title.to_string(),
        menu_type: "apiDetail".to_string(),
        data_json: Some(api_details),
        sort_order: Some(sort_order),
    };
    match menu_repo::create_menu_item(&state.db, &project_id, &payload) {
        Ok(_) => yapi_ok(serde_json::json!({ "_id": menu_item_id })),
        Err(e) => yapi_error(&format!("创建接口失败: {e}")),
    }
}

async fn handle_interface_up(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Json(body): Json<Value>,
) -> Json<Value> {
    let body_token = body.get("token").and_then(|v| v.as_str());
    let project_id = match resolve_project_id(&state, &headers, qtoken(&query), body_token) {
        Some(id) => id,
        None => return yapi_error("token 无效"),
    };
    let id = match body.get("id").and_then(|v| v.as_str()) {
        Some(v) => v,
        None => return yapi_error("缺少必要参数: id"),
    };
    let existing = match menu_repo::get_menu_item(&state.db, &project_id, id) {
        Ok(Some(item)) => item,
        Ok(None) => return yapi_error("接口不存在"),
        Err(e) => return yapi_error(&format!("查询失败: {e}")),
    };

    let yapi_data = build_yapi_from_save_body(&body);
    let api_details = yapi_service::yapi_to_api_details(&yapi_data);
    let title = body.get("title").and_then(|v| v.as_str()).unwrap_or(&existing.name);
    let parent_id = existing.parent_id.clone().unwrap_or_default();

    match upsert_menu_item_data(&state.db, &project_id, &existing, &parent_id, title, &api_details) {
        Ok(result) => yapi_ok(result),
        Err(e) => yapi_error(&format!("更新失败: {e}")),
    }
}

// ── Server lifecycle ──

pub async fn start_yapi_server(
    db: Arc<Db>,
    handle: Arc<YApiServerHandle>,
    preferred_port: u16,
) {
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", preferred_port)).await {
        Ok(l) => l,
        Err(_) => {
            log::warn!("YApi port {} occupied, trying random port", preferred_port);
            tokio::net::TcpListener::bind(("127.0.0.1", 0))
                .await
                .expect("Failed to bind YApi HTTP server")
        }
    };

    let actual_port = listener.local_addr().unwrap().port();
    *handle.port.lock().unwrap() = actual_port;

    let (tx, rx) = oneshot::channel::<()>();
    *handle.shutdown_tx.lock().unwrap() = Some(tx);

    let router = build_router(db);
    log::info!("YApi HTTP server started on 127.0.0.1:{}", actual_port);

    let _ = axum::serve(listener, router)
        .with_graceful_shutdown(async { rx.await.ok(); })
        .await;

    log::info!("YApi HTTP server stopped");
}

// ── Router ──

fn build_router(db: Arc<Db>) -> Router {
    let state = AppState { db };
    Router::new()
        .route("/api/project/get", get(handle_project_get))
        .route("/api/interface/getCatMenu", get(handle_cat_get_menu))
        .route("/api/cat/getCatMenu", get(handle_cat_get_menu))
        .route("/api/interface/get", get(handle_interface_get))
        .route("/api/interface/list_cat", get(handle_interface_list_cat))
        .route("/api/interface/list_menu", get(handle_interface_list_menu))
        .route("/api/interface/save", post(handle_interface_save))
        .route("/api/interface/up", post(handle_interface_up))
        .route("/api/interface/add_cat", post(handle_add_cat))
        .with_state(state)
}
