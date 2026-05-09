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
    #[serde(rename = "vaultSecrets", default)]
    pub vault_secrets: Vec<serde_json::Value>,
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
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RunRequestHeader {
    pub name: String,
    pub value: String,
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

