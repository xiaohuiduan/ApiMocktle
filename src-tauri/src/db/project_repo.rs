use rusqlite::params;
use uuid::Uuid;

use crate::db::client::Db;
use crate::models::{ProjectItem, ProjectMember, ProjectStateSnapshot, ApiMenuData, RecycleDataItem, ProjectEnvironmentConfig};

pub fn list_projects(db: &Db, user_id: &str) -> Result<Vec<ProjectItem>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.owner_id, p.created_at, COALESCE(p.icon, '') as icon,
                pm.role,
                (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
                (SELECT COUNT(*) FROM menu_items WHERE project_id = p.id AND type = 'apiDetail') as api_count,
                (SELECT COUNT(*) FROM menu_items WHERE project_id = p.id AND type = 'apiSchema') as schema_count,
                (SELECT COUNT(*) FROM menu_items WHERE project_id = p.id AND type = 'httpRequest') as request_count,
                (SELECT COUNT(*) FROM test_tasks WHERE project_id = p.id) as test_count
         FROM projects p
         JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?1
         ORDER BY p.created_at DESC",
    )?;

    let rows = stmt.query_map(params![user_id], |row| {
        Ok(ProjectItem {
            id: row.get(0)?,
            name: row.get(1)?,
            owner_id: row.get(2)?,
            created_at: row.get(3)?,
            icon: row.get::<_, String>(4).unwrap_or_default(),
            role: row.get(5)?,
            member_count: row.get(6)?,
            api_count: row.get(7)?,
            schema_count: row.get(8)?,
            request_count: row.get(9)?,
            test_count: row.get(10)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

pub fn create_project(
    db: &Db,
    name: &str,
    icon: &str,
    owner_id: &str,
) -> Result<ProjectItem, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO projects (id, name, owner_id, created_at, icon) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, name, owner_id, now, icon],
    )?;

    conn.execute(
        "INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?1, ?2, 'owner', ?3)",
        params![id, owner_id, now],
    )?;

    Ok(ProjectItem {
        id,
        name: name.to_string(),
        owner_id: owner_id.to_string(),
        created_at: now,
        icon: icon.to_string(),
        role: "owner".to_string(),
        member_count: 1,
        api_count: 0,
        schema_count: 0,
        request_count: 0,
        test_count: 0,
    })
}

pub fn get_project(
    db: &Db,
    project_id: &str,
    user_id: &str,
) -> Result<Option<ProjectItem>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let result = conn.query_row(
        "SELECT p.id, p.name, p.owner_id, p.created_at, COALESCE(p.icon, ''), pm.role,
                (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
                (SELECT COUNT(*) FROM menu_items WHERE project_id = p.id AND type = 'apiDetail') as api_count,
                (SELECT COUNT(*) FROM menu_items WHERE project_id = p.id AND type = 'apiSchema') as schema_count,
                (SELECT COUNT(*) FROM menu_items WHERE project_id = p.id AND type = 'httpRequest') as request_count,
                (SELECT COUNT(*) FROM test_tasks WHERE project_id = p.id) as test_count
         FROM projects p
         JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?2
         WHERE p.id = ?1",
        params![project_id, user_id],
        |row| {
            Ok(ProjectItem {
                id: row.get(0)?,
                name: row.get(1)?,
                owner_id: row.get(2)?,
                created_at: row.get(3)?,
                icon: row.get::<_, String>(4).unwrap_or_default(),
                role: row.get(5)?,
                member_count: row.get(6)?,
                api_count: row.get(7)?,
                schema_count: row.get(8)?,
                request_count: row.get(9)?,
                test_count: row.get(10)?,
            })
        },
    );

    match result {
        Ok(item) => Ok(Some(item)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn get_project_by_id(
    db: &Db,
    project_id: &str,
) -> Result<Option<(String, String)>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let result = conn.query_row(
        "SELECT id, name FROM projects WHERE id = ?1",
        params![project_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );
    match result {
        Ok(item) => Ok(Some(item)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn update_project(
    db: &Db,
    project_id: &str,
    name: &str,
    icon: &str,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE projects SET name = ?1, icon = ?2 WHERE id = ?3",
        params![name, icon, project_id],
    )?;
    Ok(())
}

pub fn delete_project(db: &Db, project_id: &str) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM projects WHERE id = ?1", params![project_id])?;
    Ok(())
}

pub fn get_project_member_role(
    db: &Db,
    project_id: &str,
    user_id: &str,
) -> Option<String> {
    let conn = db.0.lock().unwrap();
    conn.query_row(
        "SELECT role FROM project_members WHERE project_id = ?1 AND user_id = ?2",
        params![project_id, user_id],
        |row| row.get(0),
    )
    .ok()
}

pub fn list_project_members(
    db: &Db,
    project_id: &str,
) -> Result<Vec<ProjectMember>, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT u.id, u.username, pm.role, pm.created_at
         FROM project_members pm JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = ?1",
    )?;

    let rows = stmt.query_map(params![project_id], |row| {
        Ok(ProjectMember {
            id: row.get(0)?,
            username: row.get(1)?,
            role: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
}

pub fn add_project_member(
    db: &Db,
    project_id: &str,
    target_username: &str,
    role: &str,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();

    let target_user: Option<(String,)> = conn
        .query_row(
            "SELECT id FROM users WHERE username = ?1",
            params![target_username],
            |row| Ok((row.get(0)?,)),
        )
        .ok();

    let target_id = match target_user {
        Some(u) => u.0,
        None => return Err(crate::errors::AppError::NotFound("用户不存在".into())),
    };

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR REPLACE INTO project_members (project_id, user_id, role, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![project_id, target_id, role, now],
    )?;

    Ok(())
}

pub fn update_member_role(
    db: &Db,
    project_id: &str,
    user_id: &str,
    role: &str,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE project_members SET role = ?1 WHERE project_id = ?2 AND user_id = ?3",
        params![role, project_id, user_id],
    )?;
    Ok(())
}

pub fn remove_project_member(
    db: &Db,
    project_id: &str,
    user_id: &str,
) -> Result<(), crate::errors::AppError> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "DELETE FROM project_members WHERE project_id = ?1 AND user_id = ?2",
        params![project_id, user_id],
    )?;
    Ok(())
}
fn normalize_json_schema(schema: &mut serde_json::Value) {
    if let Some(obj) = schema.as_object_mut() {
        // 联合类型归一：["string","null"] → type="string" + nullable=true
        if let Some(serde_json::Value::Array(types)) = obj.get("type").cloned() {
            if let Some(primary) = types
                .iter()
                .filter_map(|t| t.as_str())
                .find(|t| *t != "null")
            {
                obj.insert(
                    "type".to_string(),
                    serde_json::Value::String(primary.to_string()),
                );
                if types.iter().any(|t| t.as_str() == Some("null")) {
                    obj.insert("nullable".to_string(), serde_json::Value::Bool(true));
                }
            }
        }
        // $ref-only → 补 type: "ref"
        if obj.contains_key("$ref") && !obj.contains_key("type") {
            obj.insert("type".to_string(), serde_json::Value::String("ref".to_string()));
        }
        // properties 为 object map → 转数组 [{name, ...}]
        if obj.get("type") == Some(&serde_json::Value::String("object".to_string())) {
            if let Some(props_val) = obj.remove("properties") {
                if let serde_json::Value::Object(props_map) = props_val {
                    let mut arr: Vec<serde_json::Value> = Vec::new();
                    for (name, mut def) in props_map {
                        normalize_json_schema(&mut def);
                        if let Some(def_obj) = def.as_object_mut() {
                            def_obj.insert("name".to_string(), serde_json::Value::String(name));
                        }
                        arr.push(def);
                    }
                    obj.insert("properties".to_string(), serde_json::Value::Array(arr));
                } else {
                    // 数组或其它类型 → 递归处理每个元素后放回
                    let mut props_val = props_val;
                    if let serde_json::Value::Array(ref mut props_arr) = props_val {
                        for prop in props_arr.iter_mut() {
                            normalize_json_schema(prop);
                        }
                    }
                    obj.insert("properties".to_string(), props_val);
                }
            }
            // 从 required[] 提取到各字段：先按 name 匹配下放，再删掉顶层数组
            if let Some(serde_json::Value::Array(required)) = obj.get("required").cloned() {
                let required_names: Vec<&str> =
                    required.iter().filter_map(|v| v.as_str()).collect();
                if let Some(serde_json::Value::Array(props)) = obj.get_mut("properties") {
                    for prop in props.iter_mut() {
                        let hit = prop
                            .get("name")
                            .and_then(|v| v.as_str())
                            .is_some_and(|name| required_names.contains(&name));
                        if hit {
                            if let Some(prop_obj) = prop.as_object_mut() {
                                // required[] 是权威来源：命中即置 true，字段上的 false 不覆盖它
                                prop_obj
                                    .insert("required".to_string(), serde_json::Value::Bool(true));
                            }
                        }
                    }
                }
                obj.remove("required");
            }
        }
        // 递归处理 array items
        if obj.get("type") == Some(&serde_json::Value::String("array".to_string())) {
            if let Some(items) = obj.get_mut("items") {
                normalize_json_schema(items);
            }
        }
        // 递归处理已为数组的 properties
        if obj.get("type") == Some(&serde_json::Value::String("object".to_string())) {
            if let Some(serde_json::Value::Array(props)) = obj.get_mut("properties") {
                for prop in props.iter_mut() {
                    normalize_json_schema(prop);
                }
            }
        }
    }
}

/// 归一化菜单项中的 JSON Schema（data_json 字段）
fn normalize_menu_item_schema(menu_item: &mut ApiMenuData) {
    if let Some(ref mut data) = menu_item.data_json {
        let data_obj = match data.as_object_mut() {
            Some(o) => o,
            None => return,
        };

        // requestBody.jsonSchema
        if let Some(req_body) = data_obj.get_mut("requestBody") {
            if let Some(req_obj) = req_body.as_object_mut() {
                if let Some(json_schema) = req_obj.get_mut("jsonSchema") {
                    normalize_json_schema(json_schema);
                }
            }
        }

        // responses[].jsonSchema
        if let Some(responses) = data_obj.get_mut("responses") {
            if let Some(resp_arr) = responses.as_array_mut() {
                for resp in resp_arr.iter_mut() {
                    if let Some(resp_obj) = resp.as_object_mut() {
                        if let Some(json_schema) = resp_obj.get_mut("jsonSchema") {
                            normalize_json_schema(json_schema);
                        }
                    }
                }
            }
        }

        // apiSchema: data.jsonSchema
        if let Some(json_schema) = data_obj.get_mut("jsonSchema") {
            normalize_json_schema(json_schema);
        }
    }
}

// Project State
pub fn get_project_state(
    db: &Db,
    project_id: &str,
) -> Result<ProjectStateSnapshot, crate::errors::AppError> {
    let conn = db.0.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, parent_id, name, type, data_json, run_tab_json, sort_order, created_at, updated_at
         FROM menu_items WHERE project_id = ?1 ORDER BY sort_order",
    )?;
    let mut menu_raw_list: Vec<ApiMenuData> = stmt
        .query_map(params![project_id], |row| {
            Ok(ApiMenuData {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                name: row.get(2)?,
                menu_type: row.get(3)?,
                data_json: row.get::<_, Option<String>>(4).ok().flatten()
                    .and_then(|s| serde_json::from_str(&s).ok()),
                run_tab_json: row.get::<_, Option<String>>(5).ok().flatten()
                    .and_then(|s| serde_json::from_str(&s).ok()),
                sort_order: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // 统一归一化所有 JSON Schema
    for item in menu_raw_list.iter_mut() {
        normalize_menu_item_schema(item);
    }

    let mut stmt2 = conn.prepare(
        "SELECT id, catalog_type, deleted_item_json, creator_json, expires_at, created_at
         FROM recycle_items WHERE project_id = ?1 ORDER BY created_at DESC",
    )?;
    let recyle_raw_data: Vec<RecycleDataItem> = stmt2
        .query_map(params![project_id], |row| {
            Ok(RecycleDataItem {
                id: row.get(0)?,
                catalog_type: row.get(1)?,
                deleted_item_json: serde_json::from_str(
                    &row.get::<_, String>(2).unwrap_or_default(),
                )
                .unwrap_or_default(),
                creator_json: serde_json::from_str(
                    &row.get::<_, String>(3).unwrap_or_default(),
                )
                .unwrap_or_default(),
                expires_at: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let env_config_str: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE project_id = ?1 AND key = 'environmentConfig'",
            params![project_id],
            |row| row.get(0),
        )
        .ok();

    let project_environment_config: ProjectEnvironmentConfig = env_config_str
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(ProjectEnvironmentConfig {
            global_parameters: serde_json::json!({}),
            legacy_global_parameters: vec![],
            global_variables: vec![],
            environments: vec![],
        });

    let project_environments = project_environment_config.environments.clone();

    Ok(ProjectStateSnapshot {
        menu_raw_list,
        recyle_raw_data,
        project_environments,
        project_environment_config,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn normalize(schema: &mut serde_json::Value) {
        normalize_json_schema(schema);
    }

    fn prop_required(schema: &serde_json::Value, name: &str) -> Option<bool> {
        schema
            .get("properties")
            .and_then(|v| v.as_array())
            .and_then(|arr| {
                arr.iter()
                    .find(|p| p.get("name").and_then(|n| n.as_str()) == Some(name))
            })
            .and_then(|p| p.get("required"))
            .and_then(|v| v.as_bool())
    }

    #[test]
    fn required_array_is_pushed_down_to_fields() {
        let mut schema = serde_json::json!({
            "type": "object",
            "properties": {
                "a": { "type": "string" },
                "b": { "type": "number" },
                "c": { "type": "boolean" }
            },
            "required": ["a", "b"]
        });

        normalize(&mut schema);

        assert_eq!(prop_required(&schema, "a"), Some(true));
        assert_eq!(prop_required(&schema, "b"), Some(true));
        assert_eq!(
            prop_required(&schema, "c"),
            None,
            "未在 required[] 的字段不应被标记"
        );
        assert!(
            schema.get("required").is_none(),
            "顶层 required 数组应被移除: {schema}"
        );
    }

    #[test]
    fn required_names_without_matching_property_are_ignored() {
        let mut schema = serde_json::json!({
            "type": "object",
            "properties": { "a": { "type": "string" } },
            "required": ["a", "ghost"]
        });

        normalize(&mut schema);

        let props = schema.get("properties").and_then(|v| v.as_array()).unwrap();
        assert_eq!(props.len(), 1, "不产生幽灵字段: {schema}");
        assert_eq!(prop_required(&schema, "a"), Some(true));
    }

    #[test]
    fn nested_objects_keep_their_own_required_lists() {
        let mut schema = serde_json::json!({
            "type": "object",
            "properties": {
                "outer": {
                    "type": "object",
                    "properties": {
                        "inner_a": { "type": "string" },
                        "inner_b": { "type": "string" }
                    },
                    "required": ["inner_a"]
                },
                "top": { "type": "string" }
            },
            "required": ["outer"]
        });

        normalize(&mut schema);

        assert_eq!(prop_required(&schema, "outer"), Some(true));
        assert_eq!(prop_required(&schema, "top"), None);

        let outer = schema
            .get("properties")
            .and_then(|v| v.as_array())
            .unwrap()
            .iter()
            .find(|p| p.get("name").and_then(|n| n.as_str()) == Some("outer"))
            .unwrap();
        assert_eq!(prop_required(outer, "inner_a"), Some(true));
        assert_eq!(prop_required(outer, "inner_b"), None);
        // 外层 required[] 已下放到 inner_a；outer 自身的 required 变成父级下放的布尔标记
        assert_eq!(
            outer.get("required").and_then(|v| v.as_bool()),
            Some(true),
            "嵌套对象的 required 数组应已下放，只剩布尔标记"
        );
    }

    #[test]
    fn union_type_with_null_becomes_nullable() {
        let mut schema = serde_json::json!({
            "type": "object",
            "properties": {
                "beat_percent": { "type": ["integer", "null"] },
                "name": { "type": "string" }
            }
        });

        normalize(&mut schema);

        let props = schema.get("properties").and_then(|v| v.as_array()).unwrap();
        let beat = props
            .iter()
            .find(|p| p.get("name").and_then(|n| n.as_str()) == Some("beat_percent"))
            .unwrap();
        assert_eq!(beat.get("type").and_then(|v| v.as_str()), Some("integer"));
        assert_eq!(beat.get("nullable").and_then(|v| v.as_bool()), Some(true));

        let name = props
            .iter()
            .find(|p| p.get("name").and_then(|n| n.as_str()) == Some("name"))
            .unwrap();
        assert!(name.get("nullable").is_none(), "非联合类型不应带 nullable");
    }

    #[test]
    fn all_null_union_type_is_kept_as_is() {
        let mut schema = serde_json::json!({
            "type": "object",
            "properties": { "weird": { "type": ["null"] } }
        });

        normalize(&mut schema);

        let props = schema.get("properties").and_then(|v| v.as_array()).unwrap();
        let weird = props
            .iter()
            .find(|p| p.get("name").and_then(|n| n.as_str()) == Some("weird"))
            .unwrap();
        assert_eq!(
            weird
                .get("type")
                .and_then(|v| v.as_array())
                .map(|a| a.len()),
            Some(1),
            "全 null 的联合类型原样保留: {weird}"
        );
        assert!(weird.get("nullable").is_none());
    }

    /// 读路径端到端：库里存标准格式（object map + required[]），
    /// 经 get_project_state 读出后必填已下放到字段（AC-1 的判定路径）。
    #[test]
    fn get_project_state_pushes_required_down_to_fields() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::client::create_tables(&conn);
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1', 'tester', 'x', '2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, owner_id, created_at) VALUES ('p1', 'demo', 'u1', '2026-01-01')",
            [],
        )
        .unwrap();
        let data = serde_json::json!({
            "method": "GET",
            "path": "/demo",
            "responses": [{
                "id": "r1",
                "code": 200,
                "name": "成功",
                "contentType": "json",
                "jsonSchema": {
                    "type": "object",
                    "properties": {
                        "code": { "type": "integer" },
                        "data": { "type": "string" }
                    },
                    "required": ["code"]
                }
            }]
        });
        conn.execute(
            "INSERT INTO menu_items (project_id, id, name, type, data_json, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, '2026-01-01', '2026-01-01')",
            params!["p1", "m1", "demo", "apiDetail", data.to_string()],
        )
        .unwrap();

        let db = Db(std::sync::Mutex::new(conn));
        let state = get_project_state(&db, "p1").unwrap();
        let schema = state.menu_raw_list[0]
            .data_json
            .as_ref()
            .unwrap()
            .get("responses")
            .and_then(|v| v.as_array())
            .unwrap()[0]
            .get("jsonSchema")
            .unwrap();

        assert_eq!(prop_required(schema, "code"), Some(true), "必填字段应下放 required: true");
        assert_eq!(prop_required(schema, "data"), None, "非必填字段不应被标记");
        assert!(schema.get("required").is_none(), "顶层不应残留 required 数组");
    }
}
