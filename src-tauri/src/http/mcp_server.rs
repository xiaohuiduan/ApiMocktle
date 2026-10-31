use axum::{
    extract::State as AxumState,
    routing::post,
    Json, Router,
};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{Mutex, oneshot};
use uuid::Uuid;

use crate::db::client::Db;
use crate::db::test_repo;
use crate::db::menu_repo;
use crate::db::flow_repo;
use crate::db::personal_token_repo;
use crate::db::project_repo;
use crate::models::*;
use crate::services::import_service::API_STATUSES;
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
    /// 监听非回环地址时，连只读工具也要令牌 —— 否则局域网内任何人都能读项目与测试数据
    pub require_auth: bool,
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
/// 检查 environmentId 是否存在于项目的环境配置中
fn environment_exists(db: &Db, project_id: &str, env_id: &str) -> bool {
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(_) => return false,
    };
    let config_str: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE project_id = ?1 AND key = 'environmentConfig'",
            rusqlite::params![project_id],
            |row| row.get(0),
        )
        .ok();
    drop(conn);
    let Some(config_str) = config_str else { return false };
    let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_str) else { return false };
    config.get("environments")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().any(|e| e.get("id").and_then(|x| x.as_str()) == Some(env_id)))
        .unwrap_or(false)
}

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
    // 其次用 folderId（校验存在性，避免挂到幽灵文件夹）
    if let Some(fid) = folder_id {
        if !fid.is_empty() {
            let folders = test_repo::list_folders(db, project_id)
                .map_err(|e| format!("Error listing folders: {}", e))?;
            if !folders.iter().any(|f| f.id == fid) {
                return Err(format!("Folder '{}' does not exist in project", fid));
            }
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
            description: "List all projects (newest first). Each item has id, name, ownerId, createdAt. Use the id as projectId for other tools; call get_flow_prompt(projectId) to see a project's APIs before choosing.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {}
            }),
        },
        ToolDefinition {
            name: "api-test.get_flow_prompt".to_string(),
            description: "Get the AI prompt for a project. mode=full (default) returns: environment list + global variable names, full API docs (menuItemId/method/path/params/body/response), all node type definitions and a complete example flow graph. Use full mode before building a flow. mode=brief returns only the environment/variable section plus a compact API catalog (menuItemId/name/method/path) and explicitly tells you to call full mode for node details. Optional query filters APIs by name/path/method (case-insensitive).".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "projectId": {
                        "type": "string",
                        "description": "The project ID"
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["full", "brief"],
                        "description": "full=完整接口文档（默认），brief=仅接口目录（menuItemId/名称/方法/路径）"
                    },
                    "query": {
                        "type": "string",
                        "description": "可选关键词，按接口名称/路径/方法过滤（不区分大小写）；与 brief 组合时先过滤再输出目录"
                    }
                },
                "required": ["projectId"]
            }),
        },
        ToolDefinition {
            name: "api-test.search_apis".to_string(),
            description: "Search APIs in a project by keyword (name/path/method, case-insensitive). Returns a compact list, each item has menuItemId (use this as data.menuItemId in httpRequest nodes), name, method, path and description. Empty query returns all APIs. Returns [] when the project has no APIs.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "projectId": {
                        "type": "string",
                        "description": "The project ID"
                    },
                    "query": {
                        "type": "string",
                        "description": "可选关键词，按接口名称/路径/方法过滤（不区分大小写）；为空时返回全部接口目录"
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
            description: "Get a test task with its flow graph. The response already includes the flowGraph, so only call load_flow_graph separately if you just need the graph.".to_string(),
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
            description: "Create an EMPTY test task (no flow graph). If you want to create a task with a flow graph in one step, use create_task_with_flow instead. environmentId is optional: OMIT the parameter (do not pass an empty string) to leave the task unbound.".to_string(),
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
                        "description": "Environment ID to use for test execution (optional; OMIT the parameter to leave unbound - do not pass an empty string)"
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
            description: "Update a test task (name/description/failFast/environmentId). environmentId: omit to keep current, pass a new id to change, do not pass an empty string. Note: folder assignment cannot be changed through this tool.".to_string(),
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
                        "description": "Environment ID to use for test execution (optional; OMIT the parameter to leave unbound - do not pass an empty string)"
                    }
                },
                "required": ["taskId"]
            }),
        },
        ToolDefinition {
            name: "api-test.delete_task".to_string(),
            description: "Delete a test task. Returns an error if the task does not exist.".to_string(),
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
            description: "List test executions for a task, newest first. Optional limit (default 20, max 100).".to_string(),
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
            description: "Delete a test execution. Returns an error if the execution does not exist.".to_string(),
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
            description: "Set or update task-level variables (merged with existing ones; existing variables are kept). These variables ARE merged into run_task execution (runtime variables passed to run_task take priority).".to_string(),
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
            description: "Run a legacy step-based test task and return execution summary. IMPORTANT: tasks created via create_task_with_flow use flow graphs and CANNOT be executed through MCP - the tool returns an error for them; run those in the app frontend. If a task has neither steps nor a flow graph, it errors instead of returning a fake success. variables override environment variables; environmentId falls back to the task's bound environment.".to_string(),
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
            description: "Create a test task AND its flow graph in one call. The graph is deeply validated first (start x1, end >=1, unique ids, valid node types, position, edge source/target/handles, menuItemId non-empty and must exist in project, required data fields per node type); an invalid graph is rejected with errors and NO task is created (no side effects). Optionally bind an environment: OMIT environmentId (do not pass empty string) to leave unbound. See get_flow_prompt(mode=full) for node/edge structure before building graphJson.".to_string(),
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
                    "environmentId": {
                        "type": "string",
                        "description": "Environment ID to use for test execution (optional; OMIT the parameter to leave unbound - do not pass an empty string)"
                    },
                    "failFast": {
                        "type": "boolean",
                        "description": "Stop on first failure (default true)"
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
            description: "Save or replace the flow graph of an existing task. The graph is deeply validated first (same rules as create_task_with_flow); an invalid graph is NOT saved and returns errors. See get_flow_prompt(mode=full) for node/edge structure.".to_string(),
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
            description: "Load the flow graph of a task. Returns the graph JSON, or null if the task has no flow graph (not an error).".to_string(),
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
            description: "Delete the flow graph of a task. Returns an error if the task has no flow graph.".to_string(),
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
            description: "Validate a flow graph structure. Returns {valid, errors, warnings, nodeCount, edgeCount}. Pass projectId to also check that every httpRequest menuItemId exists in the project (missing ids are errors). create_task_with_flow and save_flow_graph already validate internally, so you only need this to pre-check before saving.".to_string(),
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
        ToolDefinition {
            name: "api-doc.upsert_endpoint".to_string(),
            description: "创建或更新接口文档。给了 id 按 id 更新；没给 id 时按 (projectId, method, path) 查重后更新，否则新建。幂等：同 (method, path) 再次调用更新同一条并保留原 id 与 createdAt。参数类型非法值降级 string；状态非法值时沿用原状态（无有效原状态才用 designing）。parameters / requestBody / responses / tags 传入即整体替换该字段（类型不符等同未传），不传才沿用原值；只改描述或状态时不要传这几个字段，要传就必须带全量。删除接口请用 api-doc.delete_endpoint。".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "description": "项目 ID（必填，必须已存在）" },
                    "method": { "type": "string", "description": "HTTP 方法，如 GET / POST（必填）" },
                    "path": { "type": "string", "description": "接口路径，如 /api/v1/orders（必填）" },
                    "name": { "type": "string", "description": "接口名称（必填）" },
                    "description": { "type": "string", "description": "接口描述（可选，缺省保留原值）" },
                    "status": { "type": "string", "description": "接口状态，取值 designing/pending/developing/obsolete/integrating/testing/tested/released/deprecated/exception；非法值沿用原状态（无原状态才用 designing）" },
                    "tags": { "type": "array", "items": { "type": "string" }, "description": "标签（可选）。整体替换：传入即覆盖原有全部标签；不传才沿用原值" },
                    "parameters": {
                        "type": ["object", "array"],
                        "description": "请求参数，按位置分组；每项 {name,type,required?,description?,example?,enable?}。整体替换：传入即覆盖原有全部参数（未列出的旧参数会消失）；不传才沿用原值。也接受扁平数组，每项用 in 标位置（path/query/header/cookie，缺省 query）",
                        "properties": {
                            "path": { "type": "array", "items": { "type": "object", "properties": { "name": { "type": "string" }, "type": { "type": "string", "description": "integer/number/boolean/string/array/file，非法值降级 string" }, "required": { "type": "boolean" }, "description": { "type": "string" }, "example": {}, "enable": { "type": "boolean" } } } },
                            "query": { "type": "array", "items": { "type": "object", "properties": { "name": { "type": "string" }, "type": { "type": "string", "description": "integer/number/boolean/string/array/file，非法值降级 string" }, "required": { "type": "boolean" }, "description": { "type": "string" }, "example": {}, "enable": { "type": "boolean" } } } },
                            "header": { "type": "array", "items": { "type": "object", "properties": { "name": { "type": "string" }, "type": { "type": "string", "description": "integer/number/boolean/string/array/file，非法值降级 string" }, "required": { "type": "boolean" }, "description": { "type": "string" }, "example": {}, "enable": { "type": "boolean" } } } },
                            "cookie": { "type": "array", "items": { "type": "object", "properties": { "name": { "type": "string" }, "type": { "type": "string", "description": "integer/number/boolean/string/array/file，非法值降级 string" }, "required": { "type": "boolean" }, "description": { "type": "string" }, "example": {}, "enable": { "type": "boolean" } } } }
                        },
                        "items": { "type": "object", "properties": { "name": { "type": "string" }, "in": { "type": "string", "description": "位置：path/query/header/cookie，缺省 query" }, "type": { "type": "string", "description": "integer/number/boolean/string/array/file，非法值降级 string" }, "required": { "type": "boolean" }, "description": { "type": "string" }, "example": {}, "enable": { "type": "boolean" } } }
                    },
                    "requestBody": {
                        "type": "object",
                        "description": "请求体 {type,parameters?,jsonSchema?,rawText?,required?,examples?}。整体替换：传入即覆盖原有请求体；不传才沿用原值",
                        "properties": {
                            "type": { "type": "string", "description": "application/json 等媒体类型；无请求体用 none" },
                            "contentType": { "type": "string", "description": "type 的别名，type 与 contentType 都不传按 none 处理" },
                            "parameters": { "type": "array", "items": { "type": "object", "properties": { "name": { "type": "string" }, "type": { "type": "string" }, "required": { "type": "boolean" }, "description": { "type": "string" }, "example": {}, "enable": { "type": "boolean" } } } },
                            "jsonSchema": {},
                            "rawText": { "type": "string" },
                            "required": { "type": "boolean" },
                            "examples": { "type": "array", "items": { "type": "object" } }
                        }
                    },
                    "responses": {
                        "type": "array",
                        "description": "响应列表；整体替换：传入即覆盖原有全部响应；不传则新建时默认一条 200 成功、更新时沿用原响应",
                        "items": {
                            "type": "object",
                            "properties": {
                                "code": { "type": "integer" },
                                "name": { "type": "string" },
                                "contentType": { "type": "string", "description": "json/xml/html/raw/binary" },
                                "jsonSchema": {},
                                "description": { "type": "string" },
                                "example": {}
                            }
                        }
                    },
                    "parentId": { "type": ["string", "null"], "description": "挂到的接口目录 ID（可选，必须是 apiDetailFolder）；不传则不改变位置，显式传 null 或空串表示移到根级" },
                    "id": { "type": "string", "description": "已有接口的菜单项 ID（可选，给了就按 id 更新）" }
                },
                "required": ["projectId", "method", "path", "name"]
            }),
        },
        ToolDefinition {
            name: "api-doc.delete_endpoint".to_string(),
            description: "删除接口（进回收站，可由用户在回收站恢复）。".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "description": "项目 ID" },
                    "id": { "type": "string", "description": "接口菜单项 ID" }
                },
                "required": ["projectId", "id"]
            }),
        },
        ToolDefinition {
            name: "api-doc.create_folder".to_string(),
            description: "创建接口目录。parentId 缺省或 null 表示建在根级；给了 parentId 时父级必须存在且是 apiDetailFolder，可建多层目录。".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "description": "项目 ID" },
                    "name": { "type": "string", "description": "目录名称" },
                    "parentId": { "type": "string", "description": "父目录 ID（可选，null/缺省表示根级）" }
                },
                "required": ["projectId", "name"]
            }),
        },
        ToolDefinition {
            name: "api-doc.move_folder".to_string(),
            description: "移动或重命名接口目录。parentId 显式传 null 表示移到根级；防环：目标父级不能是自己或自己的子孙。".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "description": "项目 ID" },
                    "id": { "type": "string", "description": "要移动的目录 ID" },
                    "parentId": { "type": ["string", "null"], "description": "新父目录 ID；显式 null 表示移到根级；不传则不改变位置" },
                    "name": { "type": "string", "description": "新名称（可选，不传则不改名）" }
                },
                "required": ["projectId", "id"]
            }),
        },
        ToolDefinition {
            name: "api-doc.save_schema".to_string(),
            description: "保存数据模型（apiSchema）。按名称幂等：同名模型覆盖内容并保留原 id，不产生重复项。".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "description": "项目 ID" },
                    "name": { "type": "string", "description": "模型名称（幂等键）" },
                    "jsonSchema": { "description": "模型 JSON Schema" },
                    "parentId": { "type": "string", "description": "模型目录 ID（可选，需为目录类型）" }
                },
                "required": ["projectId", "name", "jsonSchema"]
            }),
        },
        ToolDefinition {
            name: "api-doc.save_environment".to_string(),
            description: "保存环境与全局变量。按名称合并：同名替换、异名追加，不会清空未提及的已有环境或变量。".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "projectId": { "type": "string", "description": "项目 ID" },
                    "globalVariables": {
                        "type": "array",
                        "description": "全局变量列表",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": { "type": "string" },
                                "value": { "type": "string" },
                                "enable": { "type": "boolean" }
                            },
                            "required": ["name"]
                        }
                    },
                    "environments": {
                        "type": "array",
                        "description": "环境列表",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": { "type": "string", "description": "可选；缺省时同名环境沿用原 id" },
                                "name": { "type": "string" },
                                "url": { "type": "string" },
                                "baseUrls": { "type": "array", "items": { "type": "object" } },
                                "variables": { "type": "array", "items": { "type": "object" } },
                                "parameters": { "type": "object" }
                            },
                            "required": ["name"]
                        }
                    }
                },
                "required": ["projectId"]
            }),
        },
    ]
}

// ==================== Tool Execution ====================

/// 校验 flow graph 结构，返回 (errors, warnings, node_count, edge_count)
fn validate_flow_graph(
    graph_json: &serde_json::Value,
    project_id: Option<&str>,
    db: &Db,
) -> (Vec<String>, Vec<String>, usize, usize) {
    let mut errors: Vec<String> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    // Check nodes array exists
    let nodes = match graph_json.get("nodes").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => {
            errors.push("graphJson 必须包含 nodes 数组".to_string());
            return (errors, warnings, 0, 0);
        }
    };

    // Check edges array exists
    let edges = match graph_json.get("edges").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => {
            errors.push("graphJson 必须包含 edges 数组".to_string());
            return (errors, warnings, nodes.len(), 0);
        }
    };

    let node_count = nodes.len();
    let edge_count = edges.len();

    // 节点类型白名单（与前端 nodeRegistry 一致）
    const VALID_TYPES: [&str; 10] = [
        "start", "end", "httpRequest", "condition", "loop", "parallel", "wait", "setVariable", "assert", "subFlow",
    ];

    // 校验节点：id/position/type 白名单/start 数量/data 必填
    let mut node_ids: Vec<&str> = Vec::new();
    let mut id_to_type: std::collections::HashMap<&str, &str> = std::collections::HashMap::new();
    let mut start_count = 0usize;
    let mut end_count = 0usize;
    for node in nodes {
        let node_id = node.get("id").and_then(|v| v.as_str());
        let node_type = node.get("type").and_then(|v| v.as_str()).unwrap_or("");

        if let Some(id) = node_id {
            node_ids.push(id);
            id_to_type.insert(id, node_type);
        } else {
            errors.push("存在缺少 id 的节点，所有节点必须包含唯一 id".to_string());
        }

        if node_type.is_empty() {
            errors.push(format!("节点 '{}' 缺少 type", node_id.unwrap_or("unknown")));
        } else if !VALID_TYPES.contains(&node_type) {
            errors.push(format!("节点 '{}' 的 type '{}' 不在允许列表（start/end/httpRequest/condition/loop/parallel/wait/setVariable/assert/subFlow）中", node_id.unwrap_or("unknown"), node_type));
        }

        // 前端 React Flow 需要 position
        if node.get("position").is_none() {
            errors.push(format!("节点 '{}' 缺少 position 字段（可填 {{\"x\":0,\"y\":0}}）", node_id.unwrap_or("unknown")));
        }

        if node_type == "start" { start_count += 1; }
        if node_type == "end" { end_count += 1; }

        // 节点数据必填项
        let data = node.get("data");
        match node_type {
            "httpRequest" => {
                let has_menu = data.and_then(|d| d.get("menuItemId")).and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
                if !has_menu {
                    errors.push(format!("httpRequest 节点 '{}' 的 data.menuItemId 不能为空（引用接口的 menuItemId）", node_id.unwrap_or("unknown")));
                }
            }
            "condition" => {
                if data.is_none() || data.and_then(|d| d.get("conditionType")).and_then(|v| v.as_str()).is_none() {
                    errors.push(format!("condition 节点 '{}' 缺少 data.conditionType（expression/variable_check/status_code）", node_id.unwrap_or("unknown")));
                }
            }
            "loop" => {
                if data.is_none() || data.and_then(|d| d.get("loopType")).and_then(|v| v.as_str()).is_none() {
                    errors.push(format!("loop 节点 '{}' 缺少 data.loopType（count/while/for_each）", node_id.unwrap_or("unknown")));
                }
            }
            "parallel" => {
                if data.and_then(|d| d.get("branchCount")).and_then(|v| v.as_u64()).is_none() {
                    errors.push(format!("parallel 节点 '{}' 缺少 data.branchCount（>=2 的数字）", node_id.unwrap_or("unknown")));
                }
            }
            "setVariable" => {
                if data.and_then(|d| d.get("assignments")).and_then(|v| v.as_array()).is_none() {
                    errors.push(format!("setVariable 节点 '{}' 缺少 data.assignments 数组", node_id.unwrap_or("unknown")));
                }
            }
            "assert" => {
                if data.and_then(|d| d.get("assertions")).and_then(|v| v.as_array()).is_none() {
                    errors.push(format!("assert 节点 '{}' 缺少 data.assertions 数组", node_id.unwrap_or("unknown")));
                }
            }
            "subFlow" => {
                let has_target = data.and_then(|d| d.get("targetTaskId")).and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
                if !has_target {
                    errors.push(format!("subFlow 节点 '{}' 的 data.targetTaskId 不能为空", node_id.unwrap_or("unknown")));
                }
            }
            _ => {}
        }
    }

    if start_count == 0 {
        errors.push("流程必须包含一个 start 节点".to_string());
    } else if start_count > 1 {
        errors.push(format!("流程有 {} 个 start 节点（必须恰好 1 个）", start_count));
    }
    if end_count == 0 {
        errors.push("流程必须包含至少一个 end 节点".to_string());
    }

    // id 唯一性
    let original_len = node_ids.len();
    node_ids.sort();
    node_ids.dedup();
    if node_ids.len() < original_len {
        errors.push("节点 id 必须唯一".to_string());
    }

    let node_id_set: std::collections::HashSet<&str> = node_ids.iter().copied().collect();

    // 校验边：引用有效节点 + handle 非空 + 起点非 end + 终点非 start
    let mut incoming: std::collections::HashSet<&str> = std::collections::HashSet::new();
    let mut outgoing: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for edge in edges {
        let edge_id = edge.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
        let source = edge.get("source").and_then(|v| v.as_str());
        let target = edge.get("target").and_then(|v| v.as_str());
        let source_handle = edge.get("sourceHandle").and_then(|v| v.as_str());
        let target_handle = edge.get("targetHandle").and_then(|v| v.as_str());

        if let Some(s) = source {
            outgoing.insert(s);
            if !node_id_set.contains(s) {
                errors.push(format!("边 '{}' 引用了不存在的源节点 '{}'", edge_id, s));
            } else if id_to_type.get(s) == Some(&"end") {
                errors.push(format!("边 '{}' 从 end 节点 '{}' 出发，end 节点不应有出边", edge_id, s));
            }
        } else {
            errors.push(format!("边 '{}' 缺少 source", edge_id));
        }
        if let Some(t) = target {
            incoming.insert(t);
            if !node_id_set.contains(t) {
                errors.push(format!("边 '{}' 引用了不存在的目标节点 '{}'", edge_id, t));
            } else if id_to_type.get(t) == Some(&"start") {
                errors.push(format!("边 '{}' 指向 start 节点 '{}'，start 节点不应有入边", edge_id, t));
            }
        } else {
            errors.push(format!("边 '{}' 缺少 target", edge_id));
        }
        if source_handle.is_none() || source_handle.map(|h| h.is_empty()).unwrap_or(true) {
            errors.push(format!("边 '{}' 缺少 sourceHandle（如 out/true/false/loop/branch-0）", edge_id));
        }
        // 校验 sourceHandle 是否为源节点类型的合法输出口（前端执行契约）
        if let Some(sh) = source_handle {
            if !sh.is_empty() {
                let stype = source.and_then(|s| id_to_type.get(s)).copied().unwrap_or("");
                let ok = match stype {
                    "condition" => matches!(sh, "true" | "false" | "default"),
                    "loop" => matches!(sh, "out" | "loop"),
                    "parallel" => sh == "out" || sh.starts_with("branch-"),
                    "end" => false,
                    "start" | "httpRequest" | "setVariable" | "wait" | "assert" | "subFlow" => sh == "out",
                    _ => false,
                };
                if !ok {
                    errors.push(format!("边 '{}' 的 sourceHandle '{}' 不是节点 '{}'（类型 '{}'）的合法输出口", edge_id, sh, source.unwrap_or("unknown"), stype));
                }
            }
        }
        if target_handle.is_none() || target_handle.map(|h| h.is_empty()).unwrap_or(true) {
            errors.push(format!("边 '{}' 缺少 targetHandle（通常为 in）", edge_id));
        }
    }

    // 孤立节点 warning（start/end 除外）
    for node in nodes {
        let node_id = node.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
        let node_type = node.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if node_type != "start" && node_type != "end" {
            let has_in = incoming.contains(node_id);
            let has_out = outgoing.contains(node_id);
            if !has_in && !has_out {
                warnings.push(format!("节点 '{}' 既没有入边也没有出边（孤立节点，不会被执行）", node_id));
            } else if !has_in {
                warnings.push(format!("节点 '{}' 没有入边（流程到达不到）", node_id));
            } else if !has_out {
                warnings.push(format!("节点 '{}' 没有出边（流程在此结束）", node_id));
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
                                errors.push(format!("httpRequest 节点 '{}' 引用的 menuItemId '{}' 在项目中不存在，接口会请求失败", node_id, menu_id));
                            }
                        }
                    }
                }
            }
            Err(e) => {
                warnings.push(format!("无法对照项目校验 menuItemId：{}", e));
            }
        }
    }

    (errors, warnings, node_count, edge_count)
}

// ==================== api-doc 文档写工具 ====================

/// 文档写工具前缀：只有这些工具在 tools/call 时校验个人令牌。
const DOC_TOOL_PREFIX: &str = "api-doc.";

/// 与前端 `ParamType` / `ContentType` 枚举对齐，非法值一律降级。
const DOC_PARAM_TYPES: [&str; 6] = ["integer", "number", "boolean", "string", "array", "file"];
const DOC_CONTENT_TYPES: [&str; 5] = ["json", "xml", "html", "raw", "binary"];
/// 可作为父级的目录类型。
const DOC_FOLDER_TYPES: [&str; 2] = ["apiDetailFolder", "apiSchemaFolder"];

fn doc_err(code: i32, message: impl Into<String>) -> JsonRpcError {
    JsonRpcError {
        code,
        message: message.into(),
        data: None,
    }
}

fn doc_db_err(e: impl std::fmt::Display) -> JsonRpcError {
    doc_err(-32603, format!("数据库错误: {e}"))
}

fn doc_str_arg<'a>(args: &'a serde_json::Value, key: &str) -> Result<&'a str, JsonRpcError> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| doc_err(-32602, format!("缺少参数 {key}")))
}

fn ensure_project_exists(db: &Db, project_id: &str) -> Result<(), JsonRpcError> {
    match project_repo::get_project_by_id(db, project_id) {
        Ok(Some(_)) => Ok(()),
        Ok(None) => Err(doc_err(-32602, format!("项目不存在: {project_id}"))),
        Err(e) => Err(doc_db_err(e)),
    }
}

fn ensure_folder(
    db: &Db,
    project_id: &str,
    folder_id: &str,
    allowed: &[&str],
) -> Result<(), JsonRpcError> {
    match menu_repo::get_menu_item(db, project_id, folder_id) {
        Ok(Some(item)) if allowed.contains(&item.menu_type.as_str()) => Ok(()),
        Ok(Some(_)) => Err(doc_err(-32602, format!("父级 {folder_id} 不是目录"))),
        Ok(None) => Err(doc_err(-32602, format!("父级不存在: {folder_id}"))),
        Err(e) => Err(doc_db_err(e)),
    }
}

/// 从请求头取个人令牌：X-YAPI-TOKEN 优先，其次 Authorization: Bearer。
fn doc_header_token(headers: &HeaderMap) -> Option<String> {
    if let Some(token) = headers.get("X-YAPI-TOKEN").and_then(|v| v.to_str().ok()) {
        let token = token.trim();
        if !token.is_empty() {
            return Some(token.to_string());
        }
    }
    let bearer = headers.get("Authorization").and_then(|v| v.to_str().ok())?;
    let token = bearer
        .strip_prefix("Bearer ")
        .or_else(|| bearer.strip_prefix("bearer "))?
        .trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

/// 只对 api-doc.* 校验令牌：api-test.* 维持原有的无鉴权行为，避免破坏现有用法。
/// 回环地址只有本机可达，不需要为读工具加令牌；绑到网卡上的地址就得全部鉴权
fn requires_auth_for_host(host: &str) -> bool {
    !matches!(host, "127.0.0.1" | "localhost" | "::1")
}

fn authorize_doc_tool(db: &Db, headers: &HeaderMap) -> Result<(), JsonRpcError> {    let Some(token) = doc_header_token(headers) else {
        return Err(doc_err(
            -32001,
            "api-doc.* 工具需要个人令牌：请在请求头带 X-YAPI-TOKEN 或 Authorization: Bearer <令牌>",
        ));
    };
    if personal_token_repo::find_user_by_personal_token(db, &token).is_none() {
        return Err(doc_err(
            -32001,
            "个人令牌无效或已删除，请在「设置 → 个人令牌」重新创建",
        ));
    }
    Ok(())
}

fn doc_normalize_param(raw: &serde_json::Value) -> serde_json::Value {
    let ty = raw.get("type").and_then(|v| v.as_str()).unwrap_or("string");
    let ty = if DOC_PARAM_TYPES.contains(&ty) { ty } else { "string" };
    let id = raw
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let mut out = serde_json::json!({
        "id": id,
        "name": raw.get("name").and_then(|v| v.as_str()).unwrap_or(""),
        "type": ty,
        "description": raw.get("description").and_then(|v| v.as_str()).unwrap_or(""),
        "required": raw.get("required").and_then(|v| v.as_bool()).unwrap_or(false),
        "enable": raw.get("enable").and_then(|v| v.as_bool()).unwrap_or(true),
    });
    if let Some(example) = raw.get("example") {
        out["example"] = example.clone();
    }
    out
}

/// parameters 按 path/query/header/cookie 分组；全空时存 null，与导入器一致。
fn doc_normalize_parameters(raw: &serde_json::Value) -> serde_json::Value {
    // 也接受扁平数组（每项带 in），否则调用方漏写分组会静默丢掉整批参数
    if let Some(arr) = raw.as_array() {
        let mut grouped: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
        for item in arr {
            let section = match item.get("in").and_then(|v| v.as_str()) {
                Some(s @ ("path" | "query" | "header" | "cookie")) => s,
                _ => "query",
            };
            grouped
                .entry(section.to_string())
                .or_insert_with(|| serde_json::Value::Array(Vec::new()))
                .as_array_mut()
                .expect("value is array")
                .push(doc_normalize_param(item));
        }
        return if grouped.is_empty() {
            serde_json::Value::Null
        } else {
            serde_json::Value::Object(grouped)
        };
    }
    let mut out = serde_json::Map::new();
    for section in ["path", "query", "header", "cookie"] {
        if let Some(arr) = raw.get(section).and_then(|v| v.as_array()) {
            out.insert(
                section.to_string(),
                serde_json::Value::Array(arr.iter().map(doc_normalize_param).collect()),
            );
        }
    }
    if out.is_empty() {
        serde_json::Value::Null
    } else {
        serde_json::Value::Object(out)
    }
}

fn doc_normalize_request_body(raw: &serde_json::Value) -> serde_json::Value {
    // contentType 是 Apifox/OpenAPI 的说法，库内字段叫 type，两种都认
    let body_type = raw
        .get("type")
        .or_else(|| raw.get("contentType"))
        .and_then(|v| v.as_str())
        .unwrap_or("none");
    let mut out = serde_json::json!({
        "type": body_type,
    });
    if let Some(params) = raw.get("parameters").and_then(|v| v.as_array()) {
        out["parameters"] =
            serde_json::Value::Array(params.iter().map(doc_normalize_param).collect());
    }
    for key in ["jsonSchema", "rawText", "examples"] {
        if let Some(value) = raw.get(key) {
            out[key] = value.clone();
        }
    }
    if let Some(required) = raw.get("required").and_then(|v| v.as_bool()) {
        out["required"] = serde_json::Value::Bool(required);
    }
    out
}

fn doc_normalize_response(raw: &serde_json::Value) -> serde_json::Value {
    let ct = raw.get("contentType").and_then(|v| v.as_str()).unwrap_or("json");
    let ct = if DOC_CONTENT_TYPES.contains(&ct) { ct } else { "json" };
    let id = raw
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let mut out = serde_json::json!({
        "id": id,
        "code": raw.get("code").and_then(|v| v.as_i64()).unwrap_or(200),
        "name": raw.get("name").and_then(|v| v.as_str()).unwrap_or("成功"),
        "contentType": ct,
    });
    for key in ["jsonSchema", "description", "example"] {
        if let Some(value) = raw.get(key) {
            out[key] = value.clone();
        }
    }
    out
}

fn doc_normalize_responses(raw: &[serde_json::Value]) -> serde_json::Value {
    serde_json::Value::Array(raw.iter().map(doc_normalize_response).collect())
}

fn doc_default_responses() -> serde_json::Value {
    doc_normalize_responses(&[serde_json::json!({"code": 200, "name": "成功"})])
}

/// 新建接口时计算排序号；在事务内查询，避免另开锁。
fn doc_next_sort_order(
    conn: &rusqlite::Connection,
    project_id: &str,
) -> Result<i32, JsonRpcError> {
    let max: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM menu_items WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(doc_db_err)?;
    Ok(max + 1)
}

fn doc_upsert_endpoint(
    db: &Db,
    args: &serde_json::Value,
) -> Result<serde_json::Value, JsonRpcError> {
    let project_id = doc_str_arg(args, "projectId")?;
    let method = doc_str_arg(args, "method")?.to_uppercase();
    let path = doc_str_arg(args, "path")?;
    let name = doc_str_arg(args, "name")?;
    ensure_project_exists(db, project_id)?;

    let explicit_id = args
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let existing = match explicit_id {
        Some(id) => menu_repo::get_menu_item(db, project_id, id).map_err(doc_db_err)?,
        None => {
            menu_repo::find_api_by_path_method(db, project_id, path, &method).map_err(doc_db_err)?
        }
    };
    if let Some(item) = &existing {
        if item.menu_type != "apiDetail" {
            return Err(doc_err(-32602, format!("菜单项 {} 不是接口", item.id)));
        }
    }

    // parentId：不传 = 不动位置；显式 null / 空串 = 移到根级；字符串 = 挂到该目录
    let parent_arg = args.get("parentId");
    let parent_id: Option<Option<String>> = match parent_arg {
        None => None,
        Some(serde_json::Value::Null) => Some(None),
        Some(v) => {
            let pid = v.as_str().map(str::trim).unwrap_or("");
            if pid.is_empty() {
                Some(None)
            } else {
                ensure_folder(db, project_id, pid, &["apiDetailFolder"])?;
                Some(Some(pid.to_string()))
            }
        }
    };

    let now = chrono::Utc::now().to_rfc3339();
    let prev = existing.as_ref().and_then(|item| item.data_json.as_ref());
    let prev_str = |key: &str| prev.and_then(|v| v.get(key)).and_then(|v| v.as_str());

    let status = args
        .get("status")
        .and_then(|v| v.as_str())
        .filter(|s| API_STATUSES.contains(s))
        .map(str::to_string)
        .unwrap_or_else(|| match prev_str("status") {
            Some(s) if API_STATUSES.contains(&s) => s.to_string(),
            _ => "designing".to_string(),
        });

    let description = args
        .get("description")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .or_else(|| prev_str("description").map(str::to_string))
        .unwrap_or_default();

    let tags = match args.get("tags") {
        Some(serde_json::Value::Array(arr)) => serde_json::Value::Array(
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| serde_json::Value::String(s.to_string())))
                .collect(),
        ),
        _ => prev
            .and_then(|v| v.get("tags"))
            .cloned()
            .unwrap_or_else(|| serde_json::json!([])),
    };

    let parameters = match args.get("parameters") {
        Some(v) if v.is_object() || v.is_array() => doc_normalize_parameters(v),
        _ => prev
            .and_then(|v| v.get("parameters"))
            .cloned()
            .unwrap_or(serde_json::Value::Null),
    };

    let request_body = match args.get("requestBody") {
        Some(v) if v.is_object() => doc_normalize_request_body(v),
        _ => prev
            .and_then(|v| v.get("requestBody"))
            .cloned()
            .unwrap_or(serde_json::Value::Null),
    };

    let responses = match args.get("responses").and_then(|v| v.as_array()) {
        Some(arr) => doc_normalize_responses(arr),
        None => prev
            .and_then(|v| v.get("responses"))
            .cloned()
            .unwrap_or_else(doc_default_responses),
    };

    let api_id = existing
        .as_ref()
        .map(|item| item.id.clone())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let created_at = prev_str("createdAt")
        .map(str::to_string)
        .unwrap_or_else(|| now.clone());

    let mut data = serde_json::json!({
        "id": api_id,
        "method": method,
        "path": path,
        "name": name,
        "status": status,
        "description": description,
        "tags": tags,
        "parameters": parameters,
        "requestBody": request_body,
        "responses": responses,
        "createdAt": created_at,
        "updatedAt": now,
    });
    // 保留既有扩展字段（如导入器写入的 source），避免 upsert 抹掉来源维度
    if let Some(prev_obj) = prev.and_then(|v| v.as_object()) {
        for (key, value) in prev_obj {
            if data.get(key).is_none() {
                data[key] = value.clone();
            }
        }
    }

    let created = existing.is_none();
    {
        let mut guard = db
            .0
            .lock()
            .map_err(|_| doc_err(-32603, "数据库锁不可用"))?;
        let tx = guard.transaction().map_err(doc_db_err)?;
        match &existing {
            Some(item) => {
                let updates = serde_json::json!({ "name": name, "data": data });
                menu_repo::update_menu_item_conn(&tx, project_id, &item.id, &updates)
                    .map_err(doc_db_err)?;
                if let Some(target) = &parent_id {
                    menu_repo::set_menu_item_parent(&tx, project_id, &item.id, target.as_deref())
                        .map_err(doc_db_err)?;
                }
            }
            None => {
                let sort_order = doc_next_sort_order(&tx, project_id)?;
                let payload = CreateMenuItemPayload {
                    id: api_id.clone(),
                    parent_id: parent_id.clone().flatten(),
                    name: name.to_string(),
                    menu_type: "apiDetail".to_string(),
                    data_json: Some(data),
                    run_tab_json: None,
                    sort_order: Some(sort_order),
                };
                menu_repo::create_menu_item_conn(&tx, project_id, &payload).map_err(doc_db_err)?;
            }
        }
        tx.commit().map_err(doc_db_err)?;
    }

    Ok(serde_json::json!({ "id": api_id, "created": created }))
}

fn doc_delete_endpoint(
    db: &Db,
    args: &serde_json::Value,
) -> Result<serde_json::Value, JsonRpcError> {
    let project_id = doc_str_arg(args, "projectId")?;
    let id = doc_str_arg(args, "id")?;
    ensure_project_exists(db, project_id)?;
    match menu_repo::get_menu_item(db, project_id, id).map_err(doc_db_err)? {
        None => return Err(doc_err(-32602, format!("接口不存在: {id}"))),
        Some(item) if item.menu_type != "apiDetail" => {
            return Err(doc_err(-32602, format!("菜单项 {id} 不是接口")));
        }
        Some(_) => {}
    }
    menu_repo::delete_menu_item(db, project_id, id).map_err(doc_db_err)?;
    Ok(serde_json::json!({ "id": id, "deleted": true }))
}

/// 解析可选父级：缺省/null/空串 → 根级，字符串 → 校验后返回。
fn doc_optional_parent(
    db: &Db,
    project_id: &str,
    args: &serde_json::Value,
    allowed: &[&str],
) -> Result<Option<String>, JsonRpcError> {
    match args.get("parentId") {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(v) => {
            let pid = v.as_str().map(str::trim).unwrap_or("");
            if pid.is_empty() {
                Ok(None)
            } else {
                ensure_folder(db, project_id, pid, allowed)?;
                Ok(Some(pid.to_string()))
            }
        }
    }
}

fn doc_create_folder(
    db: &Db,
    args: &serde_json::Value,
) -> Result<serde_json::Value, JsonRpcError> {
    let project_id = doc_str_arg(args, "projectId")?;
    let name = doc_str_arg(args, "name")?;
    ensure_project_exists(db, project_id)?;
    let parent_id = doc_optional_parent(db, project_id, args, &["apiDetailFolder"])?;

    let id = Uuid::new_v4().to_string();
    let max = menu_repo::get_max_sort_order(db, project_id).map_err(doc_db_err)?;
    let payload = CreateMenuItemPayload {
        id: id.clone(),
        parent_id,
        name: name.to_string(),
        menu_type: "apiDetailFolder".to_string(),
        data_json: Some(serde_json::json!({ "name": name })),
        run_tab_json: None,
        sort_order: Some(max + 1),
    };
    menu_repo::create_menu_item(db, project_id, &payload).map_err(doc_db_err)?;
    Ok(serde_json::json!({ "id": id, "created": true }))
}

fn doc_move_folder(
    db: &Db,
    args: &serde_json::Value,
) -> Result<serde_json::Value, JsonRpcError> {
    let project_id = doc_str_arg(args, "projectId")?;
    let id = doc_str_arg(args, "id")?;
    ensure_project_exists(db, project_id)?;

    match menu_repo::get_menu_item(db, project_id, id).map_err(doc_db_err)? {
        None => return Err(doc_err(-32602, format!("目录不存在: {id}"))),
        Some(item) if item.menu_type != "apiDetailFolder" => {
            return Err(doc_err(-32602, format!("菜单项 {id} 不是接口目录")));
        }
        Some(_) => {}
    }

    let new_name = args
        .get("name")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    // 只有显式给出 parentId（含 null）才移动位置
    let parent_specified = args.get("parentId").is_some();
    let target_parent = if parent_specified {
        doc_optional_parent(db, project_id, args, &["apiDetailFolder"])?
    } else {
        None
    };

    {
        let mut guard = db
            .0
            .lock()
            .map_err(|_| doc_err(-32603, "数据库锁不可用"))?;
        let tx = guard.transaction().map_err(doc_db_err)?;

        if parent_specified {
            // 防环：目标父级不能是自身，也不能是自己的子孙
            if target_parent.as_deref() == Some(id) {
                return Err(doc_err(-32602, "不能把目录移动到自身之下"));
            }
            if let Some(pid) = target_parent.as_deref() {
                if menu_repo::is_descendant_of(&tx, project_id, id, pid).map_err(doc_db_err)? {
                    return Err(doc_err(-32602, "不能把目录移动到自己的子孙目录之下"));
                }
            }
            menu_repo::set_menu_item_parent(&tx, project_id, id, target_parent.as_deref())
                .map_err(doc_db_err)?;
        }
        if let Some(name) = new_name {
            let updates = serde_json::json!({ "name": name });
            menu_repo::update_menu_item_conn(&tx, project_id, id, &updates).map_err(doc_db_err)?;
        }
        tx.commit().map_err(doc_db_err)?;
    }

    let item = menu_repo::get_menu_item(db, project_id, id).map_err(doc_db_err)?;
    Ok(serde_json::json!({
        "id": id,
        "parentId": item.as_ref().and_then(|i| i.parent_id.clone()),
        "name": item.map(|i| i.name).unwrap_or_default(),
    }))
}

fn doc_save_schema(
    db: &Db,
    args: &serde_json::Value,
) -> Result<serde_json::Value, JsonRpcError> {
    let project_id = doc_str_arg(args, "projectId")?;
    let name = doc_str_arg(args, "name")?;
    let schema = args
        .get("jsonSchema")
        .ok_or_else(|| doc_err(-32602, "缺少参数 jsonSchema"))?;
    ensure_project_exists(db, project_id)?;
    let parent_id = doc_optional_parent(db, project_id, args, &DOC_FOLDER_TYPES)?;

    let items = menu_repo::list_menu_items(db, project_id).map_err(doc_db_err)?;
    let existing = items
        .iter()
        .find(|i| i.menu_type == "apiSchema" && i.name == name);

    let mut data = serde_json::json!({ "jsonSchema": schema });
    // 保留来源维度，重复导入时仍能命中同一条
    if let Some(source) = existing
        .and_then(|i| i.data_json.as_ref())
        .and_then(|v| v.get("source"))
    {
        data["source"] = source.clone();
    }

    let (id, created) = match existing {
        Some(item) => {
            let updates = serde_json::json!({ "name": name, "data": data });
            menu_repo::update_menu_item(db, project_id, &item.id, &updates)
                .map_err(doc_db_err)?;
            (item.id.clone(), false)
        }
        None => {
            let id = Uuid::new_v4().to_string();
            let max = menu_repo::get_max_sort_order(db, project_id).map_err(doc_db_err)?;
            let payload = CreateMenuItemPayload {
                id: id.clone(),
                parent_id,
                name: name.to_string(),
                menu_type: "apiSchema".to_string(),
                data_json: Some(data),
                run_tab_json: None,
                sort_order: Some(max + 1),
            };
            menu_repo::create_menu_item(db, project_id, &payload).map_err(doc_db_err)?;
            (id, true)
        }
    };

    Ok(serde_json::json!({ "id": id, "created": created }))
}

fn doc_default_env_config() -> serde_json::Value {
    serde_json::json!({
        "globalParameters": { "header": [], "cookie": [], "query": [], "body": [] },
        "legacyGlobalParameters": [],
        "globalVariables": [],
        "environments": [],
    })
}

/// 按 `name` 合并：同名替换（保留原 id），异名追加，未提及的条目原样保留。
fn doc_merge_by_name(
    existing: &[serde_json::Value],
    incoming: &[serde_json::Value],
    normalize: impl Fn(&serde_json::Value, Option<&serde_json::Value>) -> serde_json::Value,
) -> Vec<serde_json::Value> {
    let mut out: Vec<serde_json::Value> = existing.to_vec();
    for item in incoming {
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
        match out
            .iter()
            .position(|e| e.get("name").and_then(|v| v.as_str()) == Some(name))
        {
            Some(pos) => {
                let prev = out[pos].clone();
                out[pos] = normalize(item, Some(&prev));
            }
            None => out.push(normalize(item, None)),
        }
    }
    out
}

fn doc_normalize_global_variable(
    raw: &serde_json::Value,
    prev: Option<&serde_json::Value>,
) -> serde_json::Value {
    let id = raw
        .get("id")
        .and_then(|v| v.as_str())
        .or_else(|| prev.and_then(|p| p.get("id")).and_then(|v| v.as_str()))
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let enable = raw
        .get("enable")
        .and_then(|v| v.as_bool())
        .or_else(|| prev.and_then(|p| p.get("enable")).and_then(|v| v.as_bool()))
        .unwrap_or(true);
    serde_json::json!({
        "id": id,
        "name": raw.get("name").and_then(|v| v.as_str()).unwrap_or(""),
        "value": raw.get("value").and_then(|v| v.as_str()).unwrap_or(""),
        "enable": enable,
    })
}

/// 环境条目按字段覆盖：未提供的字段（如 agentUrl）沿用原值。
fn doc_normalize_environment(
    raw: &serde_json::Value,
    prev: Option<&serde_json::Value>,
) -> serde_json::Value {
    let mut out = match prev {
        Some(p) if p.is_object() => p.clone(),
        _ => serde_json::json!({}),
    };
    let id = raw
        .get("id")
        .and_then(|v| v.as_str())
        .or_else(|| prev.and_then(|p| p.get("id")).and_then(|v| v.as_str()))
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    out["id"] = serde_json::json!(id);
    out["name"] = serde_json::json!(raw.get("name").and_then(|v| v.as_str()).unwrap_or(""));
    if let Some(url) = raw.get("url").and_then(|v| v.as_str()) {
        out["url"] = serde_json::json!(url);
    } else if out.get("url").is_none() {
        out["url"] = serde_json::json!("");
    }
    if let Some(base_urls) = raw.get("baseUrls").and_then(|v| v.as_array()) {
        out["baseUrls"] = serde_json::Value::Array(
            base_urls
                .iter()
                .map(|b| {
                    let mut item = b.clone();
                    if item.is_object() && item.get("id").and_then(|v| v.as_str()).is_none() {
                        item["id"] = serde_json::json!(Uuid::new_v4().to_string());
                    }
                    item
                })
                .collect(),
        );
    }
    if let Some(vars) = raw.get("variables").and_then(|v| v.as_array()) {
        out["variables"] = serde_json::Value::Array(
            vars.iter()
                .map(|v| {
                    let mut item = v.clone();
                    if item.is_object() && item.get("id").and_then(|v| v.as_str()).is_none() {
                        item["id"] = serde_json::json!(Uuid::new_v4().to_string());
                    }
                    item
                })
                .collect(),
        );
    }
    if let Some(parameters) = raw.get("parameters") {
        out["parameters"] = parameters.clone();
    }
    out
}

fn doc_save_environment(
    db: &Db,
    args: &serde_json::Value,
) -> Result<serde_json::Value, JsonRpcError> {
    let project_id = doc_str_arg(args, "projectId")?;
    ensure_project_exists(db, project_id)?;

    // 入参先做一次名称校验，避免把空名条目并进配置
    for key in ["globalVariables", "environments"] {
        if let Some(arr) = args.get(key).and_then(|v| v.as_array()) {
            if arr
                .iter()
                .any(|item| item.get("name").and_then(|v| v.as_str()).map(str::trim).unwrap_or("").is_empty())
            {
                return Err(doc_err(-32602, format!("{key} 中存在缺少 name 的条目")));
            }
        }
    }

    let mut config = {
        let conn = db
            .0
            .lock()
            .map_err(|_| doc_err(-32603, "数据库锁不可用"))?;
        let raw: Option<String> = conn
            .query_row(
                "SELECT value FROM meta WHERE project_id = ?1 AND key = 'environmentConfig'",
                params![project_id],
                |row| row.get(0),
            )
            .ok();
        raw.and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .filter(|v| v.is_object())
            .unwrap_or_else(doc_default_env_config)
    };

    if let Some(incoming) = args.get("globalVariables").and_then(|v| v.as_array()) {
        let existing = config
            .get("globalVariables")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        config["globalVariables"] = serde_json::Value::Array(doc_merge_by_name(
            &existing,
            incoming,
            doc_normalize_global_variable,
        ));
    }

    if let Some(incoming) = args.get("environments").and_then(|v| v.as_array()) {
        let existing = config
            .get("environments")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        config["environments"] =
            serde_json::Value::Array(doc_merge_by_name(&existing, incoming, doc_normalize_environment));
    }

    let config: ProjectEnvironmentConfig = serde_json::from_value(config)
        .map_err(|e| doc_err(-32603, format!("环境配置格式错误: {e}")))?;
    menu_repo::save_project_environments(db, project_id, &config).map_err(doc_db_err)?;

    Ok(serde_json::json!({
        "environments": config.environments.len(),
        "globalVariables": config.global_variables.len(),
    }))
}

fn doc_call_result(result: Result<serde_json::Value, JsonRpcError>) -> Result<ToolResult, JsonRpcError> {
    let value = result?;
    Ok(ToolResult {
        content: vec![ToolResultContent {
            content_type: "text".to_string(),
            text: serde_json::to_string_pretty(&value).unwrap_or_default(),
        }],
        is_error: None,
    })
}

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
            let mode = arguments.get("mode").and_then(|v| v.as_str()).unwrap_or("full");
            if mode != "full" && mode != "brief" {
                return Err(JsonRpcError {
                    code: -32602,
                    message: format!("Invalid mode '{}': must be 'full' or 'brief'", mode),
                    data: None,
                });
            }
            let query = arguments.get("query").and_then(|v| v.as_str());

            match crate::services::prompt_builder::generate_flow_prompt(db, project_id, mode, query) {
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
        "api-test.search_apis" => {
            let project_id = arguments.get("projectId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing projectId".to_string(),
                    data: None,
                })?;
            let query = arguments.get("query").and_then(|v| v.as_str());
            let query_lower = query.map(|q| q.to_lowercase());

            let items = menu_repo::list_menu_items(db, project_id)
                .map_err(|e| JsonRpcError {
                    code: -32603,
                    message: format!("Query error: {}", e),
                    data: None,
                })?;

            let mut results: Vec<serde_json::Value> = Vec::new();
            for item in items.iter().filter(|i| i.menu_type == "apiDetail" && i.data_json.is_some()) {
                let d = item.data_json.as_ref();
                let method = d.and_then(|v| v.get("method")).and_then(|v| v.as_str()).unwrap_or("GET").to_uppercase();
                let path = d.and_then(|v| v.get("path")).and_then(|v| v.as_str()).unwrap_or("");
                let desc = d.and_then(|v| v.get("description").or_else(|| v.get("desc"))).and_then(|v| v.as_str()).unwrap_or("");

                if let Some(ql) = &query_lower {
                    let name = item.name.to_lowercase();
                    let path_l = path.to_lowercase();
                    let method_l = method.to_lowercase();
                    if !name.contains(ql) && !path_l.contains(ql) && !method_l.contains(ql) { continue; }
                }

                results.push(serde_json::json!({
                    "id": item.id,
                    "menuItemId": item.id,
                    "name": item.name,
                    "method": method,
                    "path": path,
                    "description": desc,
                }));
            }

            Ok(ToolResult {
                content: vec![ToolResultContent {
                    content_type: "text".to_string(),
                    text: serde_json::to_string_pretty(&results).unwrap_or_default(),
                }],
                is_error: None,
            })
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
            let environment_id = arguments.get("environmentId").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string());
            // 传了非空 environmentId 时必须存在于项目环境配置中
            if let Some(ref env_id) = environment_id {
                if !environment_exists(db, project_id, env_id) {
                    return Err(JsonRpcError {
                        code: -32602,
                        message: format!("environmentId '{}' does not exist in project", env_id),
                        data: None,
                    });
                }
            }
            let fail_fast = arguments.get("failFast").and_then(|v| v.as_bool()).unwrap_or(true);
            // 非布尔值（字符串/数字）会导致静默按 true 处理，显式报错避免误导
            if arguments.get("failFast").is_some() && arguments.get("failFast").and_then(|v| v.as_bool()).is_none() {
                return Err(JsonRpcError {
                    code: -32602,
                    message: "failFast must be a JSON boolean".to_string(),
                    data: None,
                });
            }
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
                environment_id: arguments.get("environmentId").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string()),
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

            // 不存在时明确报错，避免模型误以为删除成功
            match test_repo::get_task(db, task_id) {
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
                Ok(Some(_)) => {}
            }
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
                .unwrap_or(20).clamp(1, 100) as i32;

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

            match test_repo::get_execution(db, execution_id) {
                Ok(None) => return Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: "Execution not found".to_string(),
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
                Ok(Some(_)) => {}
            }
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

            // 2. 检查是否 flow graph 任务：MCP 无法在后端执行流程图
            match flow_repo::load_flow_graph(db, task_id) {
                Ok(Some(graph)) => {
                    let has_nodes = graph.get("nodes").and_then(|v| v.as_array()).map(|a| !a.is_empty()).unwrap_or(false);
                    if has_nodes {
                        return Ok(ToolResult {
                            content: vec![ToolResultContent {
                                content_type: "text".to_string(),
                                text: "该任务包含流程图（flow graph），MCP 的 run_task 仅支持旧版线性步骤任务，无法在后端执行流程图。请在应用前端打开该任务运行。".to_string(),
                            }],
                            is_error: Some(true),
                        });
                    }
                }
                _ => {}
            }
            // 检查是否有可执行步骤
            let steps = match test_repo::list_steps(db, task_id) {
                Ok(s) => s,
                Err(e) => return Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: format!("Error listing steps: {}", e),
                    }],
                    is_error: Some(true),
                }),
            };
            if steps.is_empty() {
                return Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: "任务没有可执行步骤（既无流程图也无步骤），无法运行。请先用 create_task_with_flow 创建带流程的任务，再在前端运行。".to_string(),
                    }],
                    is_error: Some(true),
                });
            }

            // 3. Parse provided variables
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
            let environment_id = arguments.get("environmentId").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string());
            // 传了非空 environmentId 时必须存在于项目环境配置中
            if let Some(ref env_id) = environment_id {
                if !environment_exists(db, project_id, env_id) {
                    return Err(JsonRpcError {
                        code: -32602,
                        message: format!("environmentId '{}' does not exist in project", env_id),
                        data: None,
                    });
                }
            }
            let fail_fast = arguments.get("failFast").and_then(|v| v.as_bool()).unwrap_or(true);
            // 非布尔值（字符串/数字）会导致静默按 true 处理，显式报错避免误导
            if arguments.get("failFast").is_some() && arguments.get("failFast").and_then(|v| v.as_bool()).is_none() {
                return Err(JsonRpcError {
                    code: -32602,
                    message: "failFast must be a JSON boolean".to_string(),
                    data: None,
                });
            }

            // 深度校验 flow graph：结构 + start/end + id 唯一 + 边引用 + menuItemId
            let (errors, warnings, _, _) = validate_flow_graph(graph_json, Some(project_id), db);
            if !errors.is_empty() {
                return Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&serde_json::json!({
                            "valid": false,
                            "errors": errors,
                            "warnings": warnings,
                        })).unwrap_or_default(),
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
                environment_id,
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
            match flow_repo::save_flow_graph(db, &task.id, graph_json) {

                Ok(_) => {
                    let result = serde_json::json!({
                        "task": task,
                        "flowGraph": graph_json,
                        "valid": true,
                        "warnings": warnings,
                    });
                    Ok(ToolResult {
                        content: vec![ToolResultContent {
                            content_type: "text".to_string(),
                            text: serde_json::to_string_pretty(&result).unwrap_or_default(),
                        }],
                        is_error: None,
                    })
                }
                Err(e) => {
                    // 保存图失败：回滚刚创建的任务，避免留下孤儿任务
                    let _ = test_repo::delete_task(db, &task.id);
                    Ok(ToolResult {
                        content: vec![ToolResultContent {
                            content_type: "text".to_string(),
                            text: format!("Error saving flow graph: {}（任务已回滚删除）", e),
                        }],
                        is_error: Some(true),
                    })
                }
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

            // 校验任务存在并获取项目 id
            let project_id = match test_repo::get_task(db, task_id) {
                Ok(Some(t)) => t.project_id,
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

            // 与 create_task_with_flow 一致：深度校验后再保存
            let (errors, warnings, _, _) = validate_flow_graph(graph_json, Some(&project_id), db);
            if !errors.is_empty() {
                return Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&serde_json::json!({
                            "valid": false,
                            "errors": errors,
                            "warnings": warnings,
                        })).unwrap_or_default(),
                    }],
                    is_error: Some(true),
                });
            }

            match flow_repo::save_flow_graph(db, task_id, graph_json) {
                Ok(_) => Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string(&serde_json::json!({
                            "ok": true,
                            "valid": true,
                            "warnings": warnings,
                        })).unwrap_or_default(),
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

            // 先确认任务存在，区分「任务不存在」与「任务无图」
            match test_repo::get_task(db, task_id) {
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
                Ok(Some(_)) => {}
            }

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
                        text: "null".to_string(),
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
        "api-test.delete_flow_graph" => {
            let task_id = arguments.get("taskId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| JsonRpcError {
                    code: -32602,
                    message: "Missing taskId".to_string(),
                    data: None,
                })?;

            match flow_repo::load_flow_graph(db, task_id) {
                Ok(None) => return Ok(ToolResult {
                    content: vec![ToolResultContent {
                        content_type: "text".to_string(),
                        text: "Flow graph not found for this task".to_string(),
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
                Ok(Some(_)) => {}
            }
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

            let (errors, warnings, node_count, edge_count) = validate_flow_graph(graph_json, project_id, db);
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
        "api-doc.upsert_endpoint" => doc_call_result(doc_upsert_endpoint(db, arguments)),
        "api-doc.delete_endpoint" => doc_call_result(doc_delete_endpoint(db, arguments)),
        "api-doc.create_folder" => doc_call_result(doc_create_folder(db, arguments)),
        "api-doc.move_folder" => doc_call_result(doc_move_folder(db, arguments)),
        "api-doc.save_schema" => doc_call_result(doc_save_schema(db, arguments)),
        "api-doc.save_environment" => doc_call_result(doc_save_environment(db, arguments)),
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
    headers: HeaderMap,
    Json(request): Json<JsonRpcRequest>,
) -> axum::response::Response {
    // JSON-RPC 通知（notifications/*）不应有响应体，返回 202 空响应
    if request.method.starts_with("notifications/") {
        return axum::http::StatusCode::ACCEPTED.into_response();
    }

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
        "ping" => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id.clone(),
            result: Some(serde_json::json!({})),
            error: None,
        },
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
                    // 文档写工具始终要求个人令牌；绑非回环地址时全部工具都要
                    let auth = if state.require_auth || params.name.starts_with(DOC_TOOL_PREFIX) {
                        authorize_doc_tool(&state.db, &headers)
                    } else {
                        Ok(())
                    };
                    if let Err(e) = auth {
                        return Json(JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id: request.id.clone(),
                            result: None,
                            error: Some(e),
                        })
                        .into_response();
                    }
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

    Json(response).into_response()
}

pub async fn start_mcp_server(db: Arc<Db>, handle: Arc<McpServerHandle>, preferred_port: u16, host: &str) {
    // 绑 0.0.0.0 时局域网可达，令牌校验扩到全部工具（见 McpServerState::require_auth）
    let require_auth = requires_auth_for_host(host);
    let state = Arc::new(McpServerState {
        db,
        tools: get_tool_definitions(),
        require_auth,
    });

    let app = Router::new()
        .route("/", post(handle_mcp_request))
        .with_state(state);

    let listener = match tokio::net::TcpListener::bind(format!("{}:{}", host, preferred_port)).await {
        Ok(l) => l,
        Err(_) => {
            // Try random port
            tokio::net::TcpListener::bind(format!("{}:0", host)).await.expect("Failed to bind MCP server")
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
        assert_eq!(tools.len(), 25, "Expected 25 MCP tools, got {}", tools.len());
    }

    #[test]
    fn doc_parameters_flat_array_is_grouped_by_in() {
        let raw = serde_json::json!([
            {"name": "id", "in": "path", "type": "integer", "required": true},
            {"name": "page", "in": "query", "type": "integer"},
            {"name": "X-Trace", "type": "string"}
        ]);
        let out = doc_normalize_parameters(&raw);
        assert_eq!(out["path"].as_array().unwrap().len(), 1);
        assert_eq!(out["query"].as_array().unwrap().len(), 2, "缺 in 的归 query");
        assert!(out.get("header").is_none());
    }

    #[test]
    fn doc_request_body_accepts_content_type_alias() {
        let body = doc_normalize_request_body(&serde_json::json!({"contentType": "json"}));
        assert_eq!(body["type"], "json");
    }

    #[test]
    fn auth_required_only_for_non_loopback_host() {
        assert!(!requires_auth_for_host("127.0.0.1"));
        assert!(!requires_auth_for_host("localhost"));
        assert!(!requires_auth_for_host("::1"));
        assert!(requires_auth_for_host("0.0.0.0"));
        assert!(requires_auth_for_host("192.168.1.10"));
    }

    #[test]
    fn test_doc_tools_defined() {
        let tools = get_tool_definitions();
        let names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
        for name in [
            "api-doc.upsert_endpoint",
            "api-doc.delete_endpoint",
            "api-doc.create_folder",
            "api-doc.move_folder",
            "api-doc.save_schema",
            "api-doc.save_environment",
        ] {
            assert!(names.contains(&name), "missing doc tool: {name}");
        }
        let upsert = tools
            .iter()
            .find(|t| t.name == "api-doc.upsert_endpoint")
            .unwrap();
        let required: Vec<&str> = upsert
            .input_schema
            .get("required")
            .unwrap()
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        for field in ["projectId", "method", "path", "name"] {
            assert!(required.contains(&field), "upsert 应要求 {field}");
        }
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

    use rusqlite::Connection;
    use std::sync::Mutex;
    fn setup_db() -> Arc<Db> {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE menu_items (project_id TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT, name TEXT NOT NULL, type TEXT NOT NULL, data_json TEXT, run_tab_json TEXT, sort_order INTEGER, created_at TEXT, updated_at TEXT);
            CREATE TABLE meta (project_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (project_id, key));
            CREATE TABLE test_tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', folder_id TEXT, environment_id TEXT, environment_json TEXT, variables_json TEXT, status TEXT NOT NULL DEFAULT 'idle', fail_fast INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE test_folders (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE test_flow_graphs (id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE, graph_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE personal_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE recycle_items (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, catalog_type TEXT NOT NULL, deleted_item_json TEXT NOT NULL, creator_json TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);
            ",
        )
        .unwrap();

        conn.execute(
            "INSERT INTO projects (id, name, owner_id, created_at) VALUES ('proj-1', '测试项目', 'user-1', '2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
                    r#"INSERT INTO menu_items (project_id, id, parent_id, name, type, data_json, run_tab_json, sort_order, created_at, updated_at) VALUES ('proj-1', 'api-login', NULL, '用户登录', 'apiDetail', '{"method":"POST","path":"/api/login","description":"登录接口"}', NULL, 1, '2026-01-01', '2026-01-01')"#,
                    [],
                )
                .unwrap();
        conn.execute(
                    r#"INSERT INTO menu_items (project_id, id, parent_id, name, type, data_json, run_tab_json, sort_order, created_at, updated_at) VALUES ('proj-1', 'api-user', NULL, '获取用户信息', 'apiDetail', '{"method":"GET","path":"/api/user/{id}","description":"用户详情"}', NULL, 2, '2026-01-01', '2026-01-01')"#,
                    [],
                )
                .unwrap();

        let env_config = serde_json::json!({
            "globalParameters": [],
            "legacyGlobalParameters": [],
            "globalVariables": [{"name": "apiHost", "value": "http://localhost:8080", "enable": true}],
            "environments": [
                {
                    "id": "env-test",
                    "name": "测试环境",
                    "baseUrls": [{"id": "b1", "url": "http://localhost:8080", "enable": true}],
                    "agentUrl": "http://localhost:19876",
                    "variables": [{"id": "v1", "name": "token", "value": "abc", "enable": true}]
                }
            ]
        });
        conn.execute(
            "INSERT INTO meta (project_id, key, value) VALUES ('proj-1', 'environmentConfig', ?1)",
            [env_config.to_string()],
        )
        .unwrap();

        Arc::new(Db(Mutex::new(conn)))
    }

    fn call(db: &Db, name: &str, args: serde_json::Value) -> ToolResult {
        tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(execute_tool(name, &args, db))
            .unwrap()
    }

    fn call_json(db: &Db, name: &str, args: serde_json::Value) -> serde_json::Value {
        let result = call(db, name, args);
        serde_json::from_str(&result.content[0].text).unwrap()
    }

    fn call_err(db: &Db, name: &str, args: serde_json::Value) -> JsonRpcError {
        tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(execute_tool(name, &args, db))
            .unwrap_err()
    }

    fn count_api_detail(db: &Db, path: &str) -> i64 {
        db.0.lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM menu_items WHERE project_id = 'proj-1' AND type = 'apiDetail'
                   AND json_extract(data_json, '$.path') = ?1",
                params![path],
                |r| r.get(0),
            )
            .unwrap()
    }

    fn api_data(db: &Db, id: &str) -> serde_json::Value {
        let conn = db.0.lock().unwrap();
        let raw: String = conn
            .query_row(
                "SELECT data_json FROM menu_items WHERE project_id = 'proj-1' AND id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    fn env_config(db: &Db) -> serde_json::Value {
        let conn = db.0.lock().unwrap();
        let raw: String = conn
            .query_row(
                "SELECT value FROM meta WHERE project_id = 'proj-1' AND key = 'environmentConfig'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    fn valid_graph() -> serde_json::Value {
        serde_json::json!({
            "nodes": [
                {"id": "start-1", "type": "start", "position": {"x": 0, "y": 0}, "data": {"label": "开始", "enabled": true}},
                {"id": "http-login", "type": "httpRequest", "position": {"x": 0, "y": 0}, "data": {"label": "登录", "enabled": true, "menuItemId": "api-login", "assertions": [{"type": "status", "operator": "equals", "expected": 200}]}},
                {"id": "end-1", "type": "end", "position": {"x": 0, "y": 0}, "data": {"label": "完成", "enabled": true}}
            ],
            "edges": [
                {"id": "e1", "source": "start-1", "target": "http-login", "sourceHandle": "out", "targetHandle": "in"},
                {"id": "e2", "source": "http-login", "target": "end-1", "sourceHandle": "out", "targetHandle": "in"}
            ]
        })
    }

#[test]
    fn search_apis_filters_by_keyword() {
        let db = setup_db();

        let all = call(&db, "api-test.search_apis", serde_json::json!({"projectId": "proj-1"}));
        let all_text = &all.content[0].text;
        assert!(all_text.contains("api-login") && all_text.contains("api-user"), "should list all apis: {}", all_text);

        let filtered = call(&db, "api-test.search_apis", serde_json::json!({"projectId": "proj-1", "query": "user"}));
        let filtered_text = &filtered.content[0].text;
        assert!(filtered_text.contains("api-user") && !filtered_text.contains("api-login"), "should filter by keyword: {}", filtered_text);
    }

#[test]
    fn flow_prompt_full_contains_env_and_parallel() {
        let db = setup_db();
        let res = call(&db, "api-test.get_flow_prompt", serde_json::json!({"projectId": "proj-1"}));
        let text = &res.content[0].text;

        assert!(text.contains("menuItemId: `api-login`"), "should contain api docs");
        assert!(text.contains("id: `env-test`"), "should contain environment id");
        assert!(text.contains("全局变量：apiHost"), "should contain global variables");
        assert!(text.contains("并行分支数（>=2）"), "parallel description should be updated");
    }

#[test]
    fn flow_prompt_brief_lists_catalog_only() {
        let db = setup_db();
        let res = call(&db, "api-test.get_flow_prompt", serde_json::json!({"projectId": "proj-1", "mode": "brief"}));
        let text = &res.content[0].text;
        assert!(text.contains("menuItemId: `api-login` | 用户登录 | POST /api/login"), "brief catalog format: {}", text);
        assert!(!text.contains("请求体参数"), "brief mode should not include body details");
    }

#[test]
    fn flow_prompt_full_filters_by_query() {
        let db = setup_db();
        let res = call(&db, "api-test.get_flow_prompt", serde_json::json!({"projectId": "proj-1", "query": "login"}));
        let text = &res.content[0].text;
        assert!(text.contains("api-login"), "should include login api");
        assert!(!text.contains("api-user"), "should exclude user api");
    }

#[test]
    fn create_task_with_flow_rejects_invalid_graph() {
        let db = setup_db();
        let bad_graph = serde_json::json!({
            "nodes": [
                {"id": "http-x", "type": "httpRequest", "position": {"x": 0, "y": 0}, "data": {"label": "X", "enabled": true, "menuItemId": ""}}
            ],
            "edges": []
        });
        let res = call(&db, "api-test.create_task_with_flow", serde_json::json!({
            "projectId": "proj-1",
            "name": "坏图任务",
            "graphJson": bad_graph
        }));
        assert_eq!(res.is_error, Some(true), "invalid graph should be rejected: {}", res.content[0].text);

        let tasks = call(&db, "api-test.list_tasks", serde_json::json!({"projectId": "proj-1"}));
        assert_eq!(tasks.content[0].text, "[]", "no task should be created");
    }

#[test]
    fn create_task_with_flow_saves_valid_graph_with_environment() {
        let db = setup_db();
        let res = call(&db, "api-test.create_task_with_flow", serde_json::json!({
            "projectId": "proj-1",
            "name": "登录流程",
            "description": "冒烟测试",
            "environmentId": "env-test",
            "failFast": false,
            "graphJson": valid_graph()
        }));
        assert_eq!(res.is_error, None, "valid graph should be created: {}", res.content[0].text);
        let text = &res.content[0].text;
        assert!(text.contains("env-test"), "environmentId should be bound: {}", text);
        assert!(text.contains("api-login"), "flow graph should be saved: {}", text);

        let tasks = call(&db, "api-test.list_tasks", serde_json::json!({"projectId": "proj-1"}));
        assert!(tasks.content[0].text.contains("登录流程"), "task should exist");
    }

#[test]
    fn validate_flow_returns_valid() {
        let db = setup_db();
        let res = call(&db, "api-test.validate_flow", serde_json::json!({
            "projectId": "proj-1",
            "graphJson": valid_graph()
        }));
        assert!(res.content[0].text.contains("\"valid\": true"), "valid graph should pass: {}", res.content[0].text);
    }
    #[test]
    fn search_apis_returns_menu_item_id() {
        let db = setup_db();
        let res = call(&db, "api-test.search_apis", serde_json::json!({"projectId": "proj-1"}));
        assert!(res.content[0].text.contains("\"menuItemId\": \"api-login\""), "{}", res.content[0].text);
    }

    #[test]
    #[test]
    fn create_task_with_flow_returns_warnings_on_success() {
        let db = setup_db();
        // 孤立节点产生 warning，但创建仍成功且 warning 必须返回给 AI
        let mut graph = valid_graph();
        if let Some(nodes) = graph.get_mut("nodes").and_then(|v| v.as_array_mut()) {
            nodes.push(serde_json::json!({"id": "sv-1", "type": "setVariable", "position": {"x": 0, "y": 0}, "data": {"label": "孤立变量", "enabled": true, "assignments": []}}));
        }
        let res = call(&db, "api-test.create_task_with_flow", serde_json::json!({
            "projectId": "proj-1",
            "name": "warn任务",
            "graphJson": graph
        }));
        assert_eq!(res.is_error, None, "{}", res.content[0].text);
        assert!(res.content[0].text.contains("\"warnings\""), "success response should include warnings: {}", res.content[0].text);
    }


    #[test]
    fn save_flow_graph_rejects_invalid() {
        let db = setup_db();
        let created = call(&db, "api-test.create_task_with_flow", serde_json::json!({
            "projectId": "proj-1",
            "name": "好任务",
            "graphJson": valid_graph()
        }));
        let v: serde_json::Value = serde_json::from_str(&created.content[0].text).unwrap();
        let task_id = v["task"]["id"].as_str().unwrap().to_string();
        let bad = serde_json::json!({
            "nodes": [{"id": "x", "type": "httpRequest", "position": {"x": 0, "y": 0}, "data": {"menuItemId": "api-login"}}],
            "edges": []
        });
        let res = call(&db, "api-test.save_flow_graph", serde_json::json!({"taskId": task_id, "graphJson": bad}));
        assert_eq!(res.is_error, Some(true), "invalid graph should be rejected: {}", res.content[0].text);
    }

    #[test]
    fn run_task_rejects_flow_graph_task() {
        let db = setup_db();
        let created = call(&db, "api-test.create_task_with_flow", serde_json::json!({
            "projectId": "proj-1",
            "name": "流程任务",
            "graphJson": valid_graph()
        }));
        let v: serde_json::Value = serde_json::from_str(&created.content[0].text).unwrap();
        let task_id = v["task"]["id"].as_str().unwrap().to_string();
        let res = call(&db, "api-test.run_task", serde_json::json!({"taskId": task_id}));
        assert_eq!(res.is_error, Some(true), "flow task should be rejected, not fake-passed");
        assert!(res.content[0].text.contains("无法在后端执行流程图"), "{}", res.content[0].text);
    }

    #[test]
    fn validate_flow_rejects_multiple_starts() {
        let db = setup_db();
        let mut graph = valid_graph();
        if let Some(nodes) = graph.get_mut("nodes").and_then(|v| v.as_array_mut()) {
            nodes.push(serde_json::json!({"id": "start-2", "type": "start", "position": {"x": 0, "y": 0}, "data": {"label": "开始2", "enabled": true}}));
        }
        let res = call(&db, "api-test.validate_flow", serde_json::json!({"projectId": "proj-1", "graphJson": graph}));
        assert!(res.content[0].text.contains("恰好 1 个"), "{}", res.content[0].text);
    }

    #[tokio::test]
    async fn protocol_handles_ping_and_notifications() {
        let db = setup_db();
        let state = Arc::new(McpServerState { db: db.clone(), tools: get_tool_definitions(), require_auth: false });
        let req1 = JsonRpcRequest { jsonrpc: "2.0".to_string(), id: Some(serde_json::json!(1)), method: "ping".to_string(), params: serde_json::json!({}) };
        let resp1 = handle_mcp_request(AxumState(state.clone()), HeaderMap::new(), Json(req1)).await;
        let body1 = axum::body::to_bytes(resp1.into_body(), 1024 * 1024).await.unwrap();
        let v1: serde_json::Value = serde_json::from_slice(&body1).unwrap();
        assert!(v1.get("result").is_some(), "ping should return a result: {}", v1);
        assert!(v1.get("error").is_none(), "ping should not error");
        let req2 = JsonRpcRequest { jsonrpc: "2.0".to_string(), id: None, method: "notifications/initialized".to_string(), params: serde_json::json!({}) };
        let resp2 = handle_mcp_request(AxumState(state.clone()), HeaderMap::new(), Json(req2)).await;
        assert_eq!(resp2.status(), axum::http::StatusCode::ACCEPTED, "notification should return 202 Accepted");
        let body2 = axum::body::to_bytes(resp2.into_body(), 1024 * 1024).await.unwrap();
        assert!(body2.is_empty(), "notification body should be empty");
    }
    #[test]
    fn create_task_with_flow_rejects_missing_menu_item() {
        let db = setup_db();
        let mut graph = valid_graph();
        if let Some(nodes) = graph.get_mut("nodes").and_then(|v| v.as_array_mut()) {
            if let Some(n) = nodes.iter_mut().find(|n| n.get("type").and_then(|t| t.as_str()) == Some("httpRequest")) {
                n.as_object_mut().unwrap().insert("data".to_string(), serde_json::json!({"label": "登录", "enabled": true, "menuItemId": "not-exist-id"}));
            }
        }
        let res = call(&db, "api-test.create_task_with_flow", serde_json::json!({
            "projectId": "proj-1",
            "name": "坏引用任务",
            "graphJson": graph
        }));
        assert_eq!(res.is_error, Some(true), "missing menuItemId should reject: {}", res.content[0].text);
        let tasks = call(&db, "api-test.list_tasks", serde_json::json!({"projectId": "proj-1"}));
        assert_eq!(tasks.content[0].text, "[]", "no task should be created");
    }

    #[test]
    fn validate_flow_rejects_invalid_handle() {
        let db = setup_db();
        let mut graph = valid_graph();
        if let Some(edges) = graph.get_mut("edges").and_then(|v| v.as_array_mut()) {
            if let Some(e) = edges.first_mut() {
                e.as_object_mut().unwrap().insert("sourceHandle".to_string(), serde_json::json!("zzz"));
            }
        }
        let res = call(&db, "api-test.validate_flow", serde_json::json!({"projectId": "proj-1", "graphJson": graph}));
        assert!(res.content[0].text.contains("合法输出口"), "{}", res.content[0].text);
    }
    #[test]
    fn set_variables_works_on_fresh_task() {
        let db = setup_db();
        let created = call(&db, "api-test.create_task_with_flow", serde_json::json!({
            "projectId": "proj-1",
            "name": "变量任务",
            "graphJson": valid_graph()
        }));
        let v: serde_json::Value = serde_json::from_str(&created.content[0].text).unwrap();
        let task_id = v["task"]["id"].as_str().unwrap().to_string();
        // 全新任务 variables_json 为 NULL，set_variables 不应报错
        let res = call(&db, "api-test.set_variables", serde_json::json!({"taskId": task_id, "variables": {"token": "abc", "env": "prod"}}));
        assert_eq!(res.is_error, None, "set_variables on fresh task should succeed: {}", res.content[0].text);
        let got = call(&db, "api-test.get_variables", serde_json::json!({"taskId": task_id}));
        assert!(got.content[0].text.contains("\"token\"") && got.content[0].text.contains("\"env\""), "{}", got.content[0].text);
    }

    #[tokio::test]
    async fn set_variables_concurrent_no_loss() {
        let db = setup_db();
        let create_args = serde_json::json!({
            "projectId": "proj-1",
            "name": "并发变量任务",
            "graphJson": valid_graph()
        });
        let created = execute_tool("api-test.create_task_with_flow", &create_args, &db).await.unwrap();
        let v: serde_json::Value = serde_json::from_str(&created.content[0].text).unwrap();
        let task_id = v["task"]["id"].as_str().unwrap().to_string();
        let args1 = serde_json::json!({"taskId": task_id.clone(), "variables": {"a": "1"}});
        let args2 = serde_json::json!({"taskId": task_id.clone(), "variables": {"b": "2"}});
        let args3 = serde_json::json!({"taskId": task_id.clone(), "variables": {"c": "3"}});
        let (r1, r2, r3) = tokio::join!(
            execute_tool("api-test.set_variables", &args1, &db),
            execute_tool("api-test.set_variables", &args2, &db),
            execute_tool("api-test.set_variables", &args3, &db),
        );
        assert!(r1.unwrap().is_error.is_none(), "set a should succeed");
        assert!(r2.unwrap().is_error.is_none(), "set b should succeed");
        assert!(r3.unwrap().is_error.is_none(), "set c should succeed");
        let got_args = serde_json::json!({"taskId": task_id});
        let got = execute_tool("api-test.get_variables", &got_args, &db).await.unwrap();
        let text = &got.content[0].text;
        assert!(text.contains("\"a\"") && text.contains("\"b\"") && text.contains("\"c\""), "no lost updates: {}", text);
    }

    // ==================== api-doc 文档写工具 ====================

    fn doc_upsert_args(name: &str) -> serde_json::Value {
        serde_json::json!({
            "projectId": "proj-1",
            "method": "post",
            "path": "/api/v1/orders",
            "name": name,
            "status": "developing",
            "description": "创建订单",
            "tags": ["订单"],
            "parameters": {
                "query": [{"name": "page", "type": "integer", "required": true}],
                "header": [{"name": "X-Trace", "type": "weird"}]
            },
            "requestBody": {
                "type": "application/json",
                "jsonSchema": {"type": "object"},
                "required": true,
                "examples": [{"name": "示例", "value": {"a": 1}}]
            },
            "responses": [
                {"code": 200, "name": "成功"},
                {"code": 401, "name": "Unauthorized"}
            ]
        })
    }

    #[test]
    fn doc_upsert_endpoint_is_idempotent_by_method_and_path() {
        let db = setup_db();

        let first = call_json(&db, "api-doc.upsert_endpoint", doc_upsert_args("新建订单"));
        let id = first["id"].as_str().unwrap().to_string();
        assert_eq!(first["created"], serde_json::json!(true));

        // 同 method+path 再写一次：更新同一条、保留 id 与 createdAt
        let created_at = api_data(&db, &id)["createdAt"].clone();
        let second = call_json(&db, "api-doc.upsert_endpoint", doc_upsert_args("改名订单"));
        assert_eq!(second["id"].as_str().unwrap(), id, "同 (method,path) 应复用同一条");
        assert_eq!(second["created"], serde_json::json!(false));
        assert_eq!(count_api_detail(&db, "/api/v1/orders"), 1, "不应产生重复接口");

        let data = api_data(&db, &id);
        assert_eq!(data["name"], "改名订单");
        assert_eq!(data["createdAt"], created_at, "createdAt 必须保留");
        assert_eq!(data["status"], "developing");
        assert_eq!(data["parameters"]["query"][0]["type"], "integer", "合法类型不应降级");
        assert_eq!(data["parameters"]["header"][0]["type"], "string", "非法类型降级 string");
        assert_eq!(data["requestBody"]["required"], serde_json::json!(true));
        assert_eq!(data["responses"].as_array().unwrap().len(), 2, "多响应必须保留");
        assert_eq!(data["responses"][1]["code"], 401);
    }

    #[test]
    fn doc_upsert_accepts_flat_parameter_array() {
        let db = setup_db();
        let res = call_json(
            &db,
            "api-doc.upsert_endpoint",
            serde_json::json!({
                "projectId": "proj-1",
                "method": "GET",
                "path": "/api/v1/flat",
                "name": "扁平参数",
                "parameters": [
                    {"name": "id", "in": "path", "type": "integer"},
                    {"name": "q", "in": "query", "type": "string"}
                ]
            }),
        );
        let data = api_data(&db, res["id"].as_str().unwrap());
        assert_eq!(data["parameters"]["path"][0]["name"], "id");
        assert_eq!(data["parameters"]["path"][0]["type"], "integer");
        assert_eq!(data["parameters"]["query"][0]["name"], "q");
    }

    #[test]
    fn doc_upsert_endpoint_keeps_existing_when_field_omitted() {
        let db = setup_db();
        let first = call_json(&db, "api-doc.upsert_endpoint", doc_upsert_args("新建订单"));
        let id = first["id"].as_str().unwrap().to_string();

        // 只给必填字段：描述 / 参数 / 响应应沿用原值
        let second = call_json(
            &db,
            "api-doc.upsert_endpoint",
            serde_json::json!({
                "projectId": "proj-1",
                "method": "POST",
                "path": "/api/v1/orders",
                "name": "仅改名"
            }),
        );
        assert_eq!(second["id"].as_str().unwrap(), id);

        let data = api_data(&db, &id);
        assert_eq!(data["description"], "创建订单");
        assert_eq!(data["responses"].as_array().unwrap().len(), 2);
        assert_eq!(data["parameters"]["query"][0]["name"], "page");
        assert_eq!(data["status"], "developing", "未给 status 时沿用原状态");
    }

    #[test]
    fn doc_upsert_endpoint_replaces_parameters_when_provided() {
        let db = setup_db();
        let first = call_json(&db, "api-doc.upsert_endpoint", doc_upsert_args("新建订单"));
        let id = first["id"].as_str().unwrap().to_string();

        // 传入 parameters = 整体替换：只给 query 时，原 header 参数应消失
        let mut args = doc_upsert_args("改名订单");
        args["parameters"] = serde_json::json!({"query": [{"name": "size", "type": "integer"}]});
        args["tags"] = serde_json::json!(["新标签"]);
        let second = call_json(&db, "api-doc.upsert_endpoint", args);
        assert_eq!(second["id"].as_str().unwrap(), id, "同 (method,path) 应更新同一条");

        let data = api_data(&db, &id);
        let query = data["parameters"]["query"].as_array().unwrap();
        assert_eq!(query.len(), 1);
        assert_eq!(query[0]["name"], "size");
        assert!(
            data["parameters"].get("header").is_none(),
            "parameters 是整体替换而非合并，旧 header 参数不该残留: {}",
            data["parameters"]
        );
        assert_eq!(data["tags"], serde_json::json!(["新标签"]), "tags 同样是整体替换");
    }

    #[test]
    fn doc_upsert_endpoint_rejects_unknown_project() {
        let db = setup_db();
        let mut args = doc_upsert_args("孤儿接口");
        args["projectId"] = serde_json::json!("proj-missing");
        let err = call_err(&db, "api-doc.upsert_endpoint", args);
        assert_eq!(err.code, -32602);
        assert!(err.message.contains("项目不存在"), "{}", err.message);
    }

    #[test]
    fn doc_delete_endpoint_moves_to_recycle() {
        let db = setup_db();
        let created = call_json(&db, "api-doc.upsert_endpoint", doc_upsert_args("待删订单"));
        let id = created["id"].as_str().unwrap().to_string();

        let deleted = call_json(
            &db,
            "api-doc.delete_endpoint",
            serde_json::json!({"projectId": "proj-1", "id": id}),
        );
        assert_eq!(deleted["deleted"], serde_json::json!(true));
        assert_eq!(count_api_detail(&db, "/api/v1/orders"), 0);

        let recycled: i64 = db
            .0
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM recycle_items WHERE project_id = 'proj-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(recycled, 1, "删除的接口应进回收站");

        // 再删同一 id：报不存在
        let err = call_err(
            &db,
            "api-doc.delete_endpoint",
            serde_json::json!({"projectId": "proj-1", "id": id}),
        );
        assert_eq!(err.code, -32602);
    }

    #[test]
    fn doc_folder_create_and_move_rejects_cycle() {
        let db = setup_db();
        let a = call_json(
            &db,
            "api-doc.create_folder",
            serde_json::json!({"projectId": "proj-1", "name": "A"}),
        );
        let a_id = a["id"].as_str().unwrap().to_string();

        let b = call_json(
            &db,
            "api-doc.create_folder",
            serde_json::json!({"projectId": "proj-1", "name": "B", "parentId": a_id}),
        );
        let b_id = b["id"].as_str().unwrap().to_string();
        assert_ne!(a_id, b_id);

        // B 建在 A 下
        let b_now = call_json(
            &db,
            "api-doc.move_folder",
            serde_json::json!({"projectId": "proj-1", "id": b_id}),
        );
        assert_eq!(b_now["parentId"].as_str(), Some(a_id.as_str()));

        // A 移到自己的子孙 B 下：报错
        let err = call_err(
            &db,
            "api-doc.move_folder",
            serde_json::json!({"projectId": "proj-1", "id": a_id, "parentId": b_id}),
        );
        assert_eq!(err.code, -32602);
        assert!(err.message.contains("子孙"), "{}", err.message);

        // A 移到自己下面：报错
        let err = call_err(
            &db,
            "api-doc.move_folder",
            serde_json::json!({"projectId": "proj-1", "id": a_id, "parentId": a_id}),
        );
        assert_eq!(err.code, -32602);

        // 显式 null：B 移到根级
        let moved = call_json(
            &db,
            "api-doc.move_folder",
            serde_json::json!({"projectId": "proj-1", "id": b_id, "parentId": null}),
        );
        assert!(moved["parentId"].is_null(), "{}", moved);

        // 改名
        let renamed = call_json(
            &db,
            "api-doc.move_folder",
            serde_json::json!({"projectId": "proj-1", "id": a_id, "name": "A2"}),
        );
        assert_eq!(renamed["name"], "A2");
    }

    #[test]
    fn doc_create_folder_rejects_non_folder_parent() {
        let db = setup_db();
        let err = call_err(
            &db,
            "api-doc.create_folder",
            serde_json::json!({"projectId": "proj-1", "name": "X", "parentId": "api-login"}),
        );
        assert_eq!(err.code, -32602);
        assert!(err.message.contains("不是目录"), "{}", err.message);
    }

    #[test]
    fn doc_save_schema_overwrites_same_name() {
        let db = setup_db();
        let first = call_json(
            &db,
            "api-doc.save_schema",
            serde_json::json!({
                "projectId": "proj-1",
                "name": "Order",
                "jsonSchema": {"type": "object", "properties": {"a": {"type": "string"}}}
            }),
        );
        let id = first["id"].as_str().unwrap().to_string();
        assert_eq!(first["created"], serde_json::json!(true));

        let second = call_json(
            &db,
            "api-doc.save_schema",
            serde_json::json!({
                "projectId": "proj-1",
                "name": "Order",
                "jsonSchema": {"type": "object", "properties": {"b": {"type": "integer"}}}
            }),
        );
        assert_eq!(second["id"].as_str().unwrap(), id, "同名模型应复用同一条");
        assert_eq!(second["created"], serde_json::json!(false));

        let count: i64 = db
            .0
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM menu_items WHERE project_id = 'proj-1' AND type = 'apiSchema'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        let schema = api_data(&db, &id);
        assert!(schema["jsonSchema"]["properties"]["b"].is_object(), "同名覆盖为新内容");
        assert!(schema["jsonSchema"]["properties"]["a"].is_null(), "旧字段应被覆盖");
    }

    #[test]
    fn doc_save_environment_merges_by_name() {
        let db = setup_db();

        let result = call_json(
            &db,
            "api-doc.save_environment",
            serde_json::json!({
                "projectId": "proj-1",
                "globalVariables": [
                    {"name": "apiHost", "value": "https://new-host"},
                    {"name": "token", "value": "abc"}
                ],
                "environments": [
                    {"name": "测试环境", "url": "http://new-test", "variables": [{"name": "token", "value": "t1"}]},
                    {"name": "生产环境", "url": "https://prod"}
                ]
            }),
        );
        assert_eq!(result["environments"], serde_json::json!(2));
        assert_eq!(result["globalVariables"], serde_json::json!(2));

        let config = env_config(&db);
        let envs = config["environments"].as_array().unwrap();
        assert_eq!(envs.len(), 2, "同名替换、异名追加");
        let test_env = envs
            .iter()
            .find(|e| e["name"] == "测试环境")
            .expect("测试环境应保留");
        assert_eq!(test_env["id"], "env-test", "同名环境沿用原 id");
        assert_eq!(test_env["url"], "http://new-test");
        assert!(test_env["variables"][0]["id"].is_string(), "变量补 id");
        assert!(envs.iter().any(|e| e["name"] == "生产环境"));

        let globals = config["globalVariables"].as_array().unwrap();
        assert_eq!(globals.len(), 2);
        let host = globals
            .iter()
            .find(|v| v["name"] == "apiHost")
            .expect("apiHost 应保留");
        assert_eq!(host["value"], "https://new-host");
        assert!(host["id"].is_string(), "全局变量应带上 id");
        // 未提及的 globalParameters 不应被清空
        assert!(config.get("globalParameters").is_some());
    }

    #[test]
    fn doc_save_environment_rejects_unnamed_entries() {
        let db = setup_db();
        let err = call_err(
            &db,
            "api-doc.save_environment",
            serde_json::json!({
                "projectId": "proj-1",
                "environments": [{"url": "http://x"}]
            }),
        );
        assert_eq!(err.code, -32602);
    }

    #[test]
    fn doc_tools_require_valid_personal_token() {
        use axum::http::HeaderValue;

        let db = setup_db();

        // 无令牌
        let empty = HeaderMap::new();
        assert_eq!(authorize_doc_tool(&db, &empty).unwrap_err().code, -32001);

        // 无效令牌
        let mut bad = HeaderMap::new();
        bad.insert("X-YAPI-TOKEN", HeaderValue::from_static("nope"));
        assert_eq!(authorize_doc_tool(&db, &bad).unwrap_err().code, -32001);

        // 合法令牌：X-YAPI-TOKEN 与 Authorization: Bearer 都要通过
        let token = personal_token_repo::create_personal_token(&db, "user-1", "mcp").unwrap();
        let mut header = HeaderMap::new();
        header.insert(
            "X-YAPI-TOKEN",
            HeaderValue::from_str(&token.token).unwrap(),
        );
        assert!(authorize_doc_tool(&db, &header).is_ok());

        let mut bearer = HeaderMap::new();
        bearer.insert(
            "Authorization",
            HeaderValue::from_str(&format!("Bearer {}", token.token)).unwrap(),
        );
        assert!(authorize_doc_tool(&db, &bearer).is_ok());
    }
}