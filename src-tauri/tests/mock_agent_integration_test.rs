//! Mock Agent 跨进程集成测试
//!
//! 验证 ApiMocktle Rust 后端与 Mock Agent 之间的实际 HTTP 通信：
//! 1. 启动模拟 Agent HTTP Server（axum，随机端口）
//! 2. 通过 reqwest 发送真实 HTTP 请求
//! 3. 验证请求格式、响应解析、错误处理

use axum::{
    extract::State as AxumState,
    http::StatusCode,
    routing::{delete, get, put},
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::net::TcpListener;

// ==================== 模拟 Agent Server ====================

/// 模拟 Agent 的共享状态
#[derive(Clone, Default)]
struct MockAgentState {
    /// 存储收到的 Mock 规则
    rules: Arc<Mutex<Vec<Value>>>,
    /// 存储调用日志
    logs: Arc<Mutex<Vec<Value>>>,
    /// 是否返回错误
    force_error: Arc<Mutex<bool>>,
}

/// PUT /mock/rules — 推送规则
async fn handle_push_rules(
    AxumState(state): AxumState<MockAgentState>,
    Json(rules): Json<Vec<Value>>,
) -> (StatusCode, Json<Value>) {
    if *state.force_error.lock().unwrap() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"ok": false, "error": "Agent error"})),
        );
    }
    let count = rules.len();
    *state.rules.lock().unwrap() = rules;
    (StatusCode::OK, Json(json!({"ok": true, "count": count})))
}

/// DELETE /mock/rules — 清除规则
async fn handle_clear_rules(
    AxumState(state): AxumState<MockAgentState>,
) -> (StatusCode, Json<Value>) {
    state.rules.lock().unwrap().clear();
    state.logs.lock().unwrap().clear();
    (StatusCode::OK, Json(json!({"ok": true})))
}

/// GET /mock/logs — 获取日志
async fn handle_get_logs(
    AxumState(state): AxumState<MockAgentState>,
) -> (StatusCode, Json<Value>) {
    let logs = state.logs.lock().unwrap().clone();
    (StatusCode::OK, Json(json!(logs)))
}

/// GET /status — 状态检查
async fn handle_status() -> Json<Value> {
    Json(json!({
        "connected": true,
        "version": "1.0.0",
        "pid": std::process::id()
    }))
}

/// GET /discover — 发现可拦截的类
async fn handle_discover() -> Json<Value> {
    Json(json!({
        "feignClients": [
            {
                "className": "com.example.feign.OrderClient",
                "displayName": "OrderClient",
                "methods": [
                    {
                        "name": "createOrder",
                        "paramTypes": ["com.example.dto.CreateOrderReq"],
                        "returnType": "com.example.Result",
                        "displayName": "createOrder(CreateOrderReq) → Result"
                    }
                ]
            }
        ],
        "mappers": [
            {
                "className": "com.example.mapper.UserMapper",
                "displayName": "UserMapper",
                "methods": [
                    {
                        "name": "selectById",
                        "paramTypes": ["java.lang.Long"],
                        "returnType": "com.example.User",
                        "displayName": "selectById(Long) → User"
                    }
                ]
            }
        ],
        "status": "connected",
        "version": "1.0.0"
    }))
}

/// 启动模拟 Agent Server，返回地址
async fn start_mock_agent() -> (String, MockAgentState) {
    let state = MockAgentState::default();
    let shared = state.clone();

    let app = Router::new()
        .route("/mock/rules", put(handle_push_rules).delete(handle_clear_rules))
        .route("/mock/logs", get(handle_get_logs))
        .route("/status", get(handle_status))
        .route("/discover", get(handle_discover))
        .with_state(state);

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let url = format!("http://{}", addr);

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // 等待 server 启动
    tokio::time::sleep(Duration::from_millis(50)).await;

    (url, shared)
}

// ==================== 集成测试 ====================

/// 复用 mock_agent.rs 中的 HTTP 逻辑（直接用 reqwest）
fn build_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap()
}

/// 模拟 Rust 侧 push_mock_rules 的逻辑
async fn push_mock_rules(agent_url: &str, rules: Vec<Value>) -> Result<Value, String> {
    let client = build_client();
    let url = format!("{}/mock/rules", agent_url.trim_end_matches('/'));
    let resp = client
        .put(&url)
        .json(&rules)
        .send()
        .await
        .map_err(|e| format!("Agent 连接失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Agent 返回错误 ({}): {}", status, body));
    }

    resp.json().await.map_err(|e| format!("JSON 解析失败: {}", e))
}

/// 模拟 Rust 侧 clear_mock_rules 的逻辑
async fn clear_mock_rules(agent_url: &str) -> Result<Value, String> {
    let client = build_client();
    let url = format!("{}/mock/rules", agent_url.trim_end_matches('/'));
    let resp = client
        .delete(&url)
        .send()
        .await
        .map_err(|e| format!("Agent 连接失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Agent 返回错误 ({})", resp.status().as_u16()));
    }

    resp.json().await.map_err(|e| format!("JSON 解析失败: {}", e))
}

/// 模拟 Rust 侧 get_mock_call_logs 的逻辑
async fn get_mock_call_logs(agent_url: &str) -> Result<Vec<Value>, String> {
    let client = build_client();
    let url = format!("{}/mock/logs", agent_url.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Agent 连接失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Agent 返回错误 ({})", resp.status().as_u16()));
    }

    resp.json().await.map_err(|e| format!("JSON 解析失败: {}", e))
}

/// 模拟 Rust 侧 check_mock_agent_status 的逻辑
async fn check_status(agent_url: &str) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    let url = format!("{}/status", agent_url.trim_end_matches('/'));

    match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            resp.json().await.map_err(|e| format!("JSON 解析失败: {}", e))
        }
        _ => Ok(json!({"connected": false})),
    }
}

/// 模拟 Rust 侧 discover_mock_targets 的逻辑
async fn discover_mock_targets(agent_url: &str) -> Result<Value, String> {
    let client = build_client();
    let url = format!("{}/discover", agent_url.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Agent 连接失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Agent 返回错误 ({})", resp.status().as_u16()));
    }

    resp.json().await.map_err(|e| format!("JSON 解析失败: {}", e))
}

// ==================== 测试用例 ====================

#[tokio::test]
async fn test_full_lifecycle_push_rules_simulate_call_pull_logs_clear() {
    let (url, state) = start_mock_agent().await;

    // Step 1: 推送 Mock 规则
    let rules = vec![
        json!({
            "id": "rule-feign-1",
            "className": "com.example.feign.OrderClient",
            "methodName": "createOrder",
            "responseTemplate": r#"{"code":200,"data":{"orderId":"MOCK_001"}}"#,
        }),
        json!({
            "id": "rule-mapper-1",
            "className": "com.example.mapper.UserMapper",
            "methodName": "selectById",
            "paramTypes": ["java.lang.Long"],
            "responseTemplate": r#"{"id":1,"name":"测试用户"}"#,
        }),
    ];

    let result = push_mock_rules(&url, rules).await.unwrap();
    assert_eq!(result["ok"], true);
    assert_eq!(result["count"], 2);

    // Step 2: 验证规则已存储在 Agent 侧
    let stored_rules = state.rules.lock().unwrap();
    assert_eq!(stored_rules.len(), 2);
    assert_eq!(stored_rules[0]["id"], "rule-feign-1");
    assert_eq!(stored_rules[1]["id"], "rule-mapper-1");
    drop(stored_rules);

    // Step 3: 模拟 Agent 收集调用日志（模拟 Agent 侧的拦截行为）
    state.logs.lock().unwrap().push(json!({
        "className": "com.example.feign.OrderClient",
        "methodName": "createOrder",
        "args": [{"userId": "1"}],
        "response": {"code": 200, "data": {"orderId": "MOCK_001"}},
        "matchedRuleId": "rule-feign-1",
        "timestamp": 1700000000000u64,
        "durationMs": 5
    }));
    state.logs.lock().unwrap().push(json!({
        "className": "com.example.mapper.UserMapper",
        "methodName": "selectById",
        "args": [1],
        "response": {"id": 1, "name": "测试用户"},
        "matchedRuleId": "rule-mapper-1",
        "timestamp": 1700000000001u64,
        "durationMs": 2
    }));

    // Step 4: 通过 HTTP 拉取日志
    let logs = get_mock_call_logs(&url).await.unwrap();
    assert_eq!(logs.len(), 2);

    let feign_log = logs.iter().find(|l| l["className"].as_str().unwrap().contains("OrderClient")).unwrap();
    assert_eq!(feign_log["matchedRuleId"], "rule-feign-1");
    assert_eq!(feign_log["durationMs"], 5);

    let mapper_log = logs.iter().find(|l| l["className"].as_str().unwrap().contains("UserMapper")).unwrap();
    assert_eq!(mapper_log["matchedRuleId"], "rule-mapper-1");

    // Step 5: 清除规则
    let clear_result = clear_mock_rules(&url).await.unwrap();
    assert_eq!(clear_result["ok"], true);

    // Step 6: 验证规则和日志已清空
    assert!(state.rules.lock().unwrap().is_empty());
    let empty_logs = get_mock_call_logs(&url).await.unwrap();
    assert!(empty_logs.is_empty());
}

#[tokio::test]
async fn test_status_check_returns_connected() {
    let (url, _state) = start_mock_agent().await;

    let status = check_status(&url).await.unwrap();
    assert_eq!(status["connected"], true);
    assert_eq!(status["version"], "1.0.0");
    assert!(status["pid"].as_u64().unwrap() > 0);
}

#[tokio::test]
async fn test_status_check_when_server_down_returns_disconnected() {
    // 使用一个不存在的端口
    let result = check_status("http://127.0.0.1:1").await;
    // 超时或连接拒绝应返回 connected: false
    // reqwest 会返回错误，我们捕获后返回 disconnected
    assert!(result.is_err() || result.unwrap()["connected"] == false);
}

#[tokio::test]
async fn test_discover_returns_feign_and_mapper() {
    let (url, _state) = start_mock_agent().await;

    let result = discover_mock_targets(&url).await.unwrap();

    let feign = result["feignClients"].as_array().unwrap();
    assert_eq!(feign.len(), 1);
    assert_eq!(feign[0]["className"], "com.example.feign.OrderClient");
    assert_eq!(feign[0]["displayName"], "OrderClient");

    let methods = feign[0]["methods"].as_array().unwrap();
    assert_eq!(methods.len(), 1);
    assert_eq!(methods[0]["name"], "createOrder");

    let mappers = result["mappers"].as_array().unwrap();
    assert_eq!(mappers.len(), 1);
    assert_eq!(mappers[0]["className"], "com.example.mapper.UserMapper");
}

#[tokio::test]
async fn test_push_empty_rules() {
    let (url, state) = start_mock_agent().await;

    let result = push_mock_rules(&url, vec![]).await.unwrap();
    assert_eq!(result["ok"], true);
    assert_eq!(result["count"], 0);
    assert!(state.rules.lock().unwrap().is_empty());
}

#[tokio::test]
async fn test_push_large_batch_rules() {
    let (url, state) = start_mock_agent().await;

    let rules: Vec<Value> = (0..100)
        .map(|i| {
            json!({
                "id": format!("rule-{}", i),
                "className": format!("com.example.Service{}", i),
                "methodName": format!("method{}", i),
                "responseTemplate": format!(r#"{{"index":{}}}"#, i),
            })
        })
        .collect();

    let result = push_mock_rules(&url, rules).await.unwrap();
    assert_eq!(result["ok"], true);
    assert_eq!(result["count"], 100);
    assert_eq!(state.rules.lock().unwrap().len(), 100);
}

#[tokio::test]
async fn test_json_serialization_roundtrip() {
    let (url, state) = start_mock_agent().await;

    // 推送包含中文和特殊字符的规则
    let rules = vec![json!({
        "id": "rule-chinese",
        "className": "com.example.服务",
        "methodName": "处理请求",
        "paramTypes": ["com.example.dto.RequestDto"],
        "responseTemplate": r#"{"message":"成功","data":{"name":"测试用户","金额":99.9}}"#,
        "responseDelay": 100,
        "maxTimes": 5,
    })];

    let result = push_mock_rules(&url, rules).await.unwrap();
    assert_eq!(result["ok"], true);

    // 验证中文数据完整传输
    let stored = &state.rules.lock().unwrap()[0];
    assert_eq!(stored["className"], "com.example.服务");
    assert_eq!(stored["methodName"], "处理请求");
    assert_eq!(stored["responseDelay"], 100);
    assert_eq!(stored["maxTimes"], 5);

    // 验证 responseTemplate 中的中文
    let template = stored["responseTemplate"].as_str().unwrap();
    assert!(template.contains("成功"));
    assert!(template.contains("测试用户"));
}

#[tokio::test]
async fn test_multiple_push_overwrites_previous_rules() {
    let (url, state) = start_mock_agent().await;

    // 第一次推送
    let rules1 = vec![json!({"id": "r1", "className": "A", "methodName": "a", "responseTemplate": "{}"})];
    push_mock_rules(&url, rules1).await.unwrap();
    assert_eq!(state.rules.lock().unwrap().len(), 1);
    assert_eq!(state.rules.lock().unwrap()[0]["id"], "r1");

    // 第二次推送应覆盖
    let rules2 = vec![
        json!({"id": "r2", "className": "B", "methodName": "b", "responseTemplate": "{}"}),
        json!({"id": "r3", "className": "C", "methodName": "c", "responseTemplate": "{}"}),
    ];
    push_mock_rules(&url, rules2).await.unwrap();
    assert_eq!(state.rules.lock().unwrap().len(), 2);
    assert_eq!(state.rules.lock().unwrap()[0]["id"], "r2");
    assert_eq!(state.rules.lock().unwrap()[1]["id"], "r3");
}
