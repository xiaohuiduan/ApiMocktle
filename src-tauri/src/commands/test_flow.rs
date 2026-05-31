use std::sync::Arc;

use tauri::State;

use crate::db::client::Db;
use crate::db::flow_repo;
use crate::models::ApiResult;

#[tauri::command]
pub fn save_test_flow_graph(
    db: State<'_, Arc<Db>>,
    task_id: String,
    graph_json: serde_json::Value,
) -> Result<ApiResult<()>, String> {
    match flow_repo::save_flow_graph(&db, &task_id, &graph_json) {
        Ok(_) => Ok(ApiResult::success(())),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn load_test_flow_graph(
    db: State<'_, Arc<Db>>,
    task_id: String,
) -> Result<ApiResult<Option<serde_json::Value>>, String> {
    match flow_repo::load_flow_graph(&db, &task_id) {
        Ok(graph) => Ok(ApiResult::success(graph)),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn delete_test_flow_graph(
    db: State<'_, Arc<Db>>,
    task_id: String,
) -> Result<ApiResult<()>, String> {
    match flow_repo::delete_flow_graph(&db, &task_id) {
        Ok(_) => Ok(ApiResult::success(())),
        Err(e) => Ok(ApiResult::from(e)),
    }
}
