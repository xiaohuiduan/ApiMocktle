use rusqlite::params;
use serde_json;

use crate::db::client::Db;
use crate::errors::AppError;
use crate::models::*;

// ==================== Test Folders ====================

pub fn create_folder(db: &Db, payload: &CreateTestFolderPayload) -> Result<TestFolder, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let max_order: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM test_folders WHERE project_id = ?1",
            params![payload.project_id],
            |row| row.get(0),
        )
        .unwrap_or(-1);

    conn.execute(
        "INSERT INTO test_folders (id, project_id, name, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, payload.project_id, payload.name, max_order + 1, now, now],
    ).map_err(|e| AppError::Internal(e.to_string()))?;

    drop(conn);
    get_folder(db, &id)?.ok_or_else(|| AppError::Internal("Failed to create folder".to_string()))
}

pub fn get_folder(db: &Db, folder_id: &str) -> Result<Option<TestFolder>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, name, sort_order, created_at, updated_at FROM test_folders WHERE id = ?1")
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut rows = stmt
        .query_map(params![folder_id], |row| {
            Ok(TestFolder {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                sort_order: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

    rows.next().transpose().map_err(|e| AppError::Internal(e.to_string()))
}

pub fn list_folders(db: &Db, project_id: &str) -> Result<Vec<TestFolder>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, name, sort_order, created_at, updated_at FROM test_folders WHERE project_id = ?1 ORDER BY sort_order ASC")
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok(TestFolder {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                sort_order: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut folders = Vec::new();
    for row in rows {
        folders.push(row.map_err(|e| AppError::Internal(e.to_string()))?);
    }
    Ok(folders)
}

pub fn update_folder(db: &Db, folder_id: &str, payload: &UpdateTestFolderPayload) -> Result<TestFolder, AppError> {
    let folder = get_folder(db, folder_id)?.ok_or_else(|| AppError::NotFound("Folder not found".to_string()))?;
    let name = payload.name.as_deref().unwrap_or(&folder.name);

    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE test_folders SET name = ?1, updated_at = ?2 WHERE id = ?3",
        params![name, now, folder_id],
    ).map_err(|e| AppError::Internal(e.to_string()))?;

    drop(conn);
    get_folder(db, folder_id)?.ok_or_else(|| AppError::Internal("Failed to update folder".to_string()))
}

pub fn delete_folder(db: &Db, folder_id: &str) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    // 将该文件夹下的任务 folder_id 置空（回到默认）
    conn.execute(
        "UPDATE test_tasks SET folder_id = NULL, updated_at = ?1 WHERE folder_id = ?2",
        params![chrono::Utc::now().to_rfc3339(), folder_id],
    ).map_err(|e| AppError::Internal(e.to_string()))?;
    conn.execute("DELETE FROM test_folders WHERE id = ?1", params![folder_id])
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

pub fn move_task_to_folder(db: &Db, task_id: &str, folder_id: Option<&str>) -> Result<TestTask, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE test_tasks SET folder_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![folder_id, now, task_id],
    ).map_err(|e| AppError::Internal(e.to_string()))?;
    drop(conn);
    get_task(db, task_id)?.ok_or_else(|| AppError::Internal("Task not found".to_string()))
}

// ==================== Test Tasks ====================

pub fn create_task(db: &Db, payload: &CreateTestTaskPayload) -> Result<TestTask, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO test_tasks (id, project_id, name, description, folder_id, environment_id, status, fail_fast, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'idle', ?7, ?8, ?9)",
        params![id, payload.project_id, payload.name, payload.description, payload.folder_id, payload.environment_id, payload.fail_fast, now, now],
    ).map_err(|e| AppError::Internal(e.to_string()))?;

    drop(conn);
    get_task(db, &id)?.ok_or_else(|| AppError::Internal("Failed to create task".to_string()))
}

pub fn update_task(db: &Db, task_id: &str, payload: &UpdateTestTaskPayload) -> Result<TestTask, AppError> {
    // 先读取当前数据（不在锁内），避免 Mutex 重入死锁
    let task = get_task(db, task_id)?.ok_or_else(|| AppError::NotFound("Task not found".to_string()))?;

    let name = payload.name.as_deref().unwrap_or(&task.name);
    let description = payload.description.as_deref().unwrap_or(&task.description);
    let environment_id = payload.environment_id.as_deref().or(task.environment_id.as_deref());
    let fail_fast = payload.fail_fast.unwrap_or(task.fail_fast);
    let variables_json = payload.variables_json.as_ref()
        .map(|v| v.to_string())
        .or(task.variables_json.map(|v| v.to_string()));
    let folder_id = match &payload.folder_id {
        Some(Some(fid)) => Some(fid.as_str()),
        Some(None) => None, // 显式设为 null → 移回默认
        None => task.folder_id.as_deref(),
    };

    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE test_tasks SET name = ?1, description = ?2, folder_id = ?3, environment_id = ?4, variables_json = ?5, fail_fast = ?6, updated_at = ?7
         WHERE id = ?8",
        params![name, description, folder_id, environment_id, variables_json, fail_fast, now, task_id],
    ).map_err(|e| AppError::Internal(e.to_string()))?;

    drop(conn);
    get_task(db, task_id)?.ok_or_else(|| AppError::Internal("Failed to update task".to_string()))
}

pub fn delete_task(db: &Db, task_id: &str) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    conn.execute("DELETE FROM test_tasks WHERE id = ?1", params![task_id])
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

pub fn get_task(db: &Db, task_id: &str) -> Result<Option<TestTask>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, name, description, folder_id, environment_id, environment_json, variables_json, status, fail_fast, created_at, updated_at FROM test_tasks WHERE id = ?1")
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut rows = stmt
        .query_map(params![task_id], |row| {
            let env_json_str: Option<String> = row.get(6)?;
            let env_json: Option<serde_json::Value> = env_json_str
                .and_then(|s| serde_json::from_str(&s).ok());

            let variables_json_str: Option<String> = row.get(7)?;
            let variables_json: Option<serde_json::Value> = variables_json_str
                .and_then(|s| serde_json::from_str(&s).ok());

            Ok(TestTask {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                folder_id: row.get(4)?,
                environment_id: row.get(5)?,
                environment_json: env_json,
                variables_json,
                status: row.get(8)?,
                fail_fast: row.get::<_, i32>(9)? != 0,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

    rows.next().transpose().map_err(|e| AppError::Internal(e.to_string()))
}

pub fn list_tasks(db: &Db, project_id: &str) -> Result<Vec<TestTask>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, name, description, folder_id, environment_id, environment_json, variables_json, status, fail_fast, created_at, updated_at FROM test_tasks WHERE project_id = ?1 ORDER BY created_at DESC")
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let rows = stmt
        .query_map(params![project_id], |row| {
            let env_json_str: Option<String> = row.get(6)?;
            let env_json: Option<serde_json::Value> = env_json_str
                .and_then(|s| serde_json::from_str(&s).ok());

            let variables_json_str: Option<String> = row.get(7)?;
            let variables_json: Option<serde_json::Value> = variables_json_str
                .and_then(|s| serde_json::from_str(&s).ok());

            Ok(TestTask {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                folder_id: row.get(4)?,
                environment_id: row.get(5)?,
                environment_json: env_json,
                variables_json,
                status: row.get(8)?,
                fail_fast: row.get::<_, i32>(9)? != 0,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut tasks = Vec::new();
    for row in rows {
        tasks.push(row.map_err(|e| AppError::Internal(e.to_string()))?);
    }
    Ok(tasks)
}

pub fn get_task_variables(db: &Db, task_id: &str) -> Result<Option<serde_json::Value>, AppError> {
    let task = get_task(db, task_id)?;
    Ok(task.and_then(|t| t.variables_json))
}

pub fn set_task_variables(db: &Db, task_id: &str, variables: &serde_json::Value) -> Result<serde_json::Value, AppError> {
    let task = get_task(db, task_id)?.ok_or_else(|| AppError::NotFound("Task not found".to_string()))?;

    let mut merged = match task.variables_json {
        Some(serde_json::Value::Object(existing)) => existing,
        _ => serde_json::Map::new(),
    };

    if let serde_json::Value::Object(new_vars) = variables {
        for (key, value) in new_vars {
            merged.insert(key.clone(), value.clone());
        }
    }

    let merged_json = serde_json::Value::Object(merged);
    let payload = UpdateTestTaskPayload {
        name: None,
        description: None,
        folder_id: None,
        environment_id: None,
        variables_json: Some(merged_json.clone()),
        fail_fast: None,
    };

    update_task(db, task_id, &payload)?;
    Ok(merged_json)
}

// ==================== Test Steps ====================

pub fn create_step(db: &Db, payload: &CreateTestStepPayload) -> Result<TestStep, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let sort_order = payload.sort_order.unwrap_or_else(|| {
        // Get max sort_order for this task
        let max_order: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM test_steps WHERE task_id = ?1",
                params![payload.task_id],
                |row| row.get(0),
            )
            .unwrap_or(-1);
        max_order + 1
    });

    let request_override = payload.request_override_json.as_ref().map(|v| v.to_string());
    let assertions = payload.assertions_json.as_ref().map(|v| v.to_string());
    let extractors = payload.extractors_json.as_ref().map(|v| v.to_string());

    conn.execute(
        "INSERT INTO test_steps (id, task_id, sort_order, name, menu_item_id, request_override_json, pre_script, post_script, assertions_json, extractors_json, enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            id,
            payload.task_id,
            sort_order,
            payload.name,
            payload.menu_item_id,
            request_override,
            payload.pre_script,
            payload.post_script,
            assertions,
            extractors,
            payload.enabled,
            now,
            now
        ],
    ).map_err(|e| AppError::Internal(e.to_string()))?;

    drop(conn);
    get_step(db, &id)?.ok_or_else(|| AppError::Internal("Failed to create step".to_string()))
}

pub fn update_step(db: &Db, step_id: &str, payload: &UpdateTestStepPayload) -> Result<TestStep, AppError> {
    // 先读取当前数据（不在锁内），避免 Mutex 重入死锁
    let step = get_step(db, step_id)?.ok_or_else(|| AppError::NotFound("Step not found".to_string()))?;

    let name = payload.name.as_deref().unwrap_or(&step.name);
    let sort_order = payload.sort_order.unwrap_or(step.sort_order);
    let menu_item_id = payload.menu_item_id.as_deref().unwrap_or(&step.menu_item_id);
    let pre_script = payload.pre_script.as_deref().or(step.pre_script.as_deref());
    let post_script = payload.post_script.as_deref().or(step.post_script.as_deref());
    let enabled = payload.enabled.unwrap_or(step.enabled);

    let request_override = payload.request_override_json.as_ref()
        .map(|v| v.to_string())
        .or(step.request_override_json.map(|v| v.to_string()));

    let assertions = payload.assertions_json.as_ref()
        .map(|v| v.to_string())
        .or(step.assertions_json.map(|v| v.to_string()));

    let extractors = payload.extractors_json.as_ref()
        .map(|v| v.to_string())
        .or(step.extractors_json.map(|v| v.to_string()));

    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE test_steps SET name = ?1, sort_order = ?2, menu_item_id = ?3, request_override_json = ?4, pre_script = ?5, post_script = ?6, assertions_json = ?7, extractors_json = ?8, enabled = ?9, updated_at = ?10
         WHERE id = ?11",
        params![name, sort_order, menu_item_id, request_override, pre_script, post_script, assertions, extractors, enabled, now, step_id],
    ).map_err(|e| AppError::Internal(e.to_string()))?;

    drop(conn);
    get_step(db, step_id)?.ok_or_else(|| AppError::Internal("Failed to update step".to_string()))
}

pub fn delete_step(db: &Db, step_id: &str) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    conn.execute("DELETE FROM test_steps WHERE id = ?1", params![step_id])
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

pub fn get_step(db: &Db, step_id: &str) -> Result<Option<TestStep>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT id, task_id, sort_order, name, menu_item_id, request_override_json, pre_script, post_script, assertions_json, extractors_json, enabled, created_at, updated_at FROM test_steps WHERE id = ?1")
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut rows = stmt
        .query_map(params![step_id], |row| {
            let request_override_str: Option<String> = row.get(5)?;
            let request_override: Option<serde_json::Value> = request_override_str
                .and_then(|s| serde_json::from_str(&s).ok());

            let assertions_str: Option<String> = row.get(8)?;
            let assertions: Option<serde_json::Value> = assertions_str
                .and_then(|s| serde_json::from_str(&s).ok());

            let extractors_str: Option<String> = row.get(9)?;
            let extractors: Option<serde_json::Value> = extractors_str
                .and_then(|s| serde_json::from_str(&s).ok());

            Ok(TestStep {
                id: row.get(0)?,
                task_id: row.get(1)?,
                sort_order: row.get(2)?,
                name: row.get(3)?,
                menu_item_id: row.get(4)?,
                request_override_json: request_override,
                pre_script: row.get(6)?,
                post_script: row.get(7)?,
                assertions_json: assertions,
                extractors_json: extractors,
                enabled: row.get::<_, i32>(10)? != 0,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

    rows.next().transpose().map_err(|e| AppError::Internal(e.to_string()))
}

pub fn list_steps(db: &Db, task_id: &str) -> Result<Vec<TestStep>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT id, task_id, sort_order, name, menu_item_id, request_override_json, pre_script, post_script, assertions_json, extractors_json, enabled, created_at, updated_at FROM test_steps WHERE task_id = ?1 ORDER BY sort_order ASC")
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let rows = stmt
        .query_map(params![task_id], |row| {
            let request_override_str: Option<String> = row.get(5)?;
            let request_override: Option<serde_json::Value> = request_override_str
                .and_then(|s| serde_json::from_str(&s).ok());

            let assertions_str: Option<String> = row.get(8)?;
            let assertions: Option<serde_json::Value> = assertions_str
                .and_then(|s| serde_json::from_str(&s).ok());

            let extractors_str: Option<String> = row.get(9)?;
            let extractors: Option<serde_json::Value> = extractors_str
                .and_then(|s| serde_json::from_str(&s).ok());

            Ok(TestStep {
                id: row.get(0)?,
                task_id: row.get(1)?,
                sort_order: row.get(2)?,
                name: row.get(3)?,
                menu_item_id: row.get(4)?,
                request_override_json: request_override,
                pre_script: row.get(6)?,
                post_script: row.get(7)?,
                assertions_json: assertions,
                extractors_json: extractors,
                enabled: row.get::<_, i32>(10)? != 0,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut steps = Vec::new();
    for row in rows {
        steps.push(row.map_err(|e| AppError::Internal(e.to_string()))?);
    }
    Ok(steps)
}

pub fn reorder_steps(db: &Db, task_id: &str, step_ids: &[String]) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();

    for (index, step_id) in step_ids.iter().enumerate() {
        conn.execute(
            "UPDATE test_steps SET sort_order = ?1, updated_at = ?2 WHERE id = ?3 AND task_id = ?4",
            params![index as i32, now, step_id, task_id],
        ).map_err(|e| AppError::Internal(e.to_string()))?;
    }

    Ok(())
}

// ==================== Test Executions ====================

pub fn create_execution(db: &Db, task_id: &str, env_json: Option<&serde_json::Value>) -> Result<TestExecution, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let env_json_str = env_json.map(|v| v.to_string());

    // Get total steps count
    let total_steps: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM test_steps WHERE task_id = ?1 AND enabled = 1",
            params![task_id],
            |row| row.get(0),
        )
        .map_err(|e| AppError::Internal(e.to_string()))?;

    conn.execute(
        "INSERT INTO test_executions (id, task_id, status, total_steps, environment_json, started_at)
         VALUES (?1, ?2, 'running', ?3, ?4, ?5)",
        params![id, task_id, total_steps, env_json_str, now],
    ).map_err(|e| AppError::Internal(e.to_string()))?;

    drop(conn);
    get_execution(db, &id)?.ok_or_else(|| AppError::Internal("Failed to create execution".to_string()))
}

pub fn finish_execution(db: &Db, exec_id: &str, status: &str, passed: i32, failed: i32, skipped: i32, duration: i64) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE test_executions SET status = ?1, passed_steps = ?2, failed_steps = ?3, skipped_steps = ?4, total_duration_ms = ?5, finished_at = ?6
         WHERE id = ?7",
        params![status, passed, failed, skipped, duration, now, exec_id],
    ).map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(())
}

pub fn get_execution(db: &Db, exec_id: &str) -> Result<Option<TestExecution>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT id, task_id, status, total_steps, passed_steps, failed_steps, skipped_steps, total_duration_ms, environment_json, started_at, finished_at FROM test_executions WHERE id = ?1")
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut rows = stmt
        .query_map(params![exec_id], |row| {
            let env_json_str: Option<String> = row.get(8)?;
            let env_json: Option<serde_json::Value> = env_json_str
                .and_then(|s| serde_json::from_str(&s).ok());

            Ok(TestExecution {
                id: row.get(0)?,
                task_id: row.get(1)?,
                status: row.get(2)?,
                total_steps: row.get(3)?,
                passed_steps: row.get(4)?,
                failed_steps: row.get(5)?,
                skipped_steps: row.get(6)?,
                total_duration_ms: row.get(7)?,
                environment_json: env_json,
                started_at: row.get(9)?,
                finished_at: row.get(10)?,
            })
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

    rows.next().transpose().map_err(|e| AppError::Internal(e.to_string()))
}

pub fn list_executions(db: &Db, task_id: &str, limit: i32) -> Result<Vec<TestExecution>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT id, task_id, status, total_steps, passed_steps, failed_steps, skipped_steps, total_duration_ms, environment_json, started_at, finished_at FROM test_executions WHERE task_id = ?1 ORDER BY started_at DESC LIMIT ?2")
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let rows = stmt
        .query_map(params![task_id, limit], |row| {
            let env_json_str: Option<String> = row.get(8)?;
            let env_json: Option<serde_json::Value> = env_json_str
                .and_then(|s| serde_json::from_str(&s).ok());

            Ok(TestExecution {
                id: row.get(0)?,
                task_id: row.get(1)?,
                status: row.get(2)?,
                total_steps: row.get(3)?,
                passed_steps: row.get(4)?,
                failed_steps: row.get(5)?,
                skipped_steps: row.get(6)?,
                total_duration_ms: row.get(7)?,
                environment_json: env_json,
                started_at: row.get(9)?,
                finished_at: row.get(10)?,
            })
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut executions = Vec::new();
    for row in rows {
        executions.push(row.map_err(|e| AppError::Internal(e.to_string()))?);
    }
    Ok(executions)
}

pub fn delete_execution(db: &Db, exec_id: &str) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    conn.execute("DELETE FROM test_executions WHERE id = ?1", params![exec_id])
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

// ==================== Test Step Results ====================

pub fn create_step_result(db: &Db, result: &TestStepResult) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;

    let request_json = result.request_json.as_ref().map(|v| v.to_string());
    let response_json = result.response_json.as_ref().map(|v| v.to_string());
    let script_results = result.script_results_json.as_ref().map(|v| v.to_string());
    let variable_deltas = result.variable_deltas_json.as_ref().map(|v| v.to_string());

    conn.execute(
        "INSERT INTO test_step_results (id, execution_id, step_id, sort_order, status, request_json, response_json, script_results_json, variable_deltas_json, duration_ms, error_message, executed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            result.id,
            result.execution_id,
            result.step_id,
            result.sort_order,
            result.status,
            request_json,
            response_json,
            script_results,
            variable_deltas,
            result.duration_ms,
            result.error_message,
            result.executed_at
        ],
    ).map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(())
}

pub fn get_execution_detail(db: &Db, exec_id: &str) -> Result<Option<TestExecutionDetail>, AppError> {
    let execution = get_execution(db, exec_id)?;
    match execution {
        Some(execution) => {
            let step_results = list_step_results(db, exec_id)?;
            Ok(Some(TestExecutionDetail {
                execution,
                step_results,
            }))
        }
        None => Ok(None),
    }
}

fn list_step_results(db: &Db, execution_id: &str) -> Result<Vec<TestStepResult>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT id, execution_id, step_id, sort_order, status, request_json, response_json, script_results_json, variable_deltas_json, duration_ms, error_message, executed_at FROM test_step_results WHERE execution_id = ?1 ORDER BY sort_order ASC")
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let rows = stmt
        .query_map(params![execution_id], |row| {
            let request_str: Option<String> = row.get(5)?;
            let request: Option<serde_json::Value> = request_str.and_then(|s| serde_json::from_str(&s).ok());

            let response_str: Option<String> = row.get(6)?;
            let response: Option<serde_json::Value> = response_str.and_then(|s| serde_json::from_str(&s).ok());

            let script_results_str: Option<String> = row.get(7)?;
            let script_results: Option<serde_json::Value> = script_results_str.and_then(|s| serde_json::from_str(&s).ok());

            let variable_deltas_str: Option<String> = row.get(8)?;
            let variable_deltas: Option<serde_json::Value> = variable_deltas_str.and_then(|s| serde_json::from_str(&s).ok());

            Ok(TestStepResult {
                id: row.get(0)?,
                execution_id: row.get(1)?,
                step_id: row.get(2)?,
                sort_order: row.get(3)?,
                status: row.get(4)?,
                request_json: request,
                response_json: response,
                script_results_json: script_results,
                variable_deltas_json: variable_deltas,
                duration_ms: row.get(9)?,
                error_message: row.get(10)?,
                executed_at: row.get(11)?,
            })
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| AppError::Internal(e.to_string()))?);
    }
    Ok(results)
}
