use std::sync::Arc;
use tauri::State;

use crate::db::client::Db;
use crate::http::mcp_server::McpServerHandle;
use crate::models::*;

#[derive(Debug, Serialize, Deserialize)]
pub struct McpServerStatus {
    pub running: bool,
    pub port: u16,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub port: u16,
}

#[tauri::command]
pub async fn get_mcp_server_status(
    handle: State<'_, Arc<McpServerHandle>>,
) -> Result<ApiResult<McpServerStatus>, String> {
    let running = handle.is_running().await;
    let port = handle.get_port().await;

    Ok(ApiResult::success(McpServerStatus { running, port }))
}

#[tauri::command]
pub async fn start_mcp_server(
    db: State<'_, Arc<Db>>,
    handle: State<'_, Arc<McpServerHandle>>,
    app_config: State<'_, Arc<crate::services::app_config::AppConfigService>>,
    port: Option<u16>,
) -> Result<ApiResult<McpServerStatus>, String> {
    // Check if already running
    if handle.is_running().await {
        // 手动启动过一次就记住，下次开程序自动拉起
        app_config.set("mcp_auto_start", serde_json::json!(true));
        let current_port = handle.get_port().await;
        return Ok(ApiResult::success(McpServerStatus {
            running: true,
            port: current_port,
        }));
    }

    let preferred_port = port.unwrap_or(14203);
    let host = app_config
        .get("mcp_host")
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_else(|| "0.0.0.0".to_string());
    let db_clone = db.inner().clone();
    let handle_clone = handle.inner().clone();

    tokio::spawn(async move {
        crate::http::mcp_server::start_mcp_server(db_clone, handle_clone, preferred_port, &host).await;
    });

    // Wait a bit for the server to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    let running = handle.is_running().await;
    let actual_port = handle.get_port().await;

    if running {
        app_config.set("mcp_auto_start", serde_json::json!(true));
    }

    Ok(ApiResult::success(McpServerStatus {
        running,
        port: actual_port,
    }))
}

#[tauri::command]
pub async fn stop_mcp_server(
    handle: State<'_, Arc<McpServerHandle>>,
    app_config: State<'_, Arc<crate::services::app_config::AppConfigService>>,
) -> Result<ApiResult<McpServerStatus>, String> {
    handle.stop().await;
    // 手动停掉就记住，下次开程序不再自动拉起
    app_config.set("mcp_auto_start", serde_json::json!(false));

    Ok(ApiResult::success(McpServerStatus {
        running: false,
        port: 0,
    }))
}

#[tauri::command]
pub async fn get_mcp_server_config(
    app_config: State<'_, Arc<crate::services::app_config::AppConfigService>>,
) -> Result<ApiResult<McpServerConfig>, String> {
    let port = app_config
        .get("mcp_port")
        .and_then(|v| v.as_u64())
        .unwrap_or(14203) as u16;

    Ok(ApiResult::success(McpServerConfig { port }))
}

#[tauri::command]
pub async fn save_mcp_server_config(
    app_config: State<'_, Arc<crate::services::app_config::AppConfigService>>,
    config: McpServerConfig,
) -> Result<ApiResult<()>, String> {
    app_config.set("mcp_port", serde_json::json!(config.port));

    Ok(ApiResult::success(()))
}

use serde::{Deserialize, Serialize};
