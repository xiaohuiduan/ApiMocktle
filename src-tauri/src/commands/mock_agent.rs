use crate::models::ApiResult;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

fn api_ok<T: Serialize>(data: T) -> ApiResult<T> {
    ApiResult { ok: true, data: Some(data), error: None }
}

fn api_err<T: Serialize>(msg: &str) -> ApiResult<T> {
    ApiResult { ok: false, data: None, error: Some(msg.to_string()) }
}

// ==================== 数据结构 ====================

/// 推送到 Agent 的单条 Mock 规则
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockRulePayload {
    pub id: String,
    pub className: String,
    pub methodName: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paramTypes: Option<Vec<String>>,
    pub responseTemplate: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub responseDelay: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub maxTimes: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub return_type: Option<String>,
}

/// Mock 调用日志条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockCallLogEntry {
    pub className: String,
    pub methodName: String,
    pub args: Vec<serde_json::Value>,
    pub response: serde_json::Value,
    pub matchedRuleId: String,
    pub timestamp: u64,
    pub durationMs: u64,
}

/// Agent 连接状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub connected: bool,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub pid: Option<u64>,
}

// ==================== HTTP Client 工具 ====================

fn build_agent_client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .expect("Failed to build HTTP client")
}

fn build_url(base: &str, path: &str) -> String {
    let base = base.trim_end_matches('/');
    format!("{}{}", base, path)
}

// ==================== Tauri Commands ====================

/// 推送 Mock 规则到 Agent
#[tauri::command]
pub async fn push_mock_rules(
    agent_url: String,
    rules: Vec<MockRulePayload>,
) -> Result<ApiResult<serde_json::Value>, String> {
    let client = build_agent_client();
    let url = build_url(&agent_url, "/mock/rules");

    let resp = client
        .put(&url)
        .json(&rules)
        .send()
        .await
        .map_err(|e| format!("Agent 连接失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Ok(api_err(&format!(
            "Agent 返回错误 ({}): {}",
            status, body
        )));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .unwrap_or(serde_json::json!({"ok": true}));
    Ok(api_ok(body))
}

/// 清除 Agent 上的 Mock 规则
#[tauri::command]
pub async fn clear_mock_rules(agent_url: String) -> Result<ApiResult<serde_json::Value>, String> {
    let client = build_agent_client();
    let url = build_url(&agent_url, "/mock/rules");

    let resp = client
        .delete(&url)
        .send()
        .await
        .map_err(|e| format!("Agent 连接失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        return Ok(api_err(&format!("Agent 返回错误 ({})", status)));
    }

    Ok(api_ok(serde_json::json!({"ok": true})))
}

/// 获取 Agent 调用日志
#[tauri::command]
pub async fn get_mock_call_logs(
    agent_url: String,
) -> Result<ApiResult<Vec<MockCallLogEntry>>, String> {
    let client = build_agent_client();
    let url = build_url(&agent_url, "/mock/logs");

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Agent 连接失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        return Ok(api_err(&format!("Agent 返回错误 ({})", status)));
    }

    let logs: Vec<MockCallLogEntry> = resp.json().await.unwrap_or_default();
    Ok(api_ok(logs))
}

/// 发现 Agent 上可拦截的类
#[tauri::command]
pub async fn discover_mock_targets(
    agent_url: String,
) -> Result<ApiResult<serde_json::Value>, String> {
    let client = build_agent_client();
    let url = build_url(&agent_url, "/discover");

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Agent 连接失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        return Ok(api_err(&format!("Agent 返回错误 ({})", status)));
    }

    let body: serde_json::Value = resp.json().await.unwrap_or_default();
    Ok(api_ok(body))
}

/// 检查 Agent 连接状态
#[tauri::command]
pub async fn check_mock_agent_status(
    agent_url: String,
) -> Result<ApiResult<AgentStatus>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| format!("构建 HTTP Client 失败: {}", e))?;

    let url = build_url(&agent_url, "/status");

    match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let status: AgentStatus = resp.json().await.unwrap_or(AgentStatus {
                connected: true,
                version: None,
                pid: None,
            });
            Ok(api_ok(status))
        }
        _ => Ok(api_ok(AgentStatus {
            connected: false,
            version: None,
            pid: None,
        })),
    }
}

// ==================== 单元测试 ====================

#[cfg(test)]
mod tests {
    use super::*;

    // ---- MockRulePayload 序列化/反序列化 ----

    #[test]
    fn test_mock_rule_payload_serialization() {
        let rule = MockRulePayload {
            id: "rule-1".to_string(),
            className: "com.example.feign.OrderClient".to_string(),
            methodName: "createOrder".to_string(),
            paramTypes: Some(vec!["com.example.dto.CreateOrderReq".to_string()]),
            responseTemplate: r#"{"code":200,"data":{}}"#.to_string(),
            responseDelay: Some(100),
            maxTimes: Some(5),
            return_type: Some("com.example.dto.OrderResult".to_string()),
        };

        let json = serde_json::to_string(&rule).unwrap();
        assert!(json.contains("\"id\":\"rule-1\""));
        assert!(json.contains("\"className\":\"com.example.feign.OrderClient\""));
        assert!(json.contains("\"responseDelay\":100"));
        assert!(json.contains("\"maxTimes\":5"));
        assert!(json.contains("\"return_type\":\"com.example.dto.OrderResult\""));
    }

    #[test]
    fn test_mock_rule_payload_deserialization_minimal() {
        let json = r#"{
            "id": "r1",
            "className": "com.example.A",
            "methodName": "foo",
            "responseTemplate": "{}"
        }"#;

        let rule: MockRulePayload = serde_json::from_str(json).unwrap();
        assert_eq!(rule.id, "r1");
        assert_eq!(rule.className, "com.example.A");
        assert_eq!(rule.methodName, "foo");
        assert_eq!(rule.responseTemplate, "{}");
        assert!(rule.paramTypes.is_none());
        assert!(rule.responseDelay.is_none());
        assert!(rule.maxTimes.is_none());
        assert!(rule.return_type.is_none());
    }

    #[test]
    fn test_mock_rule_payload_roundtrip() {
        let rule = MockRulePayload {
            id: "r2".to_string(),
            className: "com.example.mapper.UserMapper".to_string(),
            methodName: "selectById".to_string(),
            paramTypes: None,
            responseTemplate: r#"{"id":1,"name":"test"}"#.to_string(),
            responseDelay: None,
            maxTimes: None,
            return_type: None,
        };

        let json = serde_json::to_string(&rule).unwrap();
        let deserialized: MockRulePayload = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, rule.id);
        assert_eq!(deserialized.className, rule.className);
        assert_eq!(deserialized.methodName, rule.methodName);
        assert_eq!(deserialized.responseTemplate, rule.responseTemplate);
    }

    // ---- MockCallLogEntry 序列化/反序列化 ----

    #[test]
    fn test_mock_call_log_entry_deserialization() {
        let json = r#"{
            "className": "com.example.feign.OrderClient",
            "methodName": "createOrder",
            "args": [{"userId": "1"}],
            "response": {"code": 200, "data": {"orderId": "MOCK_1"}},
            "matchedRuleId": "rule-1",
            "timestamp": 1700000000000,
            "durationMs": 5
        }"#;

        let log: MockCallLogEntry = serde_json::from_str(json).unwrap();
        assert_eq!(log.className, "com.example.feign.OrderClient");
        assert_eq!(log.methodName, "createOrder");
        assert_eq!(log.args.len(), 1);
        assert_eq!(log.matchedRuleId, "rule-1");
        assert_eq!(log.durationMs, 5);
    }

    #[test]
    fn test_mock_call_log_entry_empty_args() {
        let json = r#"{
            "className": "com.example.A",
            "methodName": "bar",
            "args": [],
            "response": null,
            "matchedRuleId": "r2",
            "timestamp": 0,
            "durationMs": 0
        }"#;

        let log: MockCallLogEntry = serde_json::from_str(json).unwrap();
        assert!(log.args.is_empty());
    }

    // ---- AgentStatus 序列化/反序列化 ----

    #[test]
    fn test_agent_status_connected() {
        let json = r#"{"connected": true, "version": "1.0.0", "pid": 12345}"#;
        let status: AgentStatus = serde_json::from_str(json).unwrap();
        assert!(status.connected);
        assert_eq!(status.version, Some("1.0.0".to_string()));
        assert_eq!(status.pid, Some(12345));
    }

    #[test]
    fn test_agent_status_disconnected_defaults() {
        let json = r#"{"connected": false}"#;
        let status: AgentStatus = serde_json::from_str(json).unwrap();
        assert!(!status.connected);
        assert!(status.version.is_none());
        assert!(status.pid.is_none());
    }

    // ---- agent_url 拼接 ----

    #[test]
    fn test_build_url_basic() {
        assert_eq!(build_url("http://localhost:19876", "/mock/rules"), "http://localhost:19876/mock/rules");
    }

    #[test]
    fn test_build_url_trailing_slash() {
        assert_eq!(build_url("http://localhost:19876/", "/mock/rules"), "http://localhost:19876/mock/rules");
    }

    #[test]
    fn test_build_url_multiple_trailing_slashes() {
        assert_eq!(build_url("http://localhost:19876///", "/discover"), "http://localhost:19876/discover");
    }

    // ---- 批量规则序列化 ----

    #[test]
    fn test_batch_rules_serialization() {
        let rules = vec![
            MockRulePayload {
                id: "r1".to_string(),
                className: "com.example.A".to_string(),
                methodName: "foo".to_string(),
                paramTypes: None,
                responseTemplate: "{}".to_string(),
                responseDelay: None,
                maxTimes: None,
                return_type: None,
            },
            MockRulePayload {
                id: "r2".to_string(),
                className: "com.example.B".to_string(),
                methodName: "bar".to_string(),
                paramTypes: Some(vec!["java.lang.String".to_string()]),
                responseTemplate: r#"{"result":"ok"}"#.to_string(),
                responseDelay: Some(50),
                maxTimes: Some(10),
                return_type: Some("com.example.dto.Result".to_string()),
            },
        ];

        let json = serde_json::to_string(&rules).unwrap();
        let deserialized: Vec<MockRulePayload> = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.len(), 2);
        assert_eq!(deserialized[0].id, "r1");
        assert_eq!(deserialized[1].id, "r2");
        assert_eq!(deserialized[1].paramTypes.as_ref().unwrap().len(), 1);
    }

    // ---- 边界情况 ----

    #[test]
    fn test_mock_rule_empty_response_template() {
        let rule = MockRulePayload {
            id: "r3".to_string(),
            className: "com.example.C".to_string(),
            methodName: "baz".to_string(),
            paramTypes: None,
            responseTemplate: "".to_string(),
            responseDelay: None,
            maxTimes: None,
            return_type: None,
        };
        let json = serde_json::to_string(&rule).unwrap();
        let deserialized: MockRulePayload = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.responseTemplate, "");
    }

    #[test]
    fn test_mock_rule_chinese_in_response() {
        let rule = MockRulePayload {
            id: "r4".to_string(),
            className: "com.example.D".to_string(),
            methodName: "get".to_string(),
            paramTypes: None,
            responseTemplate: r#"{"message":"成功","name":"测试用户"}"#.to_string(),
            responseDelay: None,
            maxTimes: None,
            return_type: None,
        };
        let json = serde_json::to_string(&rule).unwrap();
        assert!(json.contains("成功"));
        assert!(json.contains("测试用户"));
        let deserialized: MockRulePayload = serde_json::from_str(&json).unwrap();
        assert!(deserialized.responseTemplate.contains("成功"));
    }
}
