use std::collections::HashMap;
use serde_json::Value as JsonValue;

use crate::db::menu_repo;
use crate::db::client::Db;

/// 为指定项目生成完整的 AI Prompt（markdown 格式）
pub fn generate_flow_prompt(db: &Db, project_id: &str) -> Result<String, String> {
    // 1. 获取所有菜单项
    let items = menu_repo::list_menu_items(db, project_id)
        .map_err(|e| format!("获取菜单项失败: {}", e))?;

    // 2. 构建 $ref schema 查找表
    let mut schema_map: HashMap<String, JsonValue> = HashMap::new();
    for item in &items {
        if item.menu_type != "apiSchema" { continue; }
        if let Some(data) = &item.data_json {
            if let Some(schema) = data.get("jsonSchema") {
                let key1 = format!("#/components/schemas/{}", item.name);
                let key2 = format!("#/definitions/{}", item.name);
                schema_map.insert(key1, schema.clone());
                schema_map.insert(key2, schema.clone());
            }
        }
    }

    // 3. 为每个 apiDetail 生成接口文档
    let mut api_docs = String::new();
    let mut idx = 0;
    for item in &items {
        if item.menu_type != "apiDetail" { continue; }
        let d = match &item.data_json {
            Some(v) => v,
            None => continue,
        };
        idx += 1;
        let method = d.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
        let path = d.get("path").and_then(|v| v.as_str()).unwrap_or("");
        let desc = d.get("description").or_else(|| d.get("desc"))
            .and_then(|v| v.as_str()).unwrap_or("");

        api_docs.push_str(&format!("### {}. {}\n\n", idx, item.name));
        api_docs.push_str(&format!("- menuItemId: `{}`\n", item.id));
        api_docs.push_str(&format!("- 方法: {}\n", method.to_uppercase()));
        api_docs.push_str(&format!("- 路径: {}\n", path));
        if !desc.is_empty() {
            api_docs.push_str(&format!("- 说明: {}\n", desc));
        }

        // Query 参数
        if let Some(qp) = d.get("req_query").and_then(|v| v.as_array()) {
            if !qp.is_empty() {
                api_docs.push_str("- Query 参数:\n");
                for p in qp {
                    let name = p.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let required = p.get("required").map(|v| v == "1" || v == 1 || v == true).unwrap_or(false);
                    let req_str = if required { "必填" } else { "可选" };
                    let desc_val = p.get("desc").and_then(|v| v.as_str()).unwrap_or("");
                    if desc_val.is_empty() {
                        api_docs.push_str(&format!("    - {}: {}\n", name, req_str));
                    } else {
                        api_docs.push_str(&format!("    - {}: {} ({})\n", name, req_str, desc_val));
                    }
                }
            }
        }

        // OpenAPI query 参数
        if let Some(params) = d.get("parameters") {
            if let Some(sections) = format_openapi_params(params, &schema_map) {
                api_docs.push_str(&sections);
            }
        }

        // 请求体
        let req_body = format_request_body(d, &schema_map);
        if let Some(body) = req_body {
            api_docs.push_str(&format!("- 请求体参数:\n\n```json\n{}\n```\n", body));
        }

        // 响应体
        let resp_body = format_response_body(d, &schema_map);
        if let Some(body) = resp_body {
            api_docs.push_str(&format!("- 响应体结构:\n\n```json\n{}\n```\n", body));
        }
    }

    if api_docs.is_empty() {
        api_docs = "（当前项目暂无 API 接口，请在项目中先添加 API 定义）".to_string();
    }

    // 4. 填充模板
    Ok(PROMPT_TEMPLATE.replace("{{apiDocs}}", &api_docs))
}

// ==================== Schema 解析 ====================

fn resolve_schema(schema: &JsonValue, schema_map: &HashMap<String, JsonValue>, visited: &mut std::collections::HashSet<String>) -> JsonValue {
    let obj = match schema.as_object() {
        Some(o) => o,
        None => return schema.clone(),
    };

    // $ref 解析
    if let Some(ref_path) = obj.get("$ref").and_then(|v| v.as_str()) {
        if visited.contains(ref_path) {
            return serde_json::json!({"type": "object", "description": "(循环引用)"});
        }
        visited.insert(ref_path.to_string());
        if let Some(resolved) = schema_map.get(ref_path) {
            return resolve_schema(resolved, schema_map, visited);
        }
        return serde_json::json!({"type": "object", "description": format!("(未找到: {})", ref_path)});
    }

    // allOf 合并
    if let Some(allof) = obj.get("allOf").and_then(|v| v.as_array()) {
        let mut merged_props = serde_json::Map::new();
        let mut merged_required: Vec<String> = Vec::new();
        let mut merged_desc: Option<String> = None;
        for sub in allof {
            let resolved = resolve_schema(sub, schema_map, &mut visited.clone());
            if let Some(props) = resolved.get("properties").and_then(|v| v.as_object()) {
                for (k, v) in props {
                    merged_props.insert(k.clone(), v.clone());
                }
            }
            if let Some(req) = resolved.get("required").and_then(|v| v.as_array()) {
                for r in req {
                    if let Some(s) = r.as_str() {
                        merged_required.push(s.to_string());
                    }
                }
            }
            if merged_desc.is_none() {
                merged_desc = resolved.get("description").and_then(|v| v.as_str()).map(|s| s.to_string());
            }
        }
        let mut merged = serde_json::json!({"type": "object", "properties": merged_props});
        if !merged_required.is_empty() {
            merged["required"] = serde_json::json!(merged_required);
        }
        if let Some(d) = merged_desc {
            merged["description"] = serde_json::json!(d);
        }
        return merged;
    }

    // oneOf / anyOf
    for key in &["oneOf", "anyOf"] {
        if let Some(arr) = obj.get(*key).and_then(|v| v.as_array()) {
            for sub in arr {
                let resolved = resolve_schema(sub, schema_map, &mut visited.clone());
                if resolved.get("properties").is_some() {
                    return resolved;
                }
            }
        }
    }

    schema.clone()
}

// ==================== Schema → JSON 示例 ====================

fn schema_to_example(schema: &JsonValue, schema_map: &HashMap<String, JsonValue>) -> JsonValue {
    let resolved = resolve_schema(schema, schema_map, &mut std::collections::HashSet::new());
    let props = match resolved.get("properties") {
        Some(p) => p,
        None => return serde_json::json!({}),
    };
    let _required_set: std::collections::HashSet<String> = resolved.get("required")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let mut result = serde_json::Map::new();

    if let Some(obj) = props.as_object() {
        for (name, prop) in obj {
            if let Some(children) = prop.get("properties") {
                // 嵌套对象
                let child_schema = serde_json::json!({"type": "object", "properties": children, "required": prop.get("required")});
                result.insert(name.clone(), schema_to_example(&child_schema, schema_map));
            } else if prop.get("type").and_then(|v| v.as_str()) == Some("array") {
                if let Some(items) = prop.get("items") {
                    result.insert(name.clone(), serde_json::json!([schema_to_example(items, schema_map)]));
                } else {
                    result.insert(name.clone(), serde_json::json!([]));
                }
            } else {
                result.insert(name.clone(), type_to_example(prop));
            }
        }
    } else if let Some(arr) = props.as_array() {
        // 数组格式属性
        for prop in arr {
            let name = match prop.get("name").and_then(|v| v.as_str()) {
                Some(n) => n,
                None => continue,
            };
            if let Some(children) = prop.get("properties") {
                let child_schema = serde_json::json!({"type": "object", "properties": children});
                result.insert(name.to_string(), schema_to_example(&child_schema, schema_map));
            } else if prop.get("type").and_then(|v| v.as_str()) == Some("array") {
                if let Some(items) = prop.get("items") {
                    result.insert(name.to_string(), serde_json::json!([schema_to_example(items, schema_map)]));
                } else {
                    result.insert(name.to_string(), serde_json::json!([]));
                }
            } else {
                result.insert(name.to_string(), type_to_example(prop));
            }
        }
    }

    serde_json::Value::Object(result)
}

fn type_to_example(prop: &JsonValue) -> JsonValue {
    let t = if prop.get("allOf").is_some() || prop.get("oneOf").is_some() || prop.get("anyOf").is_some() {
        "object"
    } else {
        prop.get("type").and_then(|v| v.as_str()).unwrap_or("any")
    };
    match t {
        "null" => JsonValue::Null,
        "number" | "integer" => serde_json::json!(0),
        "boolean" => serde_json::json!(false),
        "string" => serde_json::json!("string"),
        "object" => serde_json::json!({}),
        "array" => serde_json::json!([]),
        other => serde_json::json!(other),
    }
}

// ==================== 格式化 API 文档 ====================

fn format_request_body(data: &JsonValue, schema_map: &HashMap<String, JsonValue>) -> Option<String> {
    // YApi 格式
    let body = data.get("req_body_other").or_else(|| data.get("req_body_form"));
    if let Some(b) = body {
        let is_json_schema = data.get("req_body_is_json_schema").and_then(|v| v.as_bool()).unwrap_or(false);
        let obj = if let Some(s) = b.as_str() {
            serde_json::from_str::<JsonValue>(s).ok()?
        } else {
            b.clone()
        };
        let resolved = if schema_map.is_empty() { obj.clone() } else { resolve_schema(&obj, schema_map, &mut std::collections::HashSet::new()) };
        if is_json_schema || resolved.get("type").and_then(|v| v.as_str()) == Some("object") {
            if resolved.get("properties").is_some() {
                let example = schema_to_example(&resolved, schema_map);
                let json_str = serde_json::to_string_pretty(&example).ok()?;
                return Some(truncate_json(&json_str, 500));
            }
        }
        let json_str = serde_json::to_string_pretty(&obj).ok()?;
        return Some(truncate_json(&json_str, 500));
    }

    // OpenAPI 格式
    if let Some(rb) = data.get("requestBody") {
        let content_type = rb.get("type").and_then(|v| v.as_str()).unwrap_or("application/json");
        let schema = rb.get("jsonSchema");
        if let Some(s) = schema {
            let resolved = resolve_schema(s, schema_map, &mut std::collections::HashSet::new());
            if resolved.get("properties").is_some() {
                let example = schema_to_example(&resolved, schema_map);
                let json_str = serde_json::to_string_pretty(&example).ok()?;
                return Some(format!("Content-Type: {}\n{}", content_type, truncate_json(&json_str, 500)));
            }
        }
    }

    None
}

fn format_response_body(data: &JsonValue, schema_map: &HashMap<String, JsonValue>) -> Option<String> {
    // YApi 格式
    if let Some(body) = data.get("res_body") {
        let is_json_schema = data.get("res_body_is_json_schema").and_then(|v| v.as_bool()).unwrap_or(false);
        let obj = if let Some(s) = body.as_str() {
            serde_json::from_str::<JsonValue>(s).ok()?
        } else {
            body.clone()
        };
        let resolved = if schema_map.is_empty() { obj.clone() } else { resolve_schema(&obj, schema_map, &mut std::collections::HashSet::new()) };
        if is_json_schema || resolved.get("type").and_then(|v| v.as_str()) == Some("object") {
            if resolved.get("properties").is_some() {
                let example = schema_to_example(&resolved, schema_map);
                let json_str = serde_json::to_string_pretty(&example).ok()?;
                return Some(truncate_json(&json_str, 500));
            }
        }
        let json_str = serde_json::to_string_pretty(&obj).ok()?;
        return Some(truncate_json(&json_str, 500));
    }

    // OpenAPI 格式
    if let Some(responses) = data.get("responses").and_then(|v| v.as_array()) {
        let mut lines = Vec::new();
        for res in responses {
            let code = res.get("code").and_then(|v| v.as_u64()).unwrap_or(200);
            if let Some(schema) = res.get("jsonSchema") {
                let resolved = resolve_schema(schema, schema_map, &mut std::collections::HashSet::new());
                let example = schema_to_example(&resolved, schema_map);
                let json_str = serde_json::to_string_pretty(&example).unwrap_or_else(|_| "{}".to_string());
                lines.push(format!("  HTTP {}:\n  {}", code, truncate_json(&json_str, 500)));
            }
        }
        if !lines.is_empty() {
            return Some(lines.join("\n"));
        }
    }

    None
}

fn format_openapi_params(params: &JsonValue, schema_map: &HashMap<String, JsonValue>) -> Option<String> {
    let obj = params.as_object()?;
    let mut sections = Vec::new();

    for (section, label) in &[("path", "路径参数"), ("query", "Query 参数"), ("header", "请求头")] {
        if let Some(items) = obj.get(*section).and_then(|v| v.as_array()) {
            if items.is_empty() { continue; }
            let mut lines = Vec::new();
            for p in items {
                let resolved = resolve_schema(p, schema_map, &mut std::collections::HashSet::new());
                let name = resolved.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let required = resolved.get("required").map(|v| v == true).unwrap_or(false);
                let req_str = if required { "必填" } else { "可选" };
                let t = resolved.get("schema").and_then(|v| v.get("type")).and_then(|v| v.as_str())
                    .or_else(|| resolved.get("type").and_then(|v| v.as_str()))
                    .unwrap_or("any");
                let desc = resolved.get("description").and_then(|v| v.as_str()).unwrap_or("");
                if desc.is_empty() {
                    lines.push(format!("    - {}: {}, {}", name, t, req_str));
                } else {
                    lines.push(format!("    - {}: {}, {} ({})", name, t, req_str, desc));
                }
            }
            sections.push(format!("  {}:\n{}", label, lines.join("\n")));
        }
    }

    if sections.is_empty() { None } else { Some(sections.join("\n")) }
}

fn truncate_json(s: &str, max_len: usize) -> String {
    if s.len() > max_len {
        format!("{}...", &s[..max_len])
    } else {
        s.to_string()
    }
}

// ==================== Prompt 模板 ====================

const PROMPT_TEMPLATE: &str = r#"你是一个测试流程设计专家。你的任务是根据用户提供的测试需求，生成一个完整的测试流程 JSON。
导入后系统会自动布局，所以 position 字段统一填 {"x":0,"y":0} 即可。

---

# 一、当前项目的可用 API 接口

{{apiDocs}}

在 `httpRequest` 节点中通过 `menuItemId` 引用上述接口。
使用 `requestOverride` 覆盖请求参数，值中用 `{{变量名}}` 引用已保存的变量。
使用 `postScript` 中的 `pm.variables.set('变量名', 值)` 保存响应数据供后续节点使用。

> **请求体/响应体说明：** 上方接口文档中的 JSON 结构展示了请求/响应的完整字段层级。字段类型用 `"string"`、`0`、`true`、`null` 等占位符表示。

---

# 二、所有可用节点类型详解

## 1. start — 流程起点

作用：测试流程的入口，每个流程必须有且只有一个 start 节点。
输入：无 | 输出：out

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点显示名称，如"开始" |
| enabled | boolean | 是 | 是否启用，一般为 true |

## 2. end — 流程终点

作用：测试流程的出口，可以有多个（如正常结束、异常结束）。
输入：in | 输出：无

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点显示名称，如"完成"、"失败" |
| enabled | boolean | 是 | 是否启用，一般为 true |

## 3. httpRequest — HTTP 请求

作用：发送一个 API 请求。通过 menuItemId 关联项目中已定义的 API 接口。
输入：in | 输出：out

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称，如"用户登录" |
| enabled | boolean | 是 | 是否启用 |
| menuItemId | string | 是 | 引用上方 API 列表中的接口 id |
| requestOverride | object | 否 | 覆盖请求参数，各字段均可选，值中可用 `{{变量名}}` |
| preScript | string | 否 | 请求发送**前**执行的 JS 脚本，可修改请求参数、设置变量 |
| postScript | string | 否 | 请求完成后执行的 JS 脚本，可读取响应、设置变量 |
| assertions | array | 否 | 断言列表，验证响应是否符合预期 |
| extractors | array | 否 | 提取器列表，从响应中提取数据到变量 |
| mockRules | array | 否 | Mock 依赖规则列表，在请求发送前推送到 Mock Agent 拦截 Feign/Mapper 调用 |

requestOverride 格式：
```json
{
  "queryParams": [{"name": "page", "value": "1"}],
  "headers": [{"name": "Authorization", "value": "Bearer {{token}}"}],
  "pathParams": [{"name": "id", "value": "123"}],
  "body": {"type": "json", "json": {"username": "admin"}}
}
```

postScript 中可用的 API：
- `pm.response.json()` — 获取 JSON 响应体
- `pm.response.status` — 获取状态码（数字）
- `pm.response.headers` — 获取响应头（对象）
- `pm.response.body` — 获取原始响应体（字符串）
- `pm.variables.set('变量名', 值)` — 保存变量，后续节点用 `{{变量名}}` 引用
- `pm.variables.get('变量名')` — 读取变量

preScript 中可用的 API：
- `pm.request` — 请求参数对象（可直接修改 headers、body 等字段，修改会生效于实际请求）
- `pm.variables.set('变量名', 值)` — 保存变量
- `pm.variables.get('变量名')` — 读取变量

执行顺序：preScript → 推送 Mock 规则 → 发送请求 → 拉取 Mock 日志 → postScript → extractors → assertions

mockRules 格式（Mock 依赖拦截）：

当被测接口内部依赖其他服务（如 Feign Client、MyBatis Mapper），可通过 mockRules 在请求发送前拦截这些依赖调用，返回预设的模拟数据，实现单服务隔离测试。

```json
"mockRules": [
  {
    "id": "rule-1",
    "enabled": true,
    "targetType": "feign",
    "className": "com.example.feign.UserClient",
    "methodName": "getUser",
    "paramTypes": ["java.lang.Long"],
    "responseTemplate": {"code": 200, "message": "success", "data": {"id": 1, "username": "张三", "role": "VIP"}},
    "responseClassName": "com.example.dto.ApiResult",
    "responseDelay": 0,
    "maxTimes": 10
  }
]
```

mockRules 字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 规则唯一标识 |
| enabled | boolean | 是 | 是否启用 |
| targetType | string | 是 | 目标类型：`feign`（Feign Client）/ `mapper`（MyBatis Mapper）/ `custom`（自定义方法） |
| className | string | 是 | 目标类全限定名，如 `com.example.feign.OrderClient` |
| methodName | string | 是 | 目标方法名，如 `createOrder` |
| paramTypes | string[] | 否 | 方法参数类型全限定名，用于区分重载方法 |
| responseTemplate | any | 是 | 返回的模拟数据（JSON 对象/数组/字符串），支持 `{{变量名}}` 插值 |
| responseClassName | string | 否 | 返回值目标类型全限定名，帮助 Agent 精确反序列化 |
| responseDelay | number | 否 | 模拟响应延迟（毫秒） |
| maxTimes | number | 否 | 最多拦截次数，之后放行真实调用 |

> **前提条件：** 使用 mockRules 需要在运行环境的「Mock Agent」字段配置 Agent 地址（如 `http://localhost:19876`）。Agent 会在请求发送前接收规则，拦截对应的依赖调用。

## 4. condition — 条件判断

作用：根据条件表达式的真假，走不同的分支路径。
输入：in | 输出：true（条件满足时）, false（条件不满足时）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| conditionType | string | 是 | 条件类型，见下方三种模式 |
| expression | string | 见说明 | 当 conditionType 为 expression 或 status_code 时必填 |
| variableName | string | 见说明 | 当 conditionType 为 variable_check 时必填 |
| operator | string | 见说明 | 当 conditionType 为 variable_check 时必填 |
| compareValue | string | 见说明 | 当 operator 不是 exists 时必填 |

conditionType 三种模式：
- **expression**：通用 JS 表达式，通过 expression 字段指定。表达式可访问 variables 对象。例：`variables.counter > 0`
- **status_code**：检查上一个请求的 HTTP 状态码（读取内置变量 `__last_status__`）。expression 填目标状态码字符串，如 `"200"`
- **variable_check**：变量检查，通过 variableName + operator + compareValue 组合判断

variable_check 支持的 operator：
- `exists` — 变量已定义（不需要 compareValue）
- `equals` — 变量值 === compareValue
- `not_equals` — 变量值 !== compareValue
- `contains` — 变量值包含 compareValue 子串
- `greater_than` — 数值比较：变量值 > compareValue
- `less_than` — 数值比较：变量值 < compareValue

## 5. loop — 循环

作用：重复执行一组节点，支持固定次数、while 条件、for_each 遍历三种模式。
输入：in | 输出：out（循环结束后走这里）, loop（循环体，连接要重复执行的节点）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| loopType | string | 是 | 循环类型：`count` / `while` / `for_each` |
| count | number/string | count 时必填 | 循环次数，支持 `{{变量名}}` 插值 |
| whileExpression | string | while 时必填 | JS 表达式，每次迭代前求值，为 false 时退出循环 |
| collectionVariable | string | for_each 时必填 | 存放 JSON 数组的变量名 |
| iteratorVariable | string | for_each 时必填 | 当前迭代元素的变量名（如 "item"） |
| maxIterations | number | 否 | 安全限制，防止死循环，默认 100 |
| breakOnFailure | boolean | 否 | 循环体中节点失败时是否中断循环，默认 true |

三种循环模式：
- **count**：固定次数，如 `count: 3` 循环 3 次
- **while**：条件循环，每次迭代前求值 `whileExpression`，如 `"variables.counter < 10"`
- **for_each**：遍历数组变量，如 `collectionVariable: "items"` 遍历 `items` 变量中的数组，当前元素存入 `iteratorVariable` 指定的变量

每次循环时，系统自动设置内置变量 `__loop_index__` 为当前循环索引（从 0 开始）。

用法：loop 节点的 "loop" 输出连接循环体内的第一个节点，循环体最后一个节点连回 loop 节点的 "in" 输入口。

## 6. wait — 等待

作用：暂停流程执行，支持固定时长、变量时长、条件轮询三种模式。
输入：in | 输出：out

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| waitType | string | 是 | 'fixed'（固定时长）/ 'variable'（变量时长）/ 'condition'（条件轮询）|
| durationMs | number | fixed 时必填 | 等待毫秒数 |
| durationVariable | string | variable 时必填 | 存放等待时长的变量名 |
| conditionExpression | string | condition 时必填 | JS 表达式，轮询直到为 true，可访问 variables 对象 |
| pollIntervalMs | number | condition 时可选 | 轮询间隔毫秒数，默认 1000 |
| maxWaitMs | number | condition 时可选 | 超时毫秒数，默认 30000 |

## 7. setVariable — 变量赋值

作用：设置或修改变量。
输入：in | 输出：out

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| assignments | array | 是 | 赋值列表 |

assignments 每项：`{"variable": "变量名", "operator": "=", "value": "值"}`
- `=` 赋值 / `+=` 拼接 / `-=` 移除子串
- value 支持 `{{变量名}}` 插值

## 8. assert — 变量断言

作用：验证变量值是否符合预期，失败时停止执行。
输入：in | 输出：out

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| assertions | array | 是 | 变量断言列表 |
| script | string | 否 | 高级脚本断言（pm.test / pm.expect） |

assertions 每项：`{"variable": "变量名", "operator": "运算符", "expected": "期望值"}`
operators: exists / not_exists / equals / not_equals / contains / not_contains / greater_than / less_than

script API: pm.test(name, fn) / pm.expect(x).toBe/.toEqual/.toBeTruthy/.toBeDefined/.toContain/.toBeGreaterThan/.toBeLessThan / pm.variables.get(key) / pm.variables.all()

## 9. parallel — 并行执行

作用：同时执行多个分支。所有分支完成后走 "out" 后续节点。
输入：in | 输出：branch-0, branch-1, ..., out

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| branchCount | number | 是 | 并行分支数（2-6） |
| waitAll | boolean | 是 | true=等待所有，false=任一完成即继续 |

## 10. subFlow — 子流程

作用：调用另一个测试任务作为子流程执行，实现测试复用。
输入：in | 输出：out

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| targetTaskId | string | 是 | 要调用的测试任务 ID |
| passVariables | boolean | 否 | 是否将当前变量传递给子流程，默认 true |
| mergeVariables | boolean | 否 | 是否将子流程产生的变量合并回当前流程，默认 true |

---

# 三、httpRequest 内置断言格式（assertions 数组）

| 字段 | 说明 |
|------|------|
| type | 'status' / 'json_path' / 'header' / 'response_time' / 'body_contains' |
| path | json_path 时必填，如 "data.user.name" |
| name | header 时必填，如 "Content-Type" |
| operator | equals / not_equals / exists / not_exists / contains / not_contains / greater_than / less_than |
| expected | 期望值。status 和 response_time 自动转数字比较 |

# 四、提取器格式（extractors 数组）

| 字段 | 说明 |
|------|------|
| type | 'json_path' / 'header' / 'regex' / 'status' |
| path | json_path 时必填，如 "data.token" |
| name | header 时必填 |
| pattern | regex 时必填，正则表达式。匹配响应体原始文本，有捕获组返回第1个组 |
| variable | 保存到的变量名（必填） |

# 五、内置变量

| 变量名 | 说明 | 设置时机 |
|--------|------|---------|
| __last_status__ | HTTP 状态码（字符串） | 每次 httpRequest 后 |
| __last_duration__ | 响应耗时 ms（字符串） | 每次 httpRequest 后 |
| __last_error__ | 请求失败的错误信息 | 请求失败时 |
| __loop_index__ | 循环索引（从 0 开始） | loop 每次迭代 |

---

# 六、edges（连线）

- id: 唯一字符串
- source: 源节点 id
- target: 目标节点 id
- sourceHandle: 输出口（out / true / false / loop / branch-0 等）
- targetHandle: 输入口，通常为 "in"

---

# 七、完整示例

```json
{
  "nodes": [
    { "id": "start-1", "type": "start", "position": {"x":0,"y":0}, "data": { "label": "开始", "enabled": true } },
    { "id": "http-login", "type": "httpRequest", "position": {"x":0,"y":0}, "data": { "label": "用户登录", "enabled": true, "menuItemId": "login-api-id", "postScript": "var resp = pm.response.json(); pm.variables.set('token', resp.token);", "assertions": [{ "type": "status", "operator": "equals", "expected": 200 }] } },
    { "id": "cond-token", "type": "condition", "position": {"x":0,"y":0}, "data": { "label": "检查登录", "enabled": true, "conditionType": "variable_check", "variableName": "token", "operator": "exists" } },
    { "id": "http-user", "type": "httpRequest", "position": {"x":0,"y":0}, "data": { "label": "获取用户", "enabled": true, "menuItemId": "user-info-api-id", "requestOverride": { "headers": [{"name": "Authorization", "value": "Bearer {{token}}"}] }, "mockRules": [{ "id": "mock-user", "enabled": true, "targetType": "feign", "className": "com.example.feign.UserClient", "methodName": "getUser", "responseTemplate": {"code": 200, "data": {"username": "测试用户"}}, "responseClassName": "com.example.dto.ApiResult" }] } },
    { "id": "end-ok", "type": "end", "position": {"x":0,"y":0}, "data": { "label": "通过", "enabled": true } },
    { "id": "end-fail", "type": "end", "position": {"x":0,"y":0}, "data": { "label": "失败", "enabled": true } }
  ],
  "edges": [
    { "id": "e1", "source": "start-1", "target": "http-login", "sourceHandle": "out", "targetHandle": "in" },
    { "id": "e2", "source": "http-login", "target": "cond-token", "sourceHandle": "out", "targetHandle": "in" },
    { "id": "e3", "source": "cond-token", "target": "http-user", "sourceHandle": "true", "targetHandle": "in" },
    { "id": "e4", "source": "cond-token", "target": "end-fail", "sourceHandle": "false", "targetHandle": "in" },
    { "id": "e5", "source": "http-user", "target": "end-ok", "sourceHandle": "out", "targetHandle": "in" }
  ]
}
```

---

# 八、用户需求

请根据以下需求生成测试流程 JSON（只输出 JSON，不要其他内容）：
"#;
