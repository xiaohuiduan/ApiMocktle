use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use tokio::sync::Mutex;
use tower_http::services::{ServeDir, ServeFile};
use uuid::Uuid;

use crate::db::client::Db;
use crate::db::{menu_repo, project_repo, share_repo};

/// 局域网文档分享服务器 Handle（照抄 McpServerHandle：tokio 锁 + stop 回写 0）
pub struct ShareServerHandle {
    pub port: Mutex<u16>,
    pub shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

impl ShareServerHandle {
    pub fn new() -> Self {
        Self {
            port: Mutex::new(0),
            shutdown_tx: Mutex::new(None),
        }
    }

    pub async fn is_running(&self) -> bool {
        *self.port.lock().await > 0
    }

    pub async fn get_port(&self) -> u16 {
        *self.port.lock().await
    }

    pub async fn stop(&self) {
        let mut shutdown_tx = self.shutdown_tx.lock().await;
        if let Some(tx) = shutdown_tx.take() {
            let _ = tx.send(());
        }
        let mut port = self.port.lock().await;
        *port = 0;
    }
}

impl Default for ShareServerHandle {
    fn default() -> Self {
        Self::new()
    }
}

/// 登录成功的会话（内存态，服务器重启后需重新输密码）
pub(crate) struct ShareSession {
    share_id: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

const SESSION_TTL_SECS: i64 = 24 * 60 * 60; // 24h 滑动过期

#[derive(Clone)]
pub struct AppState {
    pub(crate) db: Arc<Db>,
    pub(crate) sessions: Arc<Mutex<HashMap<String, ShareSession>>>,
    pub(crate) dist_dir: Option<Arc<PathBuf>>,
}

fn err_response(status: StatusCode, msg: &str) -> Response {
    (
        status,
        Json(serde_json::json!({
            "errcode": status.as_u16(),
            "errmsg": msg,
            "data": null,
        })),
    )
        .into_response()
}

/// 校验 X-Share-Token，返回当前分享链接（含未过期校验）。删除链接后即时失效。
async fn auth_session(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<crate::models::ShareLink, Response> {
    let token = headers
        .get("X-Share-Token")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| err_response(StatusCode::UNAUTHORIZED, "未登录"))?;

    let now = chrono::Utc::now();
    let mut sessions = state.sessions.lock().await;
    let session = sessions
        .get_mut(token)
        .ok_or_else(|| err_response(StatusCode::UNAUTHORIZED, "登录已失效，请重新输入密码"))?;

    if (now - session.created_at).num_seconds() > SESSION_TTL_SECS {
        sessions.remove(token);
        return Err(err_response(StatusCode::UNAUTHORIZED, "登录已失效，请重新输入密码"));
    }
    // 滑动过期：每次命中刷新
    session.created_at = now;

    let link = share_repo::get_share_link(&state.db, &session.share_id)
        .map_err(|e| err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?
        .ok_or_else(|| err_response(StatusCode::NOT_FOUND, "分享链接不存在或已被删除"))?;

    if share_repo::share_expired(&link.expires_at) {
        return Err(err_response(StatusCode::FORBIDDEN, "分享链接已过期"));
    }

    Ok(link)
}

/// 按分享范围过滤菜单项：api_menu_ids 为空 = 全量
fn filter_items(
    items: Vec<crate::models::ApiMenuData>,
    allowed: &[String],
) -> Vec<crate::models::ApiMenuData> {
    if allowed.is_empty() {
        items
    } else {
        items
            .into_iter()
            .filter(|i| allowed.contains(&i.id))
            .collect()
    }
}

// ---------- API handlers ----------

#[derive(Deserialize)]
struct LoginPayload {
    #[serde(rename = "shareId")]
    share_id: String,
    password: String,
}

async fn handle_login(
    State(state): State<AppState>,
    Json(body): Json<LoginPayload>,
) -> Response {
    let link = match share_repo::get_share_link(&state.db, &body.share_id) {
        Ok(Some(l)) => l,
        Ok(None) => return err_response(StatusCode::NOT_FOUND, "分享链接不存在"),
        Err(e) => return err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };

    if share_repo::share_expired(&link.expires_at) {
        return err_response(StatusCode::FORBIDDEN, "分享链接已过期");
    }

    // 无密码分享：直接放行
    let Some(hash) = &link.password_hash else {
        let token = Uuid::new_v4().to_string();
        let session = ShareSession {
            share_id: link.id.clone(),
            created_at: chrono::Utc::now(),
        };
        state.sessions.lock().await.insert(token.clone(), session);

        let project_name = project_repo::get_project_by_id(&state.db, &link.project_id)
            .ok()
            .flatten()
            .map(|(_, name)| name)
            .unwrap_or_default();

        return (
            StatusCode::OK,
            Json(serde_json::json!({
                "errcode": 0,
                "errmsg": "成功!",
                "data": {
                    "token": token,
                    "projectName": project_name,
                    "title": link.title,
                    "expiresAt": link.expires_at,
                }
            })),
        )
            .into_response();
    };
    if !crate::services::crypto::verify_password(&body.password, hash) {
        return err_response(StatusCode::UNAUTHORIZED, "密码错误");
    }

    let token = Uuid::new_v4().to_string();
    let session = ShareSession {
        share_id: link.id.clone(),
        created_at: chrono::Utc::now(),
    };
    state.sessions.lock().await.insert(token.clone(), session);

    let project_name = project_repo::get_project_by_id(&state.db, &link.project_id)
        .ok()
        .flatten()
        .map(|(_, name)| name)
        .unwrap_or_default();

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "errcode": 0,
            "errmsg": "成功!",
            "data": {
                "token": token,
                "projectName": project_name,
                "title": link.title,
                "expiresAt": link.expires_at,
            }
        })),
    )
        .into_response()
}

async fn handle_menu(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let link = match auth_session(&state, &headers).await {
        Ok(l) => l,
        Err(resp) => return resp,
    };

    let items = match menu_repo::list_menu_items(&state.db, &link.project_id) {
        Ok(v) => v,
        Err(e) => return err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };
    let items = filter_items(items, &link.api_menu_ids);

    let project = project_repo::get_project_by_id(&state.db, &link.project_id)
        .ok()
        .flatten()
        .map(|(id, name)| serde_json::json!({ "id": id, "name": name }))
        .unwrap_or_else(|| serde_json::json!({ "id": link.project_id, "name": "" }));

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "errcode": 0,
            "errmsg": "成功!",
            "data": {
                "shareId": link.id,
                "project": project,
                "title": link.title,
                "expiresAt": link.expires_at,
                "items": items,
            }
        })),
    )
        .into_response()
}

async fn handle_item(
    Path(id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Response {
    let link = match auth_session(&state, &headers).await {
        Ok(l) => l,
        Err(resp) => return resp,
    };

    if !link.api_menu_ids.is_empty() && !link.api_menu_ids.contains(&id) {
        return err_response(StatusCode::FORBIDDEN, "该内容不在分享范围内");
    }

    let item = match menu_repo::get_menu_item(&state.db, &link.project_id, &id) {
        Ok(Some(v)) => v,
        Ok(None) => return err_response(StatusCode::NOT_FOUND, "内容不存在"),
        Err(e) => return err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "errcode": 0,
            "errmsg": "成功!",
            "data": item,
        })),
    )
        .into_response()
}

async fn handle_overview(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let link = match auth_session(&state, &headers).await {
        Ok(l) => l,
        Err(resp) => return resp,
    };

    let items = match menu_repo::list_menu_items(&state.db, &link.project_id) {
        Ok(v) => v,
        Err(e) => return err_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };
    let items = filter_items(items, &link.api_menu_ids);

    let mut api_count = 0;
    let mut doc_count = 0;
    let mut schema_count = 0;
    let mut folder_count = 0;
    let mut updated_at: Option<String> = None;
    for item in &items {
        match item.menu_type.as_str() {
            "apiDetail" => api_count += 1,
            "doc" => doc_count += 1,
            "apiSchema" => schema_count += 1,
            "apiDetailFolder" | "apiSchemaFolder" | "requestFolder" => folder_count += 1,
            _ => {}
        }
        if updated_at.as_deref().is_none_or(|cur| item.updated_at.as_str() > cur) {
            updated_at = Some(item.updated_at.clone());
        }
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "errcode": 0,
            "errmsg": "成功!",
            "data": {
                "apiCount": api_count,
                "docCount": doc_count,
                "schemaCount": schema_count,
                "folderCount": folder_count,
                "itemCount": items.len(),
                "updatedAt": updated_at,
            }
        })),
    )
        .into_response()
}

// ---------- 静态托管 ----------

const BUILD_HINT_HTML: &str = r#"<!DOCTYPE html>
<html lang="zh-Hans-CN">
<head><meta charset="utf-8" /><title>ApiMocktle 分享</title></head>
<body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5;">
  <div style="background: #fff; padding: 32px 48px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center;">
    <h2 style="margin: 0 0 12px;">分享页面不可用</h2>
    <p style="color: #666; margin: 0;">前端页面未构建（缺少 dist/share.html）。<br/>请在桌面端执行 <code>pnpm build</code> 后重启分享服务。</p>
  </div>
</body>
</html>"#;

fn build_router(state: AppState) -> Router {
    // nest_service 会剥离 /assets 前缀，ServeDir 需指向 dist/assets 才能解析到实际文件
    let dist_dir = state.dist_dir.clone().map(|p| p.as_ref().clone()).unwrap_or_default();
    let mut router = Router::new()
        .nest_service("/assets", ServeDir::new(dist_dir.join("assets")))
        .route("/api/share/login", post(handle_login))
        .route("/api/share/menu", get(handle_menu))
        // 注意：axum 0.7 在此环境用 {id} 语法不匹配路由，使用兼容的 :id 语法
        .route("/api/share/item/:id", get(handle_item))
        .route("/api/share/overview", get(handle_overview))
        .fallback(get(handle_not_found));

    // 静态入口：share.html 存在则直接服务，否则返回构建提示
    if let Some(dir) = &state.dist_dir {
        let share_html = dir.join("share.html");
        if share_html.exists() {
            router = router.route_service("/", ServeFile::new(share_html));
            return router.with_state(state);
        }
    }
    router.route("/", get(handle_root)).with_state(state)
}

async fn handle_root() -> Response {
    Html(BUILD_HINT_HTML).into_response()
}

async fn handle_not_found() -> Response {
    err_response(StatusCode::NOT_FOUND, "接口不存在")
}

// ---------- 生命周期 ----------

/// 绑定 0.0.0.0（局域网可访问），端口被占用则随机回退。
pub async fn start_share_server(
    db: Arc<Db>,
    handle: Arc<ShareServerHandle>,
    preferred_port: u16,
    dist_dir: Option<PathBuf>,
) {
    let listener = match tokio::net::TcpListener::bind(("0.0.0.0", preferred_port)).await {
        Ok(l) => l,
        Err(_) => {
            log::warn!(
                "Share server port {} occupied, trying random port",
                preferred_port
            );
            tokio::net::TcpListener::bind(("0.0.0.0", 0))
                .await
                .expect("Failed to bind share server")
        }
    };
    let port = listener.local_addr().unwrap().port();
    {
        let mut g = handle.port.lock().await;
        *g = port;
    }
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut g = handle.shutdown_tx.lock().await;
        *g = Some(shutdown_tx);
    }

    let state = AppState {
        db,
        sessions: Arc::new(Mutex::new(HashMap::new())),
        dist_dir: dist_dir.map(Arc::new),
    };
    let router = build_router(state);

    log::info!("Share server started on 0.0.0.0:{}", port);
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            shutdown_rx.await.ok();
        })
        .await
        .expect("Share server error");
    log::info!("Share server stopped");
    {
        let mut g = handle.port.lock().await;
        *g = 0;
    }
}
