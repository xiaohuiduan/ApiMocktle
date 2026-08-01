//! 端到端手动验证用：独立启动分享服务器（模拟桌面端分享流程的数据准备）。
//!
//! 运行：cargo run --example share_e2e_server
//! 前置：已执行 pnpm build（静态页依赖 dist/）
//!
//! 行为：
//!   1. 重建临时数据库，写入种子数据（用户/项目/接口/文档）
//!   2. 创建分享链接（密码 test1234）
//!   3. 启动分享服务器（0.0.0.0:14204，托管 dist/）
//!   4. 打印访问地址后保持运行，Ctrl+C 退出

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use apimocktle_lib::db::client::init_database;
use apimocktle_lib::db::share_repo;
use apimocktle_lib::http::share_server::{start_share_server, ShareServerHandle};
use apimocktle_lib::models::CreateMenuItemPayload;

#[tokio::main]
async fn main() {
    let db_dir = std::env::temp_dir().join("apimocktle-share-e2e");
    // 重建干净数据库
    let _ = std::fs::remove_dir_all(&db_dir);
    let db = Arc::new(init_database(&db_dir));
    let project_id = "p-e2e".to_string();

    {
        let conn = db.0.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1', 'tester', 'x', ?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, owner_id, created_at) VALUES ('p-e2e', '宠物店 API', 'u1', ?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO project_members (project_id, user_id, role, created_at) VALUES ('p-e2e', 'u1', 'owner', ?1)",
            [&now],
        )
        .unwrap();
    }

    // 菜单：分类 + 2 接口 + 1 文档
    let items = [
        (
            "cat1",
            None,
            "宠物管理",
            "apiDetailFolder",
            serde_json::json!({}),
        ),
        (
            "api1",
            Some("cat1"),
            "查询宠物详情",
            "apiDetail",
            serde_json::json!({
                "method": "GET",
                "path": "/pet/{petId}",
                "name": "查询宠物详情",
                "description": "根据 ID 查询宠物信息",
                "tags": ["宠物", "查询"],
                "parameters": {
                    "path": [
                        { "id": "p1", "name": "petId", "type": "integer", "required": true, "description": "宠物 ID", "example": "1" }
                    ],
                    "query": [
                        { "id": "q1", "name": "verbose", "type": "boolean", "required": false, "description": "是否返回详细信息", "example": "true" }
                    ],
                    "header": [
                        { "id": "h1", "name": "X-Trace-Id", "type": "string", "required": false, "description": "链路追踪 ID", "example": "abc-123" }
                    ]
                },
                "requestBody": { "type": "none" },
                "responses": [
                    {
                        "code": 200,
                        "name": "成功",
                        "contentType": "json",
                        "jsonSchema": {
                            "type": "object",
                            "properties": {
                                "id": { "type": "integer", "description": "宠物 ID" },
                                "name": { "type": "string", "description": "宠物名称" },
                                "status": { "type": "string", "enum": ["available", "pending", "sold"] }
                            }
                        }
                    }
                ]
            }),
        ),
        (
            "api2",
            Some("cat1"),
            "新增宠物",
            "apiDetail",
            serde_json::json!({
                "method": "POST",
                "path": "/pet",
                "name": "新增宠物",
                "description": "新增一条宠物记录",
                "requestBody": {
                    "type": "application/json",
                    "jsonSchema": {
                        "type": "object",
                        "properties": {
                            "name": { "type": "string", "description": "宠物名称" },
                            "tag": { "type": "string", "description": "标签" }
                        }
                    }
                },
                "responses": [
                    { "code": 201, "name": "创建成功", "contentType": "json" }
                ]
            }),
        ),
        (
            "doc1",
            Some("cat1"),
            "接入说明",
            "doc",
            serde_json::json!({
                "content": "# 宠物店 API 接入说明\n\n## 简介\n\n本接口文档用于宠物店系统的 **API 对接**。\n\n## 认证方式\n\n- Header 携带 `X-Trace-Id`\n- 请求格式：JSON\n\n## 快速开始\n\n```bash\ncurl -X GET https://api.example.com/pet/1\n```\n\n> 提示：所有接口均支持幂等重试。"
            }),
        ),
    ];

    for (id, parent, name, menu_type, data_json) in items {
        let payload = CreateMenuItemPayload {
            id: id.to_string(),
            parent_id: parent.map(|p| p.to_string()),
            name: name.to_string(),
            menu_type: menu_type.to_string(),
            data_json: Some(data_json),
            run_tab_json: None,
            sort_order: Some(0),
        };
        apimocktle_lib::db::menu_repo::create_menu_item(&db, &project_id, &payload).unwrap();
    }

    // 分享链接：全量内容，密码 test1234，永久
    let password_hash = apimocktle_lib::services::crypto::hash_password("test1234").unwrap();
    let link = share_repo::create_share_link(
        &db,
        &project_id,
        "u1",
        vec![],
        Some(password_hash),
        None,
        "宠物店 API 文档",
    )
    .unwrap();

    // 启动分享服务器
    let dist_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist");
    let handle = Arc::new(ShareServerHandle::new());
    let handle_clone = handle.clone();
    tokio::spawn(async move {
        start_share_server(db, handle_clone, 14204, Some(dist_dir)).await;
    });

    for _ in 0..50 {
        let port = handle.get_port().await;
        if port > 0 {
            break
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let port = handle.get_port().await;
    assert!(port > 0, "分享服务器启动失败");

    println!("==============================================");
    println!("端到端验证服务器已就绪");
    println!("访问地址: http://127.0.0.1:{}/#/share/{}", port, link.id);
    println!("访问密码: test1234");
    println!("Ctrl+C 退出");
    println!("==============================================");

    loop {
        tokio::time::sleep(Duration::from_secs(3600)).await;
    }
}
