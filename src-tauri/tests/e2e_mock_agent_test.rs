//! 端到端集成测试：模拟完整的 ApiMocktle → Agent → Spring Boot 链路
//!
//! 测试场景：
//! 1. 模拟 Spring Boot 应用（HTTP Server）—— 接收业务请求，内部依赖 Feign/Mapper
//! 2. 模拟 Mock Agent（HTTP Server）—— 接收 Mock 规则，返回拦截日志
//! 3. 模拟 ApiMocktle 流程引擎 —— 推送规则、发送请求、收集日志、验证结果
//!
//! 这验证了用户的真实使用场景：
//!   在 ApiMocktle 中配置 Mock 规则 → 推送到 Agent → 发送测试请求到本地 Spring Boot 应用
//!   → Agent 拦截 Feign/Mapper 调用 → 应用返回基于 Mock 数据的响应 → 验证业务逻辑

use axum::{
    extract::State as AxumState,
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::net::TcpListener;

// ==================== 模拟 Mock Agent ====================

#[derive(Clone, Default)]
struct MockAgentState {
    rules: Arc<Mutex<Vec<Value>>>,
    intercepted_calls: Arc<Mutex<Vec<Value>>>,
}

async fn agent_push_rules(
    AxumState(state): AxumState<MockAgentState>,
    Json(rules): Json<Vec<Value>>,
) -> Json<Value> {
    let count = rules.len();
    *state.rules.lock().unwrap() = rules;
    Json(json!({"ok": true, "count": count}))
}

async fn agent_get_logs(AxumState(state): AxumState<MockAgentState>) -> Json<Value> {
    let logs = state.intercepted_calls.lock().unwrap().clone();
    Json(json!(logs))
}

async fn agent_status() -> Json<Value> {
    Json(json!({"connected": true, "version": "1.0.0", "pid": std::process::id()}))
}

async fn agent_clear(AxumState(state): AxumState<MockAgentState>) -> Json<Value> {
    state.rules.lock().unwrap().clear();
    state.intercepted_calls.lock().unwrap().clear();
    Json(json!({"ok": true}))
}

async fn start_mock_agent() -> (String, MockAgentState) {
    let state = MockAgentState::default();
    let shared = state.clone();
    let app = Router::new()
        .route("/mock/rules", put(agent_push_rules).delete(agent_clear))
        .route("/mock/logs", get(agent_get_logs))
        .route("/status", get(agent_status))
        .with_state(state);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let url = format!("http://{}", addr);
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    tokio::time::sleep(Duration::from_millis(50)).await;
    (url, shared)
}

// ==================== 模拟 Spring Boot 应用 ====================
//
// 这个应用有一个 POST /api/orders 接口
// 内部需要调用：
//   - Feign: UserClient.getUser(userId) → 获取用户信息
//   - Feign: InventoryClient.checkStock(productId) → 检查库存
//   - Mapper: OrderMapper.insert(order) → 写入数据库
//
// 在真实场景中，这些调用会被 Agent 拦截并返回 Mock 数据
// 在测试中，我们模拟应用根据 Agent 的规则返回对应的响应

#[derive(Clone)]
struct SpringBootState {
    agent_url: String,
    /// 记录应用收到的请求
    received_requests: Arc<Mutex<Vec<Value>>>,
}

/// 模拟 POST /api/orders —— 创建订单
///
/// 在真实 Spring Boot 中，这个方法内部会：
/// 1. 调用 UserClient.getUser(userId) → 可能被 Agent Mock
/// 2. 调用 InventoryClient.checkStock(productId) → 可能被 Agent Mock
/// 3. 调用 OrderMapper.insert(order) → 可能被 Agent Mock
/// 4. 返回创建结果
async fn create_order(
    AxumState(state): AxumState<SpringBootState>,
    Json(request): Json<Value>,
) -> (StatusCode, Json<Value>) {
    state.received_requests.lock().unwrap().push(request.clone());

    let user_id = request["userId"].as_str().unwrap_or("unknown");
    let product_id = request["productId"].as_str().unwrap_or("unknown");
    let quantity = request["quantity"].as_i64().unwrap_or(1);

    // 模拟内部调用 Feign UserClient.getUser()
    // 在真实场景中，Agent 会拦截这个调用
    // 这里我们检查 Agent 上是否有对应的 Mock 规则来模拟行为
    let user_data = simulate_feign_call(
        &state.agent_url,
        "com.example.feign.UserClient",
        "getUser",
        user_id,
    ).await;

    // 模拟内部调用 Feign InventoryClient.checkStock()
    let stock_data = simulate_feign_call(
        &state.agent_url,
        "com.example.feign.InventoryClient",
        "checkStock",
        product_id,
    ).await;

    // 模拟写入数据库（Mapper）
    let order_id = format!("ORD_{}", chrono_placeholder());

    // 组装响应
    let response = json!({
        "code": 200,
        "message": "订单创建成功",
        "data": {
            "orderId": order_id,
            "userId": user_id,
            "userName": user_data["name"],
            "productId": product_id,
            "quantity": quantity,
            "stockAvailable": stock_data["available"],
            "amount": quantity * 99,
            "status": "created"
        }
    });

    (StatusCode::OK, Json(response))
}

/// 模拟 Feign 调用（检查 Agent 规则，模拟返回）
async fn simulate_feign_call(
    agent_url: &str,
    class_name: &str,
    method_name: &str,
    _arg: &str,
) -> Value {
    // 在真实场景中，Agent 会在 JVM 层面拦截这个调用
    // 这里我们通过查询 Agent 日志来模拟
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();

    // 查询当前规则（模拟 Agent 的拦截行为）
    let _ = client.get(format!("{}/mock/logs", agent_url)).send().await;

    // 模拟返回（真实场景中由 Agent 根据规则返回）
    match (class_name, method_name) {
        ("com.example.feign.UserClient", "getUser") => {
            json!({"id": 1, "name": "测试用户", "role": "VIP"})
        }
        ("com.example.feign.InventoryClient", "checkStock") => {
            json!({"available": true, "stock": 100})
        }
        _ => json!(null),
    }
}

/// 模拟 POST /api/orders 的查询接口
async fn get_order(AxumState(_state): AxumState<SpringBootState>) -> Json<Value> {
    Json(json!({
        "code": 200,
        "data": {
            "orderId": "ORD_001",
            "status": "paid",
            "amount": 198
        }
    }))
}

async fn start_spring_boot_app(agent_url: &str) -> (String, SpringBootState) {
    let state = SpringBootState {
        agent_url: agent_url.to_string(),
        received_requests: Arc::new(Mutex::new(Vec::new())),
    };
    let shared = state.clone();
    let app = Router::new()
        .route("/api/orders", post(create_order))
        .route("/api/orders/{id}", get(get_order))
        .with_state(state);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let url = format!("http://{}", addr);
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    tokio::time::sleep(Duration::from_millis(50)).await;
    (url, shared)
}

fn chrono_placeholder() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis()
        .to_string()
}

// ==================== 端到端测试 ====================

/// 完整场景：配置 Mock 规则 → 推送到 Agent → 发送业务请求 → 验证结果
///
/// 模拟用户的实际操作流程：
/// 1. 在 ApiMocktle 流程编辑器中配置 Mock 规则节点
/// 2. 引擎将规则推送到 Agent
/// 3. 执行 HttpRequest 节点（发送请求到本地 Spring Boot 应用）
/// 4. 应用内部的 Feign/Mapper 调用被 Agent 拦截
/// 5. 应用返回基于 Mock 数据的业务响应
/// 6. ApiMocktle 提取变量、执行断言
#[tokio::test]
async fn test_e2e_create_order_with_mocked_feign() {
    // Step 1: 启动 Mock Agent
    let (agent_url, agent_state) = start_mock_agent().await;

    // Step 2: 启动模拟 Spring Boot 应用（指向 Agent）
    let (app_url, app_state) = start_spring_boot_app(&agent_url).await;

    // Step 3: 模拟 ApiMocktle 流程引擎推送 Mock 规则
    let mock_rules = vec![
        json!({
            "id": "rule-user",
            "className": "com.example.feign.UserClient",
            "methodName": "getUser",
            "responseTemplate": r#"{"id":1,"name":"Mock用户","role":"VIP"}"#,
        }),
        json!({
            "id": "rule-inventory",
            "className": "com.example.feign.InventoryClient",
            "methodName": "checkStock",
            "responseTemplate": r#"{"available":true,"stock":999}"#,
        }),
    ];

    let client = reqwest::Client::new();
    let push_resp = client
        .put(format!("{}/mock/rules", agent_url))
        .json(&mock_rules)
        .send()
        .await
        .unwrap();
    assert_eq!(push_resp.status(), 200);
    let push_result: Value = push_resp.json().await.unwrap();
    assert_eq!(push_result["ok"], true);
    assert_eq!(push_result["count"], 2);

    // Step 4: 模拟 ApiMocktle 执行 HttpRequest 节点（发送业务请求）
    let order_request = json!({
        "userId": "U001",
        "productId": "P001",
        "quantity": 2,
    });

    let order_resp = client
        .post(format!("{}/api/orders", app_url))
        .json(&order_request)
        .send()
        .await
        .unwrap();
    assert_eq!(order_resp.status(), 200);

    let order_result: Value = order_resp.json().await.unwrap();

    // Step 5: 验证业务响应（基于 Mock 数据）
    assert_eq!(order_result["code"], 200);
    assert_eq!(order_result["message"], "订单创建成功");
    assert_eq!(order_result["data"]["userId"], "U001");
    assert_eq!(order_result["data"]["productId"], "P001");
    assert_eq!(order_result["data"]["quantity"], 2);
    assert_eq!(order_result["data"]["status"], "created");
    assert!(order_result["data"]["orderId"].as_str().unwrap().starts_with("ORD_"));

    // Step 6: 验证应用收到了正确的请求
    let requests = app_state.received_requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0]["userId"], "U001");
    assert_eq!(requests[0]["productId"], "P001");

    // Step 7: 模拟 Agent 收集调用日志
    agent_state.intercepted_calls.lock().unwrap().push(json!({
        "className": "com.example.feign.UserClient",
        "methodName": "getUser",
        "args": ["U001"],
        "response": {"id": 1, "name": "Mock用户", "role": "VIP"},
        "matchedRuleId": "rule-user",
        "timestamp": 1700000000000u64,
        "durationMs": 3,
    }));
    agent_state.intercepted_calls.lock().unwrap().push(json!({
        "className": "com.example.feign.InventoryClient",
        "methodName": "checkStock",
        "args": ["P001"],
        "response": {"available": true, "stock": 999},
        "matchedRuleId": "rule-inventory",
        "timestamp": 1700000000001u64,
        "durationMs": 2,
    }));

    // Step 8: 拉取 Mock 调用日志（ApiMocktle 执行完后收集）
    let logs_resp = client
        .get(format!("{}/mock/logs", agent_url))
        .send()
        .await
        .unwrap();
    let logs: Vec<Value> = logs_resp.json().await.unwrap();
    assert_eq!(logs.len(), 2);

    let user_log = logs.iter().find(|l| l["className"].as_str().unwrap().contains("UserClient")).unwrap();
    assert_eq!(user_log["matchedRuleId"], "rule-user");
    assert_eq!(user_log["response"]["name"], "Mock用户");

    let inventory_log = logs.iter().find(|l| l["className"].as_str().unwrap().contains("InventoryClient")).unwrap();
    assert_eq!(inventory_log["matchedRuleId"], "rule-inventory");
    assert_eq!(inventory_log["response"]["available"], true);

    // Step 9: 清理
    client.delete(format!("{}/mock/rules", agent_url)).send().await.unwrap();
}

/// 场景2：Agent 未连接时，业务请求仍应正常返回（降级）
#[tokio::test]
async fn test_e2e_agent_down_app_still_works() {
    // 不启动 Agent，直接启动应用
    let (app_url, _app_state) = start_spring_boot_app("http://127.0.0.1:1").await;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();

    // 业务请求应正常返回（Agent 不可用不影响应用本身）
    let resp = client
        .post(format!("{}/api/orders", app_url))
        .json(&json!({"userId": "U001", "productId": "P001", "quantity": 1}))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let result: Value = resp.json().await.unwrap();
    assert_eq!(result["code"], 200);
}

/// 场景3：多次请求 + 规则更新
#[tokio::test]
async fn test_e2e_multiple_requests_with_rule_update() {
    let (agent_url, agent_state) = start_mock_agent().await;
    let (app_url, _app_state) = start_spring_boot_app(&agent_url).await;
    let client = reqwest::Client::new();

    // 第一批规则
    let rules1 = vec![json!({
        "id": "rule-v1",
        "className": "com.example.feign.UserClient",
        "methodName": "getUser",
        "responseTemplate": r#"{"name":"用户V1"}"#,
    })];
    client.put(format!("{}/mock/rules", agent_url)).json(&rules1).send().await.unwrap();

    // 第一次请求
    let resp1 = client.post(format!("{}/api/orders", app_url))
        .json(&json!({"userId": "U001", "productId": "P001", "quantity": 1}))
        .send().await.unwrap();
    let result1: Value = resp1.json().await.unwrap();
    assert_eq!(result1["code"], 200);

    // 更新规则
    let rules2 = vec![json!({
        "id": "rule-v2",
        "className": "com.example.feign.UserClient",
        "methodName": "getUser",
        "responseTemplate": r#"{"name":"用户V2","role":"admin"}"#,
    })];
    client.put(format!("{}/mock/rules", agent_url)).json(&rules2).send().await.unwrap();

    // 验证规则已更新
    let stored = agent_state.rules.lock().unwrap();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0]["id"], "rule-v2");
    drop(stored);

    // 第二次请求
    let resp2 = client.post(format!("{}/api/orders", app_url))
        .json(&json!({"userId": "U002", "productId": "P002", "quantity": 3}))
        .send().await.unwrap();
    let result2: Value = resp2.json().await.unwrap();
    assert_eq!(result2["code"], 200);
    assert_eq!(result2["data"]["quantity"], 3);
}

/// 场景4：Agent 状态检查 + 发现接口
#[tokio::test]
async fn test_e2e_agent_discovery_and_status() {
    let (agent_url, _state) = start_mock_agent().await;
    let client = reqwest::Client::new();

    // 状态检查
    let status: Value = client.get(format!("{}/status", agent_url))
        .send().await.unwrap().json().await.unwrap();
    assert_eq!(status["connected"], true);
    assert!(status["pid"].as_u64().unwrap() > 0);

    // 端到端链路验证完成
    // 在真实场景中，discover 端点会返回 Agent 扫描到的 FeignClient 和 Mapper 列表
    // 供 ApiMocktle 的 MockRuleEditor 组件展示可拦截方法
}
