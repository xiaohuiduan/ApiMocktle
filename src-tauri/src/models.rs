use serde::{Deserialize, Serialize};

// Auth
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionUser {
    pub id: String,
    pub username: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginPayload {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterPayload {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChangePasswordPayload {
    #[serde(rename = "oldPassword")]
    pub old_password: String,
    #[serde(rename = "newPassword")]
    pub new_password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResult {
    pub user: SessionUser,
    pub session_id: String,
}

// Projects
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectItem {
    pub id: String,
    pub name: String,
    pub role: String,
    #[serde(rename = "ownerId")]
    pub owner_id: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(default)]
    pub icon: String,
    #[serde(rename = "memberCount")]
    pub member_count: i32,
    #[serde(rename = "apiCount")]
    pub api_count: i32,
    #[serde(rename = "schemaCount")]
    pub schema_count: i32,
    #[serde(rename = "requestCount")]
    pub request_count: i32,
    #[serde(rename = "testCount")]
    pub test_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProjectPayload {
    pub name: String,
    #[serde(default)]
    pub icon: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateProjectPayload {
    pub name: String,
    #[serde(default)]
    pub icon: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectListResult {
    pub projects: Vec<ProjectItem>,
}

// Menu Items
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ApiMenuData {
    pub id: String,
    #[serde(rename = "parentId", default)]
    pub parent_id: Option<String>,
    pub name: String,
    #[serde(rename = "type")]
    pub menu_type: String,
    #[serde(rename = "data", default)]
    pub data_json: Option<serde_json::Value>,
    #[serde(rename = "runTabInfo", default)]
    pub run_tab_json: Option<serde_json::Value>,
    #[serde(rename = "sortOrder")]
    pub sort_order: i32,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateMenuItemPayload {
    pub id: String,
    #[serde(rename = "parentId", default)]
    pub parent_id: Option<String>,
    pub name: String,
    #[serde(rename = "type")]
    pub menu_type: String,
    #[serde(rename = "data", default)]
    pub data_json: Option<serde_json::Value>,
    #[serde(rename = "runTabInfo", default)]
    pub run_tab_json: Option<serde_json::Value>,
    #[serde(rename = "sortOrder")]
    pub sort_order: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveMenuItemPayload {
    #[serde(rename = "dragKey")]
    pub drag_key: String,
    #[serde(rename = "dropKey")]
    pub drop_key: String,
    #[serde(rename = "dropPosition")]
    pub drop_position: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchDeletePayload {
    #[serde(rename = "menuIds")]
    pub menu_ids: Vec<String>,
}

// Environments
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectEnvironmentConfig {
    #[serde(rename = "globalParameters", default)]
    pub global_parameters: serde_json::Value,
    #[serde(rename = "legacyGlobalParameters", default)]
    pub legacy_global_parameters: Vec<serde_json::Value>,
    #[serde(rename = "globalVariables", default)]
    pub global_variables: Vec<serde_json::Value>,
    #[serde(rename = "environments", default)]
    pub environments: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveEnvironmentPayload {
    pub config: ProjectEnvironmentConfig,
}

// Recycle
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecycleDataItem {
    pub id: String,
    #[serde(rename = "catalogType")]
    pub catalog_type: String,
    #[serde(rename = "deletedItemJson")]
    pub deleted_item_json: serde_json::Value,
    #[serde(rename = "creatorJson")]
    pub creator_json: serde_json::Value,
    #[serde(rename = "expiresAt")]
    pub expires_at: i64,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecycleIdsPayload {
    #[serde(rename = "recycleIds")]
    pub recycle_ids: Vec<String>,
}

// Project State
#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectStateSnapshot {
    #[serde(rename = "menuRawList")]
    pub menu_raw_list: Vec<ApiMenuData>,
    #[serde(rename = "recyleRawData")]
    pub recyle_raw_data: Vec<RecycleDataItem>,
    #[serde(rename = "projectEnvironments")]
    pub project_environments: Vec<serde_json::Value>,
    #[serde(rename = "projectEnvironmentConfig")]
    pub project_environment_config: ProjectEnvironmentConfig,
}

// Project Members
#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectMember {
    #[serde(rename = "userId")]
    pub id: String,
    pub username: String,
    pub role: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddMemberPayload {
    pub username: String,
    pub role: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateMemberRolePayload {
    pub role: String,
}


// Import
#[derive(Debug, Serialize, Deserialize)]
pub struct ImportPayload {
    pub format: String,
    pub content: String,
}

// Request Runner
#[derive(Debug, Serialize, Deserialize)]
pub struct FormDataFile {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyConfig {
    #[serde(rename = "proxyType")]
    pub proxy_type: String,
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RunRequestPayload {
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub headers: Vec<RunRequestHeader>,
    #[serde(default)]
    pub body: String,
    #[serde(rename = "contentType", default)]
    pub content_type: Option<String>,
    #[serde(rename = "formDataFiles", default)]
    pub form_data_files: Vec<FormDataFile>,
    #[serde(rename = "proxyConfig", default)]
    pub proxy_config: Option<ProxyConfig>,
    #[serde(rename = "insecureSkipVerify", default)]
    pub insecure_skip_verify: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RunRequestHeader {
    pub name: String,
    pub value: String,
}

// Request History
#[derive(Debug, Serialize, Deserialize)]
pub struct RequestHistoryItem {
    pub id: String,
    #[serde(rename = "menuItemId")]
    pub menu_item_id: String,
    #[serde(rename = "requestJson")]
    pub request_json: serde_json::Value,
    #[serde(rename = "responseJson")]
    pub response_json: serde_json::Value,
    #[serde(rename = "statusCode")]
    pub status_code: i32,
    #[serde(rename = "durationMs")]
    pub duration_ms: i64,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

// Personal Tokens
#[derive(Debug, Serialize, Deserialize)]
pub struct PersonalToken {
    pub id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    pub token: String,
    pub name: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

// Response wrappers
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResult<T: Serialize> {
    pub ok: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

// Test Folders
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TestFolder {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTestFolderPayload {
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateTestFolderPayload {
    #[serde(default)]
    pub name: Option<String>,
}

// Test Tasks
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TestTask {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: String,
    pub folder_id: Option<String>,
    pub environment_id: Option<String>,
    pub environment_json: Option<serde_json::Value>,
    pub variables_json: Option<serde_json::Value>,
    pub status: String,
    pub fail_fast: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTestTaskPayload {
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(rename = "folderId", default)]
    pub folder_id: Option<String>,
    #[serde(rename = "environmentId", default)]
    pub environment_id: Option<String>,
    #[serde(rename = "failFast", default = "default_true")]
    pub fail_fast: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateTestTaskPayload {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "folderId", default)]
    pub folder_id: Option<Option<String>>,
    #[serde(rename = "environmentId", default)]
    pub environment_id: Option<String>,
    #[serde(rename = "variables", default)]
    pub variables_json: Option<serde_json::Value>,
    #[serde(rename = "failFast", default)]
    pub fail_fast: Option<bool>,
}

// Test Steps
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TestStep {
    pub id: String,
    pub task_id: String,
    pub sort_order: i32,
    pub name: String,
    pub menu_item_id: String,
    pub request_override_json: Option<serde_json::Value>,
    pub pre_script: Option<String>,
    pub post_script: Option<String>,
    pub assertions_json: Option<serde_json::Value>,
    pub extractors_json: Option<serde_json::Value>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTestStepPayload {
    #[serde(rename = "taskId")]
    pub task_id: String,
    #[serde(rename = "sortOrder", default)]
    pub sort_order: Option<i32>,
    #[serde(default)]
    pub name: String,
    #[serde(rename = "menuItemId")]
    pub menu_item_id: String,
    #[serde(rename = "requestOverride", default)]
    pub request_override_json: Option<serde_json::Value>,
    #[serde(rename = "preScript", default)]
    pub pre_script: Option<String>,
    #[serde(rename = "postScript", default)]
    pub post_script: Option<String>,
    #[serde(rename = "assertions", default)]
    pub assertions_json: Option<serde_json::Value>,
    #[serde(rename = "extractors", default)]
    pub extractors_json: Option<serde_json::Value>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateTestStepPayload {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "sortOrder", default)]
    pub sort_order: Option<i32>,
    #[serde(rename = "menuItemId", default)]
    pub menu_item_id: Option<String>,
    #[serde(rename = "requestOverride", default)]
    pub request_override_json: Option<serde_json::Value>,
    #[serde(rename = "preScript", default)]
    pub pre_script: Option<String>,
    #[serde(rename = "postScript", default)]
    pub post_script: Option<String>,
    #[serde(rename = "assertions", default)]
    pub assertions_json: Option<serde_json::Value>,
    #[serde(rename = "extractors", default)]
    pub extractors_json: Option<serde_json::Value>,
    #[serde(default)]
    pub enabled: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReorderStepsPayload {
    #[serde(rename = "stepIds")]
    pub step_ids: Vec<String>,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
pub struct ListTestExecutionsPayload {
    #[serde(rename = "taskId")]
    pub task_id: String,
    #[serde(default = "default_limit")]
    pub limit: i32,
}

#[allow(dead_code)]
fn default_limit() -> i32 {
    20
}

// Test Executions
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TestExecution {
    pub id: String,
    pub task_id: String,
    pub status: String,
    pub total_steps: i32,
    pub passed_steps: i32,
    pub failed_steps: i32,
    pub skipped_steps: i32,
    pub total_duration_ms: i64,
    pub environment_json: Option<serde_json::Value>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TestStepResult {
    pub id: String,
    pub execution_id: String,
    pub step_id: String,
    pub sort_order: i32,
    pub status: String,
    pub request_json: Option<serde_json::Value>,
    pub response_json: Option<serde_json::Value>,
    pub script_results_json: Option<serde_json::Value>,
    pub variable_deltas_json: Option<serde_json::Value>,
    pub duration_ms: i64,
    pub error_message: Option<String>,
    pub executed_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestExecutionDetail {
    pub execution: TestExecution,
    pub step_results: Vec<TestStepResult>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestTaskDetail {
    pub task: TestTask,
    pub steps: Vec<TestStep>,
}

fn default_true() -> bool {
    true
}

impl<T: Serialize> ApiResult<T> {
    pub fn success(data: T) -> Self {
        ApiResult {
            ok: true,
            data: Some(data),
            error: None,
        }
    }
}

impl<T: Serialize> From<crate::errors::AppError> for ApiResult<T> {
    fn from(e: crate::errors::AppError) -> Self {
        ApiResult {
            ok: false,
            data: None,
            error: Some(e.to_string()),
        }
    }
}

