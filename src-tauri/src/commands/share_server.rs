use std::path::PathBuf;
use std::sync::Arc;

use tauri::{Manager, State};

use crate::db::client::Db;
use crate::http::share_server::ShareServerHandle;
use crate::models::*;

#[derive(Debug, Serialize, Deserialize)]
pub struct ShareServerStatus {
    pub running: bool,
    pub port: u16,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShareServerConfig {
    pub port: u16,
}

/// 解析前端静态目录：打包后取资源目录 dist/，dev 下取项目根 ../dist
fn resolve_dist_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(p) = app.path().resolve("dist", tauri::path::BaseDirectory::Resource) {
        if p.is_dir() {
            return Some(p);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist");
    if dev.is_dir() {
        Some(dev)
    } else {
        None
    }
}

#[tauri::command]
pub async fn get_share_server_status(
    handle: State<'_, Arc<ShareServerHandle>>,
) -> Result<ApiResult<ShareServerStatus>, String> {
    let running = handle.is_running().await;
    let port = handle.get_port().await;

    Ok(ApiResult::success(ShareServerStatus { running, port }))
}

#[tauri::command]
pub async fn start_share_server(
    app: tauri::AppHandle,
    db: State<'_, Arc<Db>>,
    handle: State<'_, Arc<ShareServerHandle>>,
    port: Option<u16>,
) -> Result<ApiResult<ShareServerStatus>, String> {
    // Check if already running
    if handle.is_running().await {
        let current_port = handle.get_port().await;
        return Ok(ApiResult::success(ShareServerStatus {
            running: true,
            port: current_port,
        }));
    }

    let preferred_port = port.unwrap_or(14204);
    let db_clone = db.inner().clone();
    let handle_clone = handle.inner().clone();
    let dist_dir = resolve_dist_dir(&app);

    tokio::spawn(async move {
        crate::http::share_server::start_share_server(
            db_clone,
            handle_clone,
            preferred_port,
            dist_dir,
        )
        .await;
    });

    // Wait a bit for the server to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    let running = handle.is_running().await;
    let actual_port = handle.get_port().await;

    Ok(ApiResult::success(ShareServerStatus {
        running,
        port: actual_port,
    }))
}

#[tauri::command]
pub async fn stop_share_server(
    handle: State<'_, Arc<ShareServerHandle>>,
) -> Result<ApiResult<ShareServerStatus>, String> {
    handle.stop().await;

    Ok(ApiResult::success(ShareServerStatus {
        running: false,
        port: 0,
    }))
}

#[tauri::command]
pub async fn get_share_server_config(
    app_config: State<'_, Arc<crate::services::app_config::AppConfigService>>,
) -> Result<ApiResult<ShareServerConfig>, String> {
    let port = app_config
        .get("share_port")
        .and_then(|v| v.as_u64())
        .unwrap_or(14204) as u16;

    Ok(ApiResult::success(ShareServerConfig { port }))
}

#[tauri::command]
pub async fn save_share_server_config(
    app_config: State<'_, Arc<crate::services::app_config::AppConfigService>>,
    config: ShareServerConfig,
) -> Result<ApiResult<()>, String> {
    app_config.set("share_port", serde_json::json!(config.port));

    Ok(ApiResult::success(()))
}

/// IPv6 链路本地地址（fe80::/10）无 zone 不可直接访问，过滤掉
fn is_link_local(ip: &std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V6(v6) => v6.segments()[0] == 0xfe80,
        _ => false,
    }
}

/// 本机局域网 IP 列表（用于展示访问地址）
#[tauri::command]
pub async fn get_lan_ip() -> Result<ApiResult<Vec<String>>, String> {
    let ips = match local_ip_address::list_afinet_netifas() {
        Ok(ifas) => ifas
            .into_iter()
            .filter(|(_, ip)| !ip.is_loopback() && !is_link_local(ip))
            .map(|(_, ip)| ip.to_string())
            .collect(),
        Err(_) => Vec::new(),
    };

    Ok(ApiResult::success(ips))
}

use serde::{Deserialize, Serialize};
