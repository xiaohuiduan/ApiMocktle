use axum::{
    extract::State as AxumState,
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{Mutex, oneshot};

use crate::db::client::Db;
use crate::db::test_repo;
use crate::db::menu_repo;
use crate::db::flow_repo;
use crate::models::*;
use crate::services::test_engine::execute_task_full;

// ==================== MCP Protocol Types ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolCallParams {
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolResult {
    pub content: Vec<ToolResultContent>,
    #[serde(rename = "isError", skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolResultContent {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: String,
}

// ==================== MCP Server State ====================

pub struct McpServerState {
    pub db: Arc<Db>,
    pub tools: Vec<ToolDefinition>,
}

// ==================== MCP Server Handle ====================

pub struct McpServerHandle {
    pub port: Mutex<u16>,
    pub shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl McpServerHandle {
    pub fn new() -> Self {
        Self {
            port: Mutex::new(0),
            shutdown_tx: Mutex::new(None),
        }
    }

    pub async fn is_running(&self) -> bool {
        let port = self.port.lock().await;
        *port > 0
    }

    pub async fn get_port(&self) -> u16 {
        let port = self.port.lock().await;
        *port
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

// ==================== Helpers ====================

/// 根据 folderId 或 folderName 解析最终的 folder_id。
/// 优先级：folderName > folderId > None。
/// folderName 匹配不到时自动创建。
fn resolve_folder_id(
    db: &crate::db::client::Db,
    project_id: &str,
    folder_id: Option<&str>,
    folder_name: Option<&str>,
) -> Result<Option<String>, String> {
    // 优先用 folderName
    if let Some(name) = folder_name {
        let name = name.trim();
        if !name.is_empty() {
            // 查找同名文件夹
            let folders = test_repo::list_folders(db, project_id)
                .map_err(|e| format!("Error listing folders: {}", e))?;
            if let Some(existing) = folders.iter().find(|f| f.name == name) {
                return Ok(Some(existing.id.clone()));
            }
            // 不存在则自动创建
            let new_folder = test_repo::create_folder(
                db,
                &CreateTestFolderPayload {
                    project_id: project_id.to_string(),
                    name: name.to_string(),
                },
            )
            .map_err(|e| format!("Error creating folder: {}", e))?;
            return Ok(Some(new_folder.id));
        }
    }
    // 其次用 folderId
    if let Some(fid) = folder_id {
        if !fid.is_empty() {
            return Ok(Some(fid.to_string()));
        }
    }
    Ok(None)
}

// ==================== Tool Definitions ====================

fn get_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "api-test.list_projects".to_string(),
            description: "List all projects".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {}
            }),
        },
        ToolDefinition {
            name: "api-test.get_flow_prompt".to_string(),
            description: "Get the complete AI prompt for a project, including API documentation with $ref resolution and all node type definitions. Use this prompt to generate test flow graphs.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "projectId": {
                        "type": "string",
                        "description": "The project ID"
                    }
                },
                "required": ["projectId"]
            }),
        },
        ToolDefinition {
            name: "api-test.list_tasks".to_string(),
            description: "List all test tasks for a project".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "projectId": {
                        "type": "string",
                        "description": "The project ID"
                    }
                },
                "required": ["projectId"]
            }),
        },
        ToolDefinition {
            name: "api-test.get_task".to_string(),
            description: "Get a test task with its flow graph".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "The task ID"
                    }
                },
                "required": ["taskId"]
            }),
        },
        ToolDefinition {
            name: "api-test.create_task".to_string(),
            description: "Create a new test task. Optionally assign to a folder by folderId or folderName (auto-creates if not exists).".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "projectId": {
                        "type": "string",
                        "description": "The project ID"
                    },
                    "name": {
                        "type": "string",
                        "description": "Task name"
                    },
                    "description": {
                        "type": "string",
                        "description": "Task description"
                    },
                    "failFast": {
                        "type": "boolean",
                        "description": "Stop on first failure"
                    },
                    "environmentId": {
                        "type": "string",
                        "description": "Environment ID to use for test execution"
                    },
                    "folderId": {
                        "type": "string",
                        "description": "Assign to an existing folder by ID"
                    },
                    "folderName": {
                        "type": "string",
                        "description": "Assign to a folder by name. If the folder does not exist, it will be created automatically. Takes priority over folderId."
                    }
                },
                "required": ["projectId", "name"]
            }),
        },
        ToolDefinition {
            name: "api-test.update_task".to_string(),
            description: "Update a test task".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "The task ID"
                    },
                    "name": {
                        "type": "string",
                        "description": "Task name"
                    },
                    "description": {
                        "type": "string",
                        "description": "Task description"
                    },
                    "failFast": {
                        "type": "boolean",
                        "description": "Stop on first failure"
                    },
                    "environmentId": {
                        "type": "string",
                        "description": "Environment ID to use for test execution"
                    }
                },
                "required": ["taskId"]
            }),
        },
        ToolDefinition {
            name: "api-test.delete_task".to_string(),
            description: "Delete a test task".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "The task ID"
                    }
                },
                "required": ["taskId"]
            }),
        },
        ToolDefinition {
            name: "api-test.list_executions".to_string(),
            description: "List execution history for a task".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "The task ID"
                    },
                    "limit": {
                        "type": "number",
                        "description": "Maximum number of results"
                    }
                },
                "required": ["taskId"]
            }),
        },
        ToolDefinition {
            name: "api-test.get_execution".to_string(),
            description: "Get execution details".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "executionId": {
                        "type": "string",
                        "description": "The execution ID"
                    }
                },
                "required": ["executionId"]
            }),
        },
        ToolDefinition {
            name: "api-test.delete_execution".to_string(),
            description: "Delete an execution record".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "executionId": {
                        "type": "string",
                        "description": "The execution ID"
                    }
                },
                "required": ["executionId"]
            }),
        },
        ToolDefinition {
            name: "api-test.get_variables".to_string(),
            description: "Get variables configured for a test task, including task-level variables and associated environment variables".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "The test task ID"
                    }
                },
                "required": ["taskId"]
            }),
        },
        ToolDefinition {
            name: "api-test.set_variables".to_string(),
            description: "Set or update variables for a test task".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "The test task ID"
                    },
                    "variables": {
                        "type": "object",
                        "description": "Variables to set (key-value pairs)",
                        "additionalProperties": { "type": "string" }
                    }
                },
                "required": ["taskId", "variables"]
            }),
        },
        ToolDefinition {
            name: "api-test.run_task".to_string(),
            description: "Execute a test task synchronously and return execution results. Runs all enabled steps sequentially, applying extractors and assertions.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "The test task ID to execute"
                    },
                    "variables": {
                        "type": "object",
                        "description": "Additional variables (key-value pairs) to use during execution",
                        "additionalProperties": {
                            "type": "string"
                        }
                    },
                    "environmentId": {
                        "type": "string",
                        "description": "Override the task's default environment ID"
                    }
                },
                "required": ["taskId"]
            }),
        },
        ToolDefinition {
            name: "api-test.create_task_with_flow".to_string(),
            description: "Create a test task and its flow graph in one atomic operation. Optionally assign to a folder by folderId or folderName (auto-creates if not exists).".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "projectId": {
                        "type": "string",
                        "description": "The project ID"
                    },
                    "name": {
                        "type": "string",
                        "description": "Task name"
                    },
                    "description": {
                        "type": "string",
                        "description": "Task description"
                    },
                    "graphJson": {
                        "type": "object",
                        "description": "The flow graph JSON with nodes and edges arrays"
                    },
                    "folderId": {
                        "type": "string",
                        "description": "Assign to an existing folder by ID"
                    },
                    "folderName": {
                        "type": "string",
                        "description": "Assign to a folder by name. If the folder does not exist, it will be created automatically. Takes priority over folderId."
                    }
                },
                "required": ["projectId", "name", "graphJson"]
            }),
        },
        ToolDefinition {
            name: "api-test.save_flow_graph".to_string(),
            description: "Save or update a flow graph for an existing test task".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "The task ID"
                    },
                    "graphJson": {
                        "type": "object",
                        "description": "The flow graph JSON with nodes and edges arrays"
                    }
                },
                "required": ["taskId", "graphJson"]
            }),
        },
        ToolDefinition {
            name: "api-test.load_flow_graph".to_string(),
            description: "Load the flow graph for a test task".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "The task ID"
                    }
                },
                "required": ["taskId"]
            }),
        },
        ToolDefinition {
            name: "api-test.delete_flow_graph".to_string(),
            description: "Delete the flow graph for a test task".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "The task ID"
                    }
                },
                "required": ["taskId"]
            }),
        },
        ToolDefinition {
            name: "api-test.validate_flow".to_string(),
            description: "Validate a flow graph structure: checks nodes/edges arrays, start+end nodes, unique ids, edge references, and menuItemId validity".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "graphJson": {
                        "type": "object",
                        "description": "The flow graph JSON with nodes and edges arrays"
                    },
                    "projectId": {
                        "type": "string",
                        "description": "Optional project ID to validate menuItemIds exist"
                    }
                },
                "required": ["graphJson"]
            }),
        },
    ]
}

// ==================== Tool Execution ====================

async fn execute_tool(name: &str, arguments: &serde_json::Value, db: &Db) -> Result<ToolResult, JsonRpcError> {
    match name {
        "api-test.list_projects" => {
            // 直接查询所有不过滤 user_id
            let conn = db.0.lock().map_err(|e| JsonRpcError {
                code: -32603,
                message: format!("Database error: {}", e),
                data: None,
            })?;
            let mut stmt = conn.prepare(
                "SELECT id, name, owner_id, created_at FROM projects ORDER BY created_at DESC"
            ).map_err(|e| JsonRpcError {
                code: -32603,
                message: format!("Database error: {}", e),
                data: None,
            })?;
            let projects: Vec<serde_json::Value> = stmt.query_map([], |row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0).unwrap_or_default(),
                    "name": row.get::<_, String>(1).unwrap_or_default(),
                    "ownerId": row.get::<_, String>(2).unwrap_or_default(),
                    "createdAt": row.get::<_, String>(3).unwrap_or_default()
                }))
            }).map_err(|e| JsonRpcError {
                code: -32603,
                message: format!("Query error: {}", e),
                data: None,
            })?
            .filter_map(|r| r.ok())
            .collect();

            Ok(ToolResult {
                content: vec![ToolResultContent {
                    content_type: "text".to_string(),
                    text: serde_json::to_string_pretty(&projects).unwrap_or_default(),
                }],
                is_error: None,
            })
        }
        "api-test.get_flow_prompt" => {
            let project_id = arguments.get("projectId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing projectId".to_string(),
                    data: None,
                })?;

            match crate::services::prompt_builder::generate_flow_prompt(db, project_id) {
                Ok(prompt) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: prompt,
                    }],
                    is_error: None,
                }),
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.list_tasks" => {
            let project_id = arguments.get("projectId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing projectId".to_string(),
                    data: None,
                })?;

            match test_repo::list_tasks(db, project_id) {
                Ok(tasks) => {
                    // 加载文件夹映射，给每个任务附上 folderName
                    let folders = test_repo::list_folders(db, project_id).unwrap_or_default();
                    let folder_map: std::collections::HashMap<&str, &str> = folders
                        .iter()
                        .map(|f| (f.id.as_str(), f.name.as_str()))
                        .collect();

                    let enriched: Vec<serde_json::Value> = tasks.iter().map(|t| {
                        let mut val = serde_json::to_value(t).unwrap_or_default();
                        if let Some(obj) = val.as_object_mut() {
                            let fname = t.folder_id.as_deref()
                                .and_then(|fid| folder_map.get(fid).map(|n| n.to_string()));
                            obj.insert("folderName".to_string(),
                                fname.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
                        }
                        val
                    }).collect();

                    Ok(ToolResult {
                        content: vec![ToolResultContent {
                            content_type: "text".to_string(),
                            text: serde_json::to_string_pretty(&enriched).unwrap_or_default(),
                        }],
                        is_error: None,
                    })
                }
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.get_task" => {
            let task_id = arguments.get("taskId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing taskId".to_string(),
                    data: None,
                })?;

            match test_repo::get_task(db, task_id) {
                Ok(Some(task)) => {
                    let flow_graph = match flow_repo::load_flow_graph(db, task_id) {
                        Ok(graph) => graph,
                        Err(e) => return Ok(ToolResult {
                            content: vec![ToolResultContent {
                                content_type: "text".to_string(),
                                text: format!("Error loading flow graph: {}", e),
                            }],
                            is_error: Some(true),
                        }),
                    };

                    let detail = serde_json::json!({
                        "task": task,
                        "flowGraph": flow_graph
                    });
                    Ok(ToolResult {
                        content: vec![ToolResultContent {
                            content_type: "text".to_string(),
                            text: serde_json::to_string_pretty(&detail).unwrap_or_default(),
                        }],
                        is_error: None,
                    })
                }
                Ok(None) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: "Task not found".to_string(),
                    }],
                    is_error: Some(true),
                }),
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.create_task" => {
            let project_id = arguments.get("projectId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing projectId".to_string(),
                    data: None,
                })?;
            let name = arguments.get("name")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing name".to_string(),
                    data: None,
                })?;
            let description = arguments.get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let fail_fast = arguments.get("failFast")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let environment_id = arguments.get("environmentId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let folder_id_arg = arguments.get("folderId").and_then(|v| v.as_str());
            let folder_name_arg = arguments.get("folderName").and_then(|v| v.as_str());

            let resolved_folder_id = match resolve_folder_id(db, project_id, folder_id_arg, folder_name_arg) {
                Ok(id) => id,
                Err(e) => return Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error resolving folder: {}", e),
                    }],
                    is_error: Some(true),
                }),
            };

            let payload = CreateTestTaskPayload {
                project_id: project_id.to_string(),
                name: name.to_string(),
                description: description.to_string(),
                folder_id: resolved_folder_id,
                environment_id,
                fail_fast,
            };

            match test_repo::create_task(db, &payload) {
                Ok(task) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&task).unwrap_or_default(),
                    }],
                    is_error: None,
                }),
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.update_task" => {
            let task_id = arguments.get("taskId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing taskId".to_string(),
                    data: None,
                })?;

            let payload = UpdateTestTaskPayload {
                name: arguments.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()),
                description: arguments.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                folder_id: None,
                environment_id: arguments.get("environmentId").and_then(|v| v.as_str()).map(|s| s.to_string()),
                variables_json: None,
                fail_fast: arguments.get("failFast").and_then(|v| v.as_bool()),
            };

            match test_repo::update_task(db, task_id, &payload) {
                Ok(task) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&task).unwrap_or_default(),
                    }],
                    is_error: None,
                }),
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.delete_task" => {
            let task_id = arguments.get("taskId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing taskId".to_string(),
                    data: None,
                })?;

            match test_repo::delete_task(db, task_id) {
                Ok(_) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string(&serde_json::json!({"ok": true})).unwrap_or_default(),
                    }],
                    is_error: None,
                }),
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.list_executions" => {
            let task_id = arguments.get("taskId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing taskId".to_string(),
                    data: None,
                })?;
            let limit = arguments.get("limit")
                .and_then(|v| v.as_i64())
                .unwrap_or(20) as i32;

            match test_repo::list_executions(db, task_id, limit) {
                Ok(executions) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&executions).unwrap_or_default(),
                    }],
                    is_error: None,
                }),
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.get_execution" => {
            let execution_id = arguments.get("executionId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing executionId".to_string(),
                    data: None,
                })?;

            match test_repo::get_execution_detail(db, execution_id) {
                Ok(Some(detail)) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&detail).unwrap_or_default(),
                    }],
                    is_error: None,
                }),
                Ok(None) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: "Execution not found".to_string(),
                    }],
                    is_error: Some(true),
                }),
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.delete_execution" => {
            let execution_id = arguments.get("executionId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing executionId".to_string(),
                    data: None,
                })?;

            match test_repo::delete_execution(db, execution_id) {
                Ok(_) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string(&serde_json::json!({"ok": true})).unwrap_or_default(),
                    }],
                    is_error: None,
                }),
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.get_variables" => {
            let task_id = arguments.get("taskId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing taskId".to_string(),
                    data: None,
                })?;

            let task = match test_repo::get_task(db, task_id) {
                Ok(Some(task)) => task,
                Ok(None) => return Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: "Task not found".to_string(),
                    }],
                    is_error: Some(true),
                }),
                Err(e) => return Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            };

            let task_variables = match &task.variables_json {
                Some(serde_json::Value::Object(map)) => {
                    let mut obj = serde_json::Map::new();
                    for (k, v) in map {
                        obj.insert(k.clone(), v.clone());
                    }
                    serde_json::Value::Object(obj)
                }
                _ => serde_json::json!({}),
            };

            let mut environment_variables = serde_json::json!({});
            if let Some(ref env_id) = task.environment_id {
                let conn = db.0.lock().map_err(|e| JsonRpcError {
                    code: -32603,
                    message: format!("Database error: {}", e),
                    data: None,
                })?;
                let env_config_str: Option<String> = conn
                    .query_row(
                        "SELECT value FROM meta WHERE project_id = ?1 AND key = 'environmentConfig'",
                        rusqlite::params![task.project_id],
                        |row| row.get(0),
                    )
                    .ok();
                drop(conn);

                if let Some(config_str) = env_config_str {
                    if let Ok(config) = serde_json::from_str::<ProjectEnvironmentConfig>(&config_str) {
                        if let Some(env) = config.environments.iter().find(|e| {
                            e.get("id").and_then(|v| v.as_str()) == Some(env_id)
                        }) {
                            if let Some(vars) = env.get("variables").and_then(|v| v.as_array()) {
                                let mut obj = serde_json::Map::new();
                                for var in vars {
                                    if let Some(name) = var.get("name").and_then(|v| v.as_str()) {
                                        let enabled = var.get("enable").and_then(|v| v.as_bool()).unwrap_or(true);
                                        if enabled {
                                            let value = var.get("value").cloned().unwrap_or(serde_json::Value::Null);
                                            obj.insert(name.to_string(), value);
                                        }
                                    }
                                }
                                environment_variables = serde_json::Value::Object(obj);
                            }
                        }
                    }
                }
            }

            let mut merged = match &environment_variables {
                serde_json::Value::Object(map) => map.clone(),
                _ => serde_json::Map::new(),
            };
            if let serde_json::Value::Object(task_vars) = &task_variables {
                for (k, v) in task_vars {
                    merged.insert(k.clone(), v.clone());
                }
            }

            let result = serde_json::json!({
                "taskVariables": task_variables,
                "environmentVariables": environment_variables,
                "merged": serde_json::Value::Object(merged),
            });

            Ok(ToolResult {
                content: vec![ToolResultContent {
                    content_type: "text".to_string(),
                    text: serde_json::to_string_pretty(&result).unwrap_or_default(),
                }],
                is_error: None,
            })
        }
        "api-test.set_variables" => {
            let task_id = arguments.get("taskId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing taskId".to_string(),
                    data: None,
                })?;
            let variables = arguments.get("variables")
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing variables".to_string(),
                    data: None,
                })?;

            match test_repo::set_task_variables(db, task_id, variables) {
                Ok(updated) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&updated).unwrap_or_default(),
                    }],
                    is_error: None,
                }),
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.run_task" => {
            let task_id = arguments.get("taskId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing taskId".to_string(),
                    data: None,
                })?;

            // 1. Get task
            let task = match test_repo::get_task(db, task_id) {
                Ok(Some(task)) => task,
                Ok(None) => {
                    return Ok(ToolResult {
                        content: vec![ToolResultContent {
                            content_type: "text".to_string(),
                            text: "Task not found".to_string(),
                        }],
                        is_error: Some(true),
                    });
                }
                Err(e) => {
                    return Ok(ToolResult {
                        content: vec![ToolResultContent {
                            content_type: "text".to_string(),
                            text: format!("Error: {}", e),
                        }],
                        is_error: Some(true),
                    });
                }
            };

            // 2. Parse provided variables
            let mut merged_variables: std::collections::HashMap<String, String> = std::collections::HashMap::new();
            if let Some(vars_obj) = arguments.get("variables").and_then(|v| v.as_object()) {
                for (k, v) in vars_obj {
                    if let Some(s) = v.as_str() {
                        merged_variables.insert(k.clone(), s.to_string());
                    }
                }
            }

            // 3. Determine environment_id
            let environment_id = arguments.get("environmentId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| task.environment_id.clone());

            // 4. Resolve environment: baseUrl and env variables
            let mut base_url: Option<String> = None;
            if let Some(ref env_id) = environment_id {
                let conn = db.0.lock().map_err(|e| JsonRpcError {
                    code: -32603,
                    message: format!("Database error: {}", e),
                    data: None,
                })?;
                let env_config_str: Option<String> = conn
                    .query_row(
                        "SELECT value FROM meta WHERE project_id = ?1 AND key = 'environmentConfig'",
                        rusqlite::params![task.project_id],
                        |row| row.get(0),
                    )
                    .ok();
                drop(conn);

                if let Some(config_str) = env_config_str {
                    if let Ok(config) = serde_json::from_str::<ProjectEnvironmentConfig>(&config_str) {
                        if let Some(env) = config.environments.iter().find(|e| {
                            e.get("id").and_then(|v| v.as_str()) == Some(env_id)
                        }) {
                            // Resolve baseUrl
                            base_url = env.get("baseUrls")
                                .and_then(|v| v.as_array())
                                .and_then(|arr| {
                                    arr.iter()
                                        .find(|b| b.get("url").and_then(|u| u.as_str()).map(|s| !s.is_empty()).unwrap_or(false))
                                        .and_then(|b| b.get("url").and_then(|u| u.as_str()))
                                })
                                .map(|s| s.to_string())
                                .or_else(|| env.get("url").and_then(|v| v.as_str()).map(|s| s.to_string()));

                            // Resolve environment variables
                            if let Some(vars) = env.get("variables").and_then(|v| v.as_array()) {
                                for var in vars {
                                    if let Some(name) = var.get("name").and_then(|v| v.as_str()) {
                                        let enabled = var.get("enable").and_then(|v| v.as_bool()).unwrap_or(true);
                                        if enabled {
                                            if let Some(value) = var.get("value").and_then(|v| v.as_str()) {
                                                merged_variables.insert(name.to_string(), value.to_string());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 5. Call execute_task_full
            match execute_task_full(
                db,
                task_id,
                &task.project_id,
                merged_variables,
                base_url.as_deref(),
                task.fail_fast,
            ).await {
                Ok(summary) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&summary).unwrap_or_default(),
                    }],
                    is_error: None,
                }),
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Execution failed: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.create_task_with_flow" => {
            let project_id = arguments.get("projectId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing projectId".to_string(),
                    data: None,
                })?;
            let name = arguments.get("name")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing name".to_string(),
                    data: None,
                })?;
            let description = arguments.get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let graph_json = arguments.get("graphJson")
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing graphJson".to_string(),
                    data: None,
                })?;
            let folder_id_arg = arguments.get("folderId").and_then(|v| v.as_str());
            let folder_name_arg = arguments.get("folderName").and_then(|v| v.as_str());

            // Validate graphJson has nodes/edges arrays
            let has_nodes = graph_json.get("nodes").and_then(|v| v.as_array()).is_some();
            let has_edges = graph_json.get("edges").and_then(|v| v.as_array()).is_some();
            if !has_nodes || !has_edges {
                return Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: "graphJson must contain 'nodes' and 'edges' arrays".to_string(),
                    }],
                    is_error: Some(true),
                });
            }

            let resolved_folder_id = match resolve_folder_id(db, project_id, folder_id_arg, folder_name_arg) {
                Ok(id) => id,
                Err(e) => return Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error resolving folder: {}", e),
                    }],
                    is_error: Some(true),
                }),
            };

            let task_payload = CreateTestTaskPayload {
                project_id: project_id.to_string(),
                name: name.to_string(),
                description: description.to_string(),
                folder_id: resolved_folder_id,
                environment_id: None,
                fail_fast: true,
            };

            let task = match test_repo::create_task(db, &task_payload) {
                Ok(task) => task,
                Err(e) => return Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error creating task: {}", e),
                    }],
                    is_error: Some(true),
                }),
            };

            match flow_repo::save_flow_graph(db, &task.id, graph_json) {
                Ok(_) => {
                    let result = serde_json::json!({
                        "task": task,
                        "flowGraph": graph_json
                    });
                    Ok(ToolResult {
                        content: vec![ToolResultContent {
                            content_type: "text".to_string(),
                            text: serde_json::to_string_pretty(&result).unwrap_or_default(),
                        }],
                        is_error: None,
                    })
                }
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error saving flow graph: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.save_flow_graph" => {
            let task_id = arguments.get("taskId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing taskId".to_string(),
                    data: None,
                })?;
            let graph_json = arguments.get("graphJson")
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing graphJson".to_string(),
                    data: None,
                })?;

            match flow_repo::save_flow_graph(db, task_id, graph_json) {
                Ok(_) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string(&serde_json::json!({"ok": true})).unwrap_or_default(),
                    }],
                    is_error: None,
                }),
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.load_flow_graph" => {
            let task_id = arguments.get("taskId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing taskId".to_string(),
                    data: None,
                })?;

            match flow_repo::load_flow_graph(db, task_id) {
                Ok(Some(graph)) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&graph).unwrap_or_default(),
                    }],
                    is_error: None,
                }),
                Ok(None) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: "No flow graph found for this task".to_string(),
                    }],
                    is_error: Some(true),
                }),
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.delete_flow_graph" => {
            let task_id = arguments.get("taskId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing taskId".to_string(),
                    data: None,
                })?;

            match flow_repo::delete_flow_graph(db, task_id) {
                Ok(_) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string(&serde_json::json!({"ok": true})).unwrap_or_default(),
                    }],
                    is_error: None,
                }),
                Err(e) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error: {}", e),
                    }],
                    is_error: Some(true),
                }),
            }
        }
        "api-test.validate_flow" => {
            let graph_json = arguments.get("graphJson")
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing graphJson".to_string(),
                    data: None,
                })?;
            let project_id = arguments.get("projectId")
                .and_then(|v| v.as_str());

            let mut errors: Vec<String> = Vec::new();
            let mut warnings: Vec<String> = Vec::new();

            // Check nodes array exists
            let nodes = match graph_json.get("nodes").and_then(|v| v.as_array()) {
                Some(arr) => arr,
                None => {
                    errors.push("graphJson must contain a 'nodes' array".to_string());
                    return Ok(ToolResult {
                        content: vec![ToolResultContent {
                            content_type: "text".to_string(),
                            text: serde_json::to_string_pretty(&serde_json::json!({
                                "valid": false,
                                "errors": errors,
                                "warnings": warnings,
                                "nodeCount": 0,
                                "edgeCount": 0
                            })).unwrap_or_default(),
                        }],
                        is_error: None,
                    });
                }
            };

            // Check edges array exists
            let edges = match graph_json.get("edges").and_then(|v| v.as_array()) {
                Some(arr) => arr,
                None => {
                    errors.push("graphJson must contain an 'edges' array".to_string());
                    return Ok(ToolResult {
                        content: vec![ToolResultContent {
                            content_type: "text".to_string(),
                            text: serde_json::to_string_pretty(&serde_json::json!({
                                "valid": false,
                                "errors": errors,
                                "warnings": warnings,
                                "nodeCount": nodes.len(),
                                "edgeCount": 0
                            })).unwrap_or_default(),
                        }],
                        is_error: None,
                    });
                }
            };

            let node_count = nodes.len();
            let edge_count = edges.len();

            // Check has start and end nodes
            let has_start = nodes.iter().any(|n| n.get("type").and_then(|t| t.as_str()) == Some("start"));
            let has_end = nodes.iter().any(|n| n.get("type").and_then(|t| t.as_str()) == Some("end"));

            if !has_start {
                errors.push("Flow must have at least one 'start' node".to_string());
            }
            if !has_end {
                errors.push("Flow must have at least one 'end' node".to_string());
            }

            // Check unique node ids
            let mut node_ids: Vec<&str> = nodes
                .iter()
                .filter_map(|n| n.get("id").and_then(|v| v.as_str()))
                .collect();
            let original_len = node_ids.len();
            node_ids.sort();
            node_ids.dedup();
            if node_ids.len() < original_len {
                errors.push("Node ids must be unique".to_string());
            }

            // Build set of valid node ids for edge validation
            let node_id_set: std::collections::HashSet<&str> = node_ids.iter().copied().collect();

            // Validate edges reference valid nodes
            for edge in edges {
                let edge_id = edge.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
                let source = edge.get("source").and_then(|v| v.as_str());
                let target = edge.get("target").and_then(|v| v.as_str());

                if source.is_none() {
                    errors.push(format!("Edge '{}' missing 'source'", edge_id));
                } else if !node_id_set.contains(source.unwrap()) {
                    errors.push(format!("Edge '{}' references invalid source node '{}'", edge_id, source.unwrap()));
                }

                if target.is_none() {
                    errors.push(format!("Edge '{}' missing 'target'", edge_id));
                } else if !node_id_set.contains(target.unwrap()) {
                    errors.push(format!("Edge '{}' references invalid target node '{}'", edge_id, target.unwrap()));
                }
            }

            // Validate httpRequest nodes have menuItemId
            for node in nodes {
                let node_type = node.get("type").and_then(|t| t.as_str()).unwrap_or("");
                let node_id = node.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
                if node_type == "httpRequest" {
                    let has_menu_item = node.get("data")
                        .and_then(|d| d.get("menuItemId"))
                        .and_then(|v| v.as_str())
                        .map(|s| !s.is_empty())
                        .unwrap_or(false);
                    if !has_menu_item {
                        errors.push(format!("httpRequest node '{}' must have a non-empty 'menuItemId' in data", node_id));
                    }
                }
            }

            // If projectId provided, validate menuItemIds exist in the project
            if let Some(pid) = project_id {
                match menu_repo::list_menu_items(db, pid) {
                    Ok(items) => {
                        let valid_ids: std::collections::HashSet<String> = items
                            .iter()
                            .map(|item| item.id.clone())
                            .collect();

                        for node in nodes {
                            let node_type = node.get("type").and_then(|t| t.as_str()).unwrap_or("");
                            let node_id = node.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
                            if node_type == "httpRequest" {
                                if let Some(menu_id) = node.get("data").and_then(|d| d.get("menuItemId")).and_then(|v| v.as_str()) {
                                    if !menu_id.is_empty() && !valid_ids.contains(menu_id) {
                                        warnings.push(format!("httpRequest node '{}' references menuItemId '{}' which does not exist in project", node_id, menu_id));
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        warnings.push(format!("Could not validate menuItemIds against project: {}", e));
                    }
                }
            }

            let valid = errors.is_empty();
            let result = serde_json::json!({
                "valid": valid,
                "errors": errors,
                "warnings": warnings,
                "nodeCount": node_count,
                "edgeCount": edge_count
            });

            Ok(ToolResult {
                content: vec![ToolResultContent {
                    content_type: "text".to_string(),
                    text: serde_json::to_string_pretty(&result).unwrap_or_default(),
                }],
                is_error: None,
            })
        }
        _ => Err(JsonRpcError {
            code: -32601,
            message: format!("Unknown tool: {}", name),
            data: None,
        }),
    }
}

// ==================== HTTP Handlers ====================

async fn handle_mcp_request(
    AxumState(state): AxumState<Arc<McpServerState>>,
    Json(request): Json<JsonRpcRequest>,
) -> Json<JsonRpcResponse> {
    let response = match request.method.as_str() {
        "initialize" => {
            JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id.clone(),
                result: Some(serde_json::json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "apimocktle-mcp",
                        "version": "1.0.0"
                    }
                })),
                error: None,
            }
        }
        "tools/list" => {
            JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id.clone(),
                result: Some(serde_json::json!({
                    "tools": state.tools
                })),
                error: None,
            }
        }
        "tools/call" => {
            match serde_json::from_value::<ToolCallParams>(request.params.clone()) {
                Ok(params) => {
                    match execute_tool(&params.name, &params.arguments, &state.db).await {
                        Ok(result) => JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id: request.id.clone(),
                            result: Some(serde_json::to_value(result).unwrap_or_default()),
                            error: None,
                        },
                        Err(e) => JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id: request.id.clone(),
                            result: None,
                            error: Some(e),
                        },
                    }
                }
                Err(e) => JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: request.id.clone(),
                    result: None,
                    error: Some(JsonRpcError {
                        code: -32602,
                        message: format!("Invalid params: {}", e),
                        data: None,
                    }),
                },
            }
        }
        _ => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id.clone(),
            result: None,
            error: Some(JsonRpcError {
                code: -32601,
                message: format!("Unknown method: {}", request.method),
                data: None,
            }),
        },
    };

    Json(response)
}

// ==================== Server Startup ====================

pub async fn start_mcp_server(db: Arc<Db>, handle: Arc<McpServerHandle>, preferred_port: u16) {
    let state = Arc::new(McpServerState {
        db,
        tools: get_tool_definitions(),
    });

    let app = Router::new()
        .route("/", post(handle_mcp_request))
        .with_state(state);

    let listener = match tokio::net::TcpListener::bind(format!("127.0.0.1:{}", preferred_port)).await {
        Ok(l) => l,
        Err(_) => {
            // Try random port
            tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("Failed to bind MCP server")
        }
    };

    let addr = listener.local_addr().unwrap();
    let port = addr.port();

    // Store the port
    {
        let mut port_guard = handle.port.lock().await;
        *port_guard = port;
    }

    // Create shutdown channel
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    {
        let mut shutdown_guard = handle.shutdown_tx.lock().await;
        *shutdown_guard = Some(shutdown_tx);
    }

    println!("MCP Server listening on port {}", port);

    // Run the server
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            shutdown_rx.await.ok();
        })
        .await
        .expect("MCP Server error");

    // Reset port on shutdown
    {
        let mut port_guard = handle.port.lock().await;
        *port_guard = 0;
    }
}

// ==================== Tests ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_definitions_count() {
        let tools = get_tool_definitions();
        assert_eq!(tools.len(), 18, "Expected 18 MCP tools, got {}", tools.len());
    }

    #[test]
    fn test_no_step_tools() {
        let tools = get_tool_definitions();
        let names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
        assert!(!names.contains(&"api-test.add_step"), "add_step should be removed");
        assert!(!names.contains(&"api-test.update_step"), "update_step should be removed");
        assert!(!names.contains(&"api-test.delete_step"), "delete_step should be removed");
        assert!(!names.contains(&"api-test.reorder_steps"), "reorder_steps should be removed");
        assert!(!names.contains(&"api-test.create_task_with_steps"), "create_task_with_steps should be removed");
    }

    #[test]
    fn test_new_flow_tools_exist() {
        let tools = get_tool_definitions();
        let names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"api-test.get_flow_prompt"), "get_flow_prompt missing");
        assert!(names.contains(&"api-test.create_task_with_flow"), "create_task_with_flow missing");
        assert!(names.contains(&"api-test.save_flow_graph"), "save_flow_graph missing");
        assert!(names.contains(&"api-test.load_flow_graph"), "load_flow_graph missing");
        assert!(names.contains(&"api-test.delete_flow_graph"), "delete_flow_graph missing");
        assert!(names.contains(&"api-test.validate_flow"), "validate_flow missing");
    }

    #[test]
    fn test_kept_tools_preserved() {
        let tools = get_tool_definitions();
        let names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
        let expected = [
            "api-test.list_projects",
            "api-test.get_flow_prompt",
            "api-test.list_tasks",
            "api-test.get_task",
            "api-test.create_task",
            "api-test.update_task",
            "api-test.delete_task",
            "api-test.list_executions",
            "api-test.get_execution",
            "api-test.delete_execution",
            "api-test.get_variables",
            "api-test.set_variables",
            "api-test.run_task",
        ];
        for name in expected {
            assert!(names.contains(&name), "Missing preserved tool: {}", name);
        }
    }

    #[test]
    fn test_tool_schemas_have_required_fields() {
        let tools = get_tool_definitions();
        for tool in &tools {
            // Every tool must have a non-empty name and description
            assert!(!tool.name.is_empty(), "Tool name is empty");
            assert!(!tool.description.is_empty(), "Tool description is empty for {}", tool.name);
            // input_schema must be a valid JSON object
            assert!(tool.input_schema.is_object(), "input_schema is not an object for {}", tool.name);
        }
    }

    #[test]
    fn test_validate_flow_schema_requirements() {
        let tools = get_tool_definitions();
        let validate_tool = tools.iter().find(|t| t.name == "api-test.validate_flow").unwrap();
        let required = validate_tool.input_schema.get("required").unwrap().as_array().unwrap();
        let required_strs: Vec<&str> = required.iter().map(|v| v.as_str().unwrap()).collect();
        assert!(required_strs.contains(&"graphJson"), "validate_flow should require graphJson");
    }

    #[test]
    fn test_create_task_with_flow_schema_requirements() {
        let tools = get_tool_definitions();
        let tool = tools.iter().find(|t| t.name == "api-test.create_task_with_flow").unwrap();
        let required = tool.input_schema.get("required").unwrap().as_array().unwrap();
        let required_strs: Vec<&str> = required.iter().map(|v| v.as_str().unwrap()).collect();
        assert!(required_strs.contains(&"projectId"));
        assert!(required_strs.contains(&"name"));
        assert!(required_strs.contains(&"graphJson"));
    }

    #[test]
    fn test_flow_prompt_schema_requirements() {
        let tools = get_tool_definitions();
        let tool = tools.iter().find(|t| t.name == "api-test.get_flow_prompt").unwrap();
        let required = tool.input_schema.get("required").unwrap().as_array().unwrap();
        let required_strs: Vec<&str> = required.iter().map(|v| v.as_str().unwrap()).collect();
        assert!(required_strs.contains(&"projectId"));
    }

    #[test]
    fn test_update_task_has_environment_id_param() {
        let tools = get_tool_definitions();
        let tool = tools.iter().find(|t| t.name == "api-test.update_task").unwrap();
        let props = tool.input_schema.get("properties").unwrap();
        assert!(props.get("environmentId").is_some(), "update_task should have environmentId param");
    }

    #[test]
    fn test_jsonrpc_response_structure() {
        let resp = JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: Some(serde_json::json!(1)),
            result: Some(serde_json::json!({"ok": true})),
            error: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"jsonrpc\":\"2.0\""));
        assert!(json.contains("\"result\""));
        assert!(!json.contains("\"error\"")); // skip_serializing_if = None
    }

    #[test]
    fn test_jsonrpc_error_response() {
        let resp = JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: Some(serde_json::json!(1)),
            result: None,
            error: Some(JsonRpcError {
                code: -32602,
                message: "Missing param".to_string(),
                data: None,
            }),
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"error\""));
        assert!(json.contains("-32602"));
        assert!(!json.contains("\"result\"")); // skip_serializing_if = None
    }

    #[test]
    fn test_tool_result_structure() {
        let result = ToolResult {
            content: vec![ToolResultContent {
                content_type: "text".to_string(),
                text: "hello".to_string(),
            }],
            is_error: None,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"type\":\"text\""));
        assert!(json.contains("\"text\":\"hello\""));
        assert!(!json.contains("isError")); // skip_serializing_if = None
    }

    #[test]
    fn test_tool_result_error_structure() {
        let result = ToolResult {
            content: vec![ToolResultContent {
                content_type: "text".to_string(),
                text: "error message".to_string(),
            }],
            is_error: Some(true),
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"isError\":true"));
    }

    #[test]
    fn test_mcp_server_handle_initial_state() {
        let handle = McpServerHandle::new();
        // Use tokio runtime for async tests
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            assert!(!handle.is_running().await);
            assert_eq!(handle.get_port().await, 0);
        });
    }
}
