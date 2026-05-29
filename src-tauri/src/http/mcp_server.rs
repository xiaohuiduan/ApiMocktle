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
use crate::db::project_repo;
use crate::db::menu_repo;
use crate::models::*;

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
            name: "api-test.list_api_menu_items".to_string(),
            description: "List all API menu items (endpoints) in a project".to_string(),
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
            description: "Get a test task with its steps".to_string(),
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
            description: "Create a new test task".to_string(),
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
            name: "api-test.add_step".to_string(),
            description: "Add a test step to a task".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "The task ID"
                    },
                    "menuItemId": {
                        "type": "string",
                        "description": "The API menu item ID"
                    },
                    "name": {
                        "type": "string",
                        "description": "Step name"
                    },
                    "preScript": {
                        "type": "string",
                        "description": "Pre-request script"
                    },
                    "postScript": {
                        "type": "string",
                        "description": "Post-response script"
                    },
                    "assertions": {
                        "type": "array",
                        "description": "Structured assertions",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": { "type": "string", "enum": ["status", "json_path", "header", "response_time", "body_contains"] },
                                "path": { "type": "string" },
                                "name": { "type": "string" },
                                "operator": { "type": "string", "enum": ["equals", "not_equals", "exists", "not_exists", "contains", "not_contains", "greater_than", "less_than"] },
                                "expected": {}
                            },
                            "required": ["type", "operator"]
                        }
                    },
                    "extractors": {
                        "type": "array",
                        "description": "Response data extractors",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": { "type": "string", "enum": ["json_path", "header", "regex", "status"] },
                                "path": { "type": "string" },
                                "name": { "type": "string" },
                                "pattern": { "type": "string" },
                                "variable": { "type": "string" }
                            },
                            "required": ["type", "variable"]
                        }
                    }
                },
                "required": ["taskId", "menuItemId"]
            }),
        },
        ToolDefinition {
            name: "api-test.update_step".to_string(),
            description: "Update a test step".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "stepId": {
                        "type": "string",
                        "description": "The step ID"
                    },
                    "name": {
                        "type": "string",
                        "description": "Step name"
                    },
                    "menuItemId": {
                        "type": "string",
                        "description": "The API menu item ID"
                    },
                    "preScript": {
                        "type": "string",
                        "description": "Pre-request script"
                    },
                    "postScript": {
                        "type": "string",
                        "description": "Post-response script"
                    },
                    "assertions": {
                        "type": "array",
                        "description": "Structured assertions",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": { "type": "string", "enum": ["status", "json_path", "header", "response_time", "body_contains"] },
                                "path": { "type": "string" },
                                "name": { "type": "string" },
                                "operator": { "type": "string", "enum": ["equals", "not_equals", "exists", "not_exists", "contains", "not_contains", "greater_than", "less_than"] },
                                "expected": {}
                            },
                            "required": ["type", "operator"]
                        }
                    },
                    "extractors": {
                        "type": "array",
                        "description": "Response data extractors",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": { "type": "string", "enum": ["json_path", "header", "regex", "status"] },
                                "path": { "type": "string" },
                                "name": { "type": "string" },
                                "pattern": { "type": "string" },
                                "variable": { "type": "string" }
                            },
                            "required": ["type", "variable"]
                        }
                    },
                    "enabled": {
                        "type": "boolean",
                        "description": "Enable/disable step"
                    }
                },
                "required": ["stepId"]
            }),
        },
        ToolDefinition {
            name: "api-test.delete_step".to_string(),
            description: "Delete a test step".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "stepId": {
                        "type": "string",
                        "description": "The step ID"
                    }
                },
                "required": ["stepId"]
            }),
        },
        ToolDefinition {
            name: "api-test.reorder_steps".to_string(),
            description: "Reorder test steps".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "taskId": {
                        "type": "string",
                        "description": "The task ID"
                    },
                    "stepIds": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        },
                        "description": "Ordered list of step IDs"
                    }
                },
                "required": ["taskId", "stepIds"]
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
            name: "api-test.create_task_with_steps".to_string(),
            description: "Create a test task with multiple steps in one call".to_string(),
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
                    "steps": {
                        "type": "array",
                        "description": "Array of test steps",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": { "type": "string" },
                                "menuItemId": { "type": "string" },
                                "preScript": { "type": "string" },
                                "postScript": { "type": "string" },
                                "requestOverride": { "type": "object" },
                                "assertions": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "type": { "type": "string" },
                                            "path": { "type": "string" },
                                            "name": { "type": "string" },
                                            "operator": { "type": "string" },
                                            "expected": {}
                                        },
                                        "required": ["type", "operator"]
                                    }
                                },
                                "extractors": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "type": { "type": "string" },
                                            "path": { "type": "string" },
                                            "name": { "type": "string" },
                                            "pattern": { "type": "string" },
                                            "variable": { "type": "string" }
                                        },
                                        "required": ["type", "variable"]
                                    }
                                }
                            },
                            "required": ["menuItemId"]
                        }
                    }
                },
                "required": ["projectId", "name", "steps"]
            }),
        },
    ]
}

// ==================== Tool Execution ====================

fn execute_tool(name: &str, arguments: &serde_json::Value, db: &Db) -> Result<ToolResult, JsonRpcError> {
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
        "api-test.list_api_menu_items" => {
            let project_id = arguments.get("projectId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing projectId".to_string(),
                    data: None,
                })?;

            match menu_repo::list_menu_items(db, project_id) {
                Ok(items) => {
                    // 只返回 API 相关的菜单项，并提取关键信息
                    let api_items: Vec<serde_json::Value> = items
                        .iter()
                        .filter(|item| {
                            item.menu_type == "apiDetail" || item.menu_type == "httpRequest"
                        })
                        .map(|item| {
                            let method = item.data_json
                                .as_ref()
                                .and_then(|d| d.get("method"))
                                .and_then(|m| m.as_str())
                                .unwrap_or("GET");
                            let path = item.data_json
                                .as_ref()
                                .and_then(|d| d.get("path"))
                                .and_then(|p| p.as_str())
                                .unwrap_or("");
                            serde_json::json!({
                                "id": item.id,
                                "name": item.name,
                                "method": method,
                                "path": path,
                                "type": item.menu_type
                            })
                        })
                        .collect();

                    Ok(ToolResult {
                        content: vec![ToolResultContent {
                            content_type: "text".to_string(),
                            text: serde_json::to_string_pretty(&api_items).unwrap_or_default(),
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
        "api-test.list_tasks" => {
            let project_id = arguments.get("projectId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing projectId".to_string(),
                    data: None,
                })?;

            match test_repo::list_tasks(db, project_id) {
                Ok(tasks) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&tasks).unwrap_or_default(),
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
                    match test_repo::list_steps(db, task_id) {
                        Ok(steps) => {
                            let detail = serde_json::json!({
                                "task": task,
                                "steps": steps
                            });
                            Ok(ToolResult {
                                content: vec![ToolResultContent {
                                    content_type: "text".to_string(),
                                    text: serde_json::to_string_pretty(&detail).unwrap_or_default(),
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

            let payload = CreateTestTaskPayload {
                project_id: project_id.to_string(),
                name: name.to_string(),
                description: description.to_string(),
                environment_id: None,
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
                environment_id: None,
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
        "api-test.add_step" => {
            let task_id = arguments.get("taskId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing taskId".to_string(),
                    data: None,
                })?;
            let menu_item_id = arguments.get("menuItemId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing menuItemId".to_string(),
                    data: None,
                })?;

            let assertions_json = arguments.get("assertions").map(|v| v.clone());
            let extractors_json = arguments.get("extractors").map(|v| v.clone());

            let payload = CreateTestStepPayload {
                task_id: task_id.to_string(),
                menu_item_id: menu_item_id.to_string(),
                name: arguments.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                sort_order: arguments.get("sortOrder").and_then(|v| v.as_i64()).map(|v| v as i32),
                pre_script: arguments.get("preScript").and_then(|v| v.as_str()).map(|s| s.to_string()),
                post_script: arguments.get("postScript").and_then(|v| v.as_str()).map(|s| s.to_string()),
                request_override_json: None,
                assertions_json,
                extractors_json,
                enabled: true,
            };

            match test_repo::create_step(db, &payload) {
                Ok(step) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&step).unwrap_or_default(),
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
        "api-test.update_step" => {
            let step_id = arguments.get("stepId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing stepId".to_string(),
                    data: None,
                })?;

            let assertions_json = arguments.get("assertions").map(|v| v.clone());
            let extractors_json = arguments.get("extractors").map(|v| v.clone());

            let payload = UpdateTestStepPayload {
                name: arguments.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()),
                sort_order: arguments.get("sortOrder").and_then(|v| v.as_i64()).map(|v| v as i32),
                menu_item_id: arguments.get("menuItemId").and_then(|v| v.as_str()).map(|s| s.to_string()),
                pre_script: arguments.get("preScript").and_then(|v| v.as_str()).map(|s| s.to_string()),
                post_script: arguments.get("postScript").and_then(|v| v.as_str()).map(|s| s.to_string()),
                request_override_json: None,
                assertions_json,
                extractors_json,
                enabled: arguments.get("enabled").and_then(|v| v.as_bool()),
            };

            match test_repo::update_step(db, step_id, &payload) {
                Ok(step) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&step).unwrap_or_default(),
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
        "api-test.delete_step" => {
            let step_id = arguments.get("stepId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing stepId".to_string(),
                    data: None,
                })?;

            match test_repo::delete_step(db, step_id) {
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
        "api-test.reorder_steps" => {
            let task_id = arguments.get("taskId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing taskId".to_string(),
                    data: None,
                })?;
            let step_ids = arguments.get("stepIds")
                .and_then(|v| v.as_array())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing stepIds".to_string(),
                    data: None,
                })?
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>();

            match test_repo::reorder_steps(db, task_id, &step_ids) {
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
        "api-test.create_task_with_steps" => {
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

            let steps = arguments.get("steps")
                .and_then(|v| v.as_array())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing steps".to_string(),
                    data: None,
                })?;

            // Create the task first
            let task_payload = CreateTestTaskPayload {
                project_id: project_id.to_string(),
                name: name.to_string(),
                description: description.to_string(),
                environment_id: None,
                fail_fast,
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

            // Create each step
            let mut created_steps = Vec::new();
            for (index, step_value) in steps.iter().enumerate() {
                let menu_item_id = step_value.get("menuItemId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let step_name = step_value.get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let pre_script = step_value.get("preScript")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let post_script = step_value.get("postScript")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let request_override_json = step_value.get("requestOverride").map(|v| v.clone());
                let assertions_json = step_value.get("assertions").map(|v| v.clone());
                let extractors_json = step_value.get("extractors").map(|v| v.clone());

                let step_payload = CreateTestStepPayload {
                    task_id: task.id.clone(),
                    sort_order: Some(index as i32),
                    name: step_name,
                    menu_item_id,
                    request_override_json,
                    pre_script,
                    post_script,
                    assertions_json,
                    extractors_json,
                    enabled: true,
                };

                match test_repo::create_step(db, &step_payload) {
                    Ok(step) => created_steps.push(step),
                    Err(e) => return Ok(ToolResult {
                        content: vec![ToolResultContent {
                            content_type: "text".to_string(),
                            text: format!("Error creating step {}: {}", index + 1, e),
                        }],
                        is_error: Some(true),
                    }),
                }
            }

            let result = serde_json::json!({
                "task": task,
                "steps": created_steps
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
                    match execute_tool(&params.name, &params.arguments, &state.db) {
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
