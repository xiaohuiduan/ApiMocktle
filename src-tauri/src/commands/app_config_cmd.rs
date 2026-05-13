use std::sync::Arc;

use crate::models::*;
use crate::services::app_config::AppConfigService;

#[tauri::command]
pub async fn get_app_config(
    config: tauri::State<'_, Arc<AppConfigService>>,
    key: String,
) -> Result<ApiResult<serde_json::Value>, String> {
    let value = config.get(&key).unwrap_or(serde_json::Value::Null);
    Ok(ApiResult::success(value))
}

#[tauri::command]
pub async fn set_app_config(
    config: tauri::State<'_, Arc<AppConfigService>>,
    key: String,
    value: serde_json::Value,
) -> Result<ApiResult<()>, String> {
    config.set(&key, value);
    Ok(ApiResult::success(()))
}
