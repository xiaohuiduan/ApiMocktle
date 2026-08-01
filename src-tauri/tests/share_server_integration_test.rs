//! 局域网文档分享服务器集成测试：启动真实 axum 服务器，走完整 HTTP 流程。
//!
//! 覆盖：登录（错密码拒绝 / 正确密码发 token）、菜单范围过滤、
//! 内容访问权限、过期链接、删除链接即时失效。
//! 运行：cargo test --test share_server_integration_test

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use apimocktle_lib::db::client::{init_database, Db};
use apimocktle_lib::db::share_repo;
use apimocktle_lib::http::share_server::{start_share_server, ShareServerHandle};
use apimocktle_lib::models::CreateMenuItemPayload;

fn setup_db() -> (Arc<Db>, String) {
    let dir = std::env::temp_dir().join(format!("apimocktle-share-test-{}", uuid::Uuid::new_v4()));
    let db = Arc::new(init_database(&dir));
    let project_id = "p1".to_string();

    {
        let conn = db.0.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1', 'tester', 'x', ?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, owner_id, created_at) VALUES ('p1', '测试项目', 'u1', ?1)",
            [&now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO project_members (project_id, user_id, role, created_at) VALUES ('p1', 'u1', 'owner', ?1)",
            [&now],
        )
        .unwrap();
    }

    // 菜单：1 个分类 + 2 个接口 + 1 个文档
    let items = [
        ("cat1", None, "订单分类", "apiDetailFolder"),
        ("api1", Some("cat1"), "查询订单", "apiDetail"),
        ("api2", Some("cat1"), "创建订单", "apiDetail"),
        ("doc1", Some("cat1"), "接入说明", "doc"),
    ];
    for (id, parent, name, menu_type) in items {
        let payload = CreateMenuItemPayload {
            id: id.to_string(),
            parent_id: parent.map(|p| p.to_string()),
            name: name.to_string(),
            menu_type: menu_type.to_string(),
            data_json: Some(serde_json::json!({
                "method": "GET",
                "path": format!("/api/{}", id),
            })),
            run_tab_json: None,
            sort_order: Some(0),
        };
        apimocktle_lib::db::menu_repo::create_menu_item(&db, &project_id, &payload).unwrap();
    }

    (db, project_id)
}

async fn start_test_server(db: Arc<Db>) -> (Arc<ShareServerHandle>, u16) {
    let handle = Arc::new(ShareServerHandle::new());
    let handle_clone = handle.clone();
    tokio::spawn(async move {
        start_share_server(db, handle_clone, 0, None::<PathBuf>).await;
    });

    // 等待端口就绪
    for _ in 0..50 {
        let port = handle.get_port().await;
        if port > 0 {
            return (handle, port);
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("share server did not start");
}

async fn login(client: &reqwest::Client, base: &str, share_id: &str, password: &str) -> String {
    let resp = client
        .post(format!("{base}/api/share/login"))
        .json(&serde_json::json!({ "shareId": share_id, "password": password }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::OK, "登录应成功");
    let json: serde_json::Value = resp.json().await.unwrap();
    json["data"]["token"].as_str().expect("token 缺失").to_string()
}

#[tokio::test]
async fn test_share_server_full_flow() {
    let (db, _project_id) = setup_db();

    // 分享1：只包含 api1（范围过滤），密码 secret，永久
    let password_hash = apimocktle_lib::services::crypto::hash_password("secret").unwrap();
    let link1 = share_repo::create_share_link(
        &db,
        "p1",
        "u1",
        vec!["api1".to_string()],
        Some(password_hash),
        Some("secret".to_string()),
        None,
        "订单接口",
    )
    .unwrap();

    // 分享2：已过期
    let link2 = share_repo::create_share_link(
        &db,
        "p1",
        "u1",
        vec![],
        Some(apimocktle_lib::services::crypto::hash_password("old").unwrap()),
        Some("old".to_string()),
        Some("2020-01-01".to_string()),
        "已过期分享",
    )
    .unwrap();

    let (handle, port) = start_test_server(db.clone()).await;
    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::new();

    // 1. 错误密码 → 401
    let resp = client
        .post(format!("{base}/api/share/login"))
        .json(&serde_json::json!({ "shareId": link1.id, "password": "wrong" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::UNAUTHORIZED);

    // 2. 不存在链接 → 404
    let resp = client
        .post(format!("{base}/api/share/login"))
        .json(&serde_json::json!({ "shareId": "no-such-id", "password": "x" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::NOT_FOUND);

    // 3. 过期链接 → 403
    let resp = client
        .post(format!("{base}/api/share/login"))
        .json(&serde_json::json!({ "shareId": link2.id, "password": "old" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::FORBIDDEN);

    // 4. 正确密码 → token + 项目名
    let token = login(&client, &base, &link1.id, "secret").await;

    // 5. 无 token 访问 → 401
    let resp = client.get(format!("{base}/api/share/menu")).send().await.unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::UNAUTHORIZED);

    // 6. 带 token 拉菜单 → 只返回 api1（范围过滤）
    let resp = client
        .get(format!("{base}/api/share/menu"))
        .header("X-Share-Token", &token)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::OK);
    let menu_json: serde_json::Value = resp.json().await.unwrap();
    let items = menu_json["data"]["items"].as_array().unwrap();
    assert_eq!(items.len(), 1, "范围过滤应只返回 api1");
    assert_eq!(items[0]["id"].as_str().unwrap(), "api1");
    assert_eq!(menu_json["data"]["project"]["name"].as_str().unwrap(), "测试项目");

    // 7. 范围内内容可访问
    let resp = client
        .get(format!("{base}/api/share/item/api1"))
        .header("X-Share-Token", &token)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::OK);
    let item_json: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(item_json["data"]["name"].as_str().unwrap(), "查询订单");
    assert_eq!(item_json["data"]["name"].as_str().unwrap(), "查询订单");

    // 8. 范围外内容 → 403
    let resp = client
        .get(format!("{base}/api/share/item/doc1"))
        .header("X-Share-Token", &token)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::FORBIDDEN);

    // 9. 概览统计（范围过滤后：1 个接口）
    let resp = client
        .get(format!("{base}/api/share/overview"))
        .header("X-Share-Token", &token)
        .send()
        .await
        .unwrap();
    let ov: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(ov["data"]["apiCount"].as_u64().unwrap(), 1);
    assert_eq!(ov["data"]["itemCount"].as_u64().unwrap(), 1);

    // 10. 删除链接 → 已登录会话立即失效（404）
    share_repo::delete_share_link(&db, &link1.id).unwrap();
    let resp = client
        .get(format!("{base}/api/share/menu"))
        .header("X-Share-Token", &token)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::NOT_FOUND);

    handle.stop().await;
}

#[tokio::test]
async fn test_share_server_static_hosting() {
    // dist 目录存在 → 根路径返回 share.html，assets 可访问
    let (db, _project_id) = setup_db();
    let dist_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist");

    let handle = Arc::new(ShareServerHandle::new());
    let handle_clone = handle.clone();
    tokio::spawn(async move {
        start_share_server(db, handle_clone, 0, Some(dist_dir)).await;
    });

    let mut port = 0;
    for _ in 0..50 {
        port = handle.get_port().await;
        if port > 0 {
          break
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(port > 0, "server 未启动");

    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::new();

    // 根路径 → share.html 内容
    let resp = client.get(format!("{base}/")).send().await.unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::OK);
    let body = resp.text().await.unwrap();
    assert!(body.contains("root"), "应返回 share.html（含 #root 容器）");

    // assets 静态资源可访问（取 dist/assets 下第一个文件名验证）
    let assets_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist/assets");
    let first_asset = std::fs::read_dir(&assets_dir)
        .expect("dist/assets 应存在")
        .next()
        .expect("dist/assets 应有文件")
        .unwrap()
        .file_name()
        .to_string_lossy()
        .to_string();
    let resp = client
        .get(format!("{base}/assets/{first_asset}"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::OK, "assets 静态文件应可访问");

    // 未匹配路径 → 404
    let resp = client.get(format!("{base}/no-such-page")).send().await.unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::NOT_FOUND);

    handle.stop().await;
}

#[tokio::test]
async fn test_share_server_without_dist_shows_hint() {
    // 无 dist（不存在的目录）→ 根路径返回构建提示页
    let (db, _project_id) = setup_db();

    let handle = Arc::new(ShareServerHandle::new());
    let handle_clone = handle.clone();
    tokio::spawn(async move {
        start_share_server(
            db,
            handle_clone,
            0,
            Some(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("no-such-dist-dir")),
        )
        .await;
    });

    let mut port = 0;
    for _ in 0..50 {
        port = handle.get_port().await;
        if port > 0 {
          break
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(port > 0, "server 未启动");

    let resp = reqwest::get(format!("http://127.0.0.1:{port}/")).await.unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::OK);
    let body = resp.text().await.unwrap();
    assert!(body.contains("分享页面不可用"), "应返回构建提示页");

    handle.stop().await;
}

#[tokio::test]
async fn test_share_link_no_password_and_update() {
    let (db, _project_id) = setup_db();

    // 无密码分享（password_hash None）：任意密码均可登录，空密码也直接放行
    let link = share_repo::create_share_link(&db, "p1", "u1", vec![], None, None, None, "").unwrap();
    assert!(!link.has_password, "无密码分享 has_password 应为 false");

    let (handle, port) = start_test_server(db.clone()).await;
    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::new();

    // 免密直接登录成功（任意密码都行）
    let token = login(&client, &base, &link.id, "whatever").await;

    // 编辑：设置密码 + 改标题 + 改范围
    let password_hash = apimocktle_lib::services::crypto::hash_password("newpass").unwrap();
    let updated = share_repo::update_share_link(
        &db,
        &link.id,
        vec!["api1".to_string(), "doc1".to_string()],
        Some(password_hash),
        Some("newpass".to_string()),
        None,
        "编辑后的标题",
    )
    .unwrap();
    assert!(updated.has_password, "设置密码后 has_password 应为 true");
    assert_eq!(updated.title, "编辑后的标题");
    assert_eq!(updated.api_menu_ids.len(), 2);
    assert_eq!(updated.password_plain.as_deref(), Some("newpass"), "明文密码应持久化");

    // 旧 token 会话仍有效（会话只绑 share_id），菜单反映新范围
    let resp = client
        .get(format!("{base}/api/share/menu"))
        .header("X-Share-Token", &token)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::OK);
    let menu_json: serde_json::Value = resp.json().await.unwrap();
    let items = menu_json["data"]["items"].as_array().unwrap();
    assert_eq!(items.len(), 2, "编辑后范围应为 api1 + doc1");

    // 旧密码登录失败（此前无密码，现在任意密码都该失败？——设置了密码后必须用新密码）
    let resp = client
        .post(format!("{base}/api/share/login"))
        .json(&serde_json::json!({ "shareId": link.id, "password": "whatever" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), reqwest::StatusCode::UNAUTHORIZED, "设密码后旧口令应失效");

    // 新密码登录成功
    let _new_token = login(&client, &base, &link.id, "newpass").await;

    // 编辑：移除密码
    let updated2 = share_repo::update_share_link(
        &db,
        &link.id,
        vec![],
        None,
        None,
        None,
        "编辑后的标题",
    )
    .unwrap();
    assert!(!updated2.has_password, "移除密码后 has_password 应为 false");

    // 移除密码后任意密码可登录
    let _ = login(&client, &base, &link.id, "anything").await;

    handle.stop().await;
}

#[tokio::test]
async fn test_share_link_full_scope_and_expiry() {
    let (db, _project_id) = setup_db();

    // 全量分享（api_menu_ids 为空 = 全部内容）
    let password_hash = apimocktle_lib::services::crypto::hash_password("pw").unwrap();
    let link = share_repo::create_share_link(
        &db,
        "p1",
        "u1",
        vec![],
        Some(password_hash),
        Some("secret".to_string()),
        None,
        "全量分享",
    )
    .unwrap();

    let (handle, port) = start_test_server(db.clone()).await;
    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::new();

    let token = login(&client, &base, &link.id, "pw").await;

    // 全量菜单：分类 + 2 接口 + 1 文档 = 4 项
    let resp = client
        .get(format!("{base}/api/share/menu"))
        .header("X-Share-Token", &token)
        .send()
        .await
        .unwrap();
    let menu_json: serde_json::Value = resp.json().await.unwrap();
    let items = menu_json["data"]["items"].as_array().unwrap();
    assert_eq!(items.len(), 4, "全量分享应返回全部 4 项");
    assert_eq!(items[0]["type"].as_str().unwrap(), "apiDetailFolder");

    // 概览统计：2 接口 + 1 文档 + 1 分类
    let resp = client
        .get(format!("{base}/api/share/overview"))
        .header("X-Share-Token", &token)
        .send()
        .await
        .unwrap();
    let ov: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(ov["data"]["apiCount"].as_u64().unwrap(), 2);
    assert_eq!(ov["data"]["docCount"].as_u64().unwrap(), 1);
    assert_eq!(ov["data"]["folderCount"].as_u64().unwrap(), 1);

    handle.stop().await;
}
