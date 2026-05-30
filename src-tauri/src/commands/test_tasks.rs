use std::sync::Arc;

use tauri::State;

use crate::db::client::Db;
use crate::db::menu_repo;
use crate::db::test_repo;
use crate::models::*;
use crate::services::test_engine::{TestEngine, ExtractorDef, AssertionDef, send_http_request};

#[tauri::command]
pub fn list_test_tasks(
    db: State<'_, Arc<Db>>,
    project_id: String,
) -> Result<ApiResult<Vec<TestTask>>, String> {
    match test_repo::list_tasks(&db, &project_id) {
        Ok(tasks) => Ok(ApiResult::success(tasks)),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn get_test_task(
    db: State<'_, Arc<Db>>,
    task_id: String,
) -> Result<ApiResult<TestTaskDetail>, String> {
    match test_repo::get_task(&db, &task_id) {
        Ok(Some(task)) => {
            match test_repo::list_steps(&db, &task_id) {
                Ok(steps) => Ok(ApiResult::success(TestTaskDetail { task, steps })),
                Err(e) => Ok(ApiResult::from(e)),
            }
        }
        Ok(None) => Ok(ApiResult {
            ok: false,
            data: None,
            error: Some("Task not found".to_string()),
        }),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn create_test_task(
    db: State<'_, Arc<Db>>,
    payload: CreateTestTaskPayload,
) -> Result<ApiResult<TestTask>, String> {
    match test_repo::create_task(&db, &payload) {
        Ok(task) => Ok(ApiResult::success(task)),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_test_task(
    db: State<'_, Arc<Db>>,
    task_id: String,
    payload: UpdateTestTaskPayload,
) -> Result<ApiResult<TestTask>, String> {
    match test_repo::update_task(&db, &task_id, &payload) {
        Ok(task) => Ok(ApiResult::success(task)),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn delete_test_task(
    db: State<'_, Arc<Db>>,
    task_id: String,
) -> Result<ApiResult<()>, String> {
    match test_repo::delete_task(&db, &task_id) {
        Ok(_) => Ok(ApiResult::success(())),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn list_test_steps(
    db: State<'_, Arc<Db>>,
    task_id: String,
) -> Result<ApiResult<Vec<TestStep>>, String> {
    match test_repo::list_steps(&db, &task_id) {
        Ok(steps) => Ok(ApiResult::success(steps)),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn create_test_step(
    db: State<'_, Arc<Db>>,
    payload: CreateTestStepPayload,
) -> Result<ApiResult<TestStep>, String> {
    match test_repo::create_step(&db, &payload) {
        Ok(step) => Ok(ApiResult::success(step)),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn update_test_step(
    db: State<'_, Arc<Db>>,
    step_id: String,
    payload: UpdateTestStepPayload,
) -> Result<ApiResult<TestStep>, String> {
    match test_repo::update_step(&db, &step_id, &payload) {
        Ok(step) => Ok(ApiResult::success(step)),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn delete_test_step(
    db: State<'_, Arc<Db>>,
    step_id: String,
) -> Result<ApiResult<()>, String> {
    match test_repo::delete_step(&db, &step_id) {
        Ok(_) => Ok(ApiResult::success(())),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn reorder_test_steps(
    db: State<'_, Arc<Db>>,
    task_id: String,
    payload: ReorderStepsPayload,
) -> Result<ApiResult<()>, String> {
    match test_repo::reorder_steps(&db, &task_id, &payload.step_ids) {
        Ok(_) => Ok(ApiResult::success(())),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn list_test_executions(
    db: State<'_, Arc<Db>>,
    task_id: String,
    limit: Option<i32>,
) -> Result<ApiResult<Vec<TestExecution>>, String> {
    match test_repo::list_executions(&db, &task_id, limit.unwrap_or(20)) {
        Ok(executions) => Ok(ApiResult::success(executions)),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn get_test_execution_detail(
    db: State<'_, Arc<Db>>,
    execution_id: String,
) -> Result<ApiResult<TestExecutionDetail>, String> {
    match test_repo::get_execution_detail(&db, &execution_id) {
        Ok(Some(detail)) => Ok(ApiResult::success(detail)),
        Ok(None) => Ok(ApiResult {
            ok: false,
            data: None,
            error: Some("Execution not found".to_string()),
        }),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn delete_test_execution(
    db: State<'_, Arc<Db>>,
    execution_id: String,
) -> Result<ApiResult<()>, String> {
    match test_repo::delete_execution(&db, &execution_id) {
        Ok(_) => Ok(ApiResult::success(())),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub async fn execute_test_step_request(
    db: State<'_, Arc<Db>>,
    _session_id: String,
    project_id: String,
    step_id: String,
    variables: serde_json::Value,
    base_url: Option<String>,
) -> Result<ApiResult<serde_json::Value>, String> {
    // Get the step
    let step = match test_repo::get_step(&db, &step_id) {
        Ok(Some(step)) => step,
        Ok(None) => {
            return Ok(ApiResult {
                ok: false,
                data: None,
                error: Some("Step not found".to_string()),
            });
        }
        Err(e) => return Ok(ApiResult::from(e)),
    };

    // Get the menu item
    let menu_items = match menu_repo::list_menu_items(&db, &project_id) {
        Ok(items) => items,
        Err(e) => return Ok(ApiResult::from(e)),
    };

    let menu_item = menu_items.iter().find(|item| item.id == step.menu_item_id);
    let menu_item = match menu_item {
        Some(item) => item.clone(),
        None => {
            return Ok(ApiResult {
                ok: false,
                data: None,
                error: Some("Menu item not found".to_string()),
            });
        }
    };

    // Parse variables
    let vars: std::collections::HashMap<String, String> = if let Some(obj) = variables.as_object() {
        obj.iter()
            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
            .collect()
    } else {
        std::collections::HashMap::new()
    };

    // Build request payload
    let request_payload = match TestEngine::build_request_payload(
        &menu_item,
        step.request_override_json.as_ref(),
        &vars,
        base_url.as_deref(),
    ) {
        Ok(payload) => payload,
        Err(e) => return Ok(ApiResult::from(e)),
    };

    // Actually send the HTTP request
    let request_result: serde_json::Value = match send_http_request(&request_payload).await {
        Ok(response_value) => response_value,
        Err(e) => {
            return Ok(ApiResult {
                ok: false,
                data: None,
                error: Some(e),
            });
        }
    };

    Ok(ApiResult::success(request_result))
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_test_execution(
    db: State<'_, Arc<Db>>,
    task_id: String,
    env_json: Option<serde_json::Value>,
) -> Result<ApiResult<TestExecution>, String> {
    match test_repo::create_execution(&db, &task_id, env_json.as_ref()) {
        Ok(execution) => Ok(ApiResult::success(execution)),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn finish_test_execution(
    db: State<'_, Arc<Db>>,
    exec_id: String,
    status: String,
    passed: i32,
    failed: i32,
    skipped: i32,
    duration: i64,
) -> Result<ApiResult<()>, String> {
    match test_repo::finish_execution(&db, &exec_id, &status, passed, failed, skipped, duration) {
        Ok(_) => Ok(ApiResult::success(())),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn create_test_step_result(
    db: State<'_, Arc<Db>>,
    result: TestStepResult,
) -> Result<ApiResult<()>, String> {
    match test_repo::create_step_result(&db, &result) {
        Ok(_) => Ok(ApiResult::success(())),
        Err(e) => Ok(ApiResult::from(e)),
    }
}

#[tauri::command]
pub fn execute_extractors(
    extractors: Vec<ExtractorDef>,
    response_body: String,
    status_code: i32,
    response_headers: std::collections::HashMap<String, String>,
) -> Result<ApiResult<serde_json::Value>, String> {
    let (results, variables) = TestEngine::extract_values(
        &extractors,
        &response_body,
        status_code,
        &response_headers,
    );

    Ok(ApiResult::success(serde_json::json!({
        "results": results,
        "variables": variables,
    })))
}

#[tauri::command]
pub fn execute_assertions(
    assertions: Vec<AssertionDef>,
    response_body: String,
    status_code: i32,
    response_headers: std::collections::HashMap<String, String>,
    duration_ms: i64,
) -> Result<ApiResult<Vec<crate::services::test_engine::AssertionResult>>, String> {
    let results = TestEngine::evaluate_assertions(
        &assertions,
        &response_body,
        status_code,
        &response_headers,
        duration_ms,
    );

    Ok(ApiResult::success(results))
}
