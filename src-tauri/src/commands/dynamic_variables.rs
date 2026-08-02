use std::sync::Arc;

use tauri::State;

use crate::db::client::Db;
use crate::db::{auth_repo, dynamic_variables_repo};
use crate::errors::AppError;
use crate::models::*;
use crate::services::dynamic_variables as var_service;

/// 批量求值模板字段（前端发请求前一次 IPC 替换全部字段）
#[tauri::command]
pub fn resolve_template_batch(fields: Vec<String>) -> ApiResult<Vec<ResolvedField>> {
    let results = fields.iter().map(|f| var_service::resolve_field(f)).collect();
    ApiResult::success(results)
}

/// 列表（内置 + 自定义，供补全/说明弹窗/管理面板）
#[tauri::command]
pub fn list_dynamic_variables(db: State<'_, Arc<Db>>, session_id: String) -> ApiResult<Vec<DynamicVariableDef>> {
    if auth_repo::get_valid_session_user(&db, &session_id).is_none() {
        return AppError::Unauthorized("未登录".into()).into();
    }
    match dynamic_variables_repo::list(&db) {
        Ok(v) => ApiResult::success(v),
        Err(e) => e.into(),
    }
}

/// 新建/更新（内置仅允许改 description/enabled），保存后刷新引擎缓存
#[tauri::command]
pub fn save_dynamic_variable(
    db: State<'_, Arc<Db>>,
    session_id: String,
    payload: SaveDynamicVariablePayload,
) -> ApiResult<DynamicVariableDef> {
    if auth_repo::get_valid_session_user(&db, &session_id).is_none() {
        return AppError::Unauthorized("未登录".into()).into();
    }
    match dynamic_variables_repo::save(&db, &payload) {
        Ok(def) => {
            let _ = var_service::refresh_defs(&db);
            ApiResult::success(def)
        }
        Err(e) => e.into(),
    }
}

/// 删除自定义变量（内置禁止），删除后刷新引擎缓存
#[tauri::command]
pub fn delete_dynamic_variable(db: State<'_, Arc<Db>>, session_id: String, id: String) -> ApiResult<()> {
    if auth_repo::get_valid_session_user(&db, &session_id).is_none() {
        return AppError::Unauthorized("未登录".into()).into();
    }
    match dynamic_variables_repo::delete(&db, &id) {
        Ok(()) => {
            let _ = var_service::refresh_defs(&db);
            ApiResult::success(())
        }
        Err(e) => e.into(),
    }
}

/// 脚本试运行（管理面板调试输出；不落库）。args 为逗号分隔的模板参数（如 "1,100"），注入脚本内 args 数组
#[tauri::command]
pub fn test_script(script: String, args: Option<String>) -> ApiResult<ScriptTestResult> {
    match var_service::with_engine(|e| e.test_script(&script, args.as_deref())) {
        Ok(r) => ApiResult::success(r),
        Err(e) => e.into(),
    }
}
