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
    pub enabled: bool,
    pub port: u16,
    pub auto_start: bool,
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
    port: Option<u16>,
) -> Result<ApiResult<McpServerStatus>, String> {
    // Check if already running
    if handle.is_running().await {
        let current_port = handle.get_port().await;
        return Ok(ApiResult::success(McpServerStatus {
            running: true,
            port: current_port,
        }));
    }

    let preferred_port = port.unwrap_or(14203);
    let db_clone = db.inner().clone();
    let handle_clone = handle.inner().clone();

    tokio::spawn(async move {
        crate::http::mcp_server::start_mcp_server(db_clone, handle_clone, preferred_port).await;
    });

    // Wait a bit for the server to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    let running = handle.is_running().await;
    let actual_port = handle.get_port().await;

    Ok(ApiResult::success(McpServerStatus {
        running,
        port: actual_port,
    }))
}

#[tauri::command]
pub async fn stop_mcp_server(
    handle: State<'_, Arc<McpServerHandle>>,
) -> Result<ApiResult<McpServerStatus>, String> {
    handle.stop().await;

    Ok(ApiResult::success(McpServerStatus {
        running: false,
        port: 0,
    }))
}

#[tauri::command]
pub async fn get_mcp_server_config(
    app_config: State<'_, Arc<crate::services::app_config::AppConfigService>>,
) -> Result<ApiResult<McpServerConfig>, String> {
    let enabled = app_config
        .get("mcp_enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let port = app_config
        .get("mcp_port")
        .and_then(|v| v.as_u64())
        .unwrap_or(14203) as u16;
    let auto_start = app_config
        .get("mcp_auto_start")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    Ok(ApiResult::success(McpServerConfig {
        enabled,
        port,
        auto_start,
    }))
}

#[tauri::command]
pub async fn save_mcp_server_config(
    app_config: State<'_, Arc<crate::services::app_config::AppConfigService>>,
    config: McpServerConfig,
) -> Result<ApiResult<()>, String> {
    app_config.set("mcp_enabled", serde_json::json!(config.enabled));
    app_config.set("mcp_port", serde_json::json!(config.port));
    app_config.set("mcp_auto_start", serde_json::json!(config.auto_start));

    Ok(ApiResult::success(()))
}

use serde::{Deserialize, Serialize};
