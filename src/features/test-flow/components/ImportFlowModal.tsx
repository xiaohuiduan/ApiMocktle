import { useState, useCallback, useMemo } from 'react'
import { Modal, Tabs, Input, Button, Typography, message, Popconfirm, Spin } from 'antd'
import { CopyOutlined, UploadOutlined, FileTextOutlined } from '@ant-design/icons'
import type { FlowGraph } from '../../types/flow.types'
import { useApiMenu, type ApiMenuItem } from '@/hooks/useApiMenu'

const { Text } = Typography
const { TextArea } = Input

// ==================== 构建 Prompt ====================

function buildPrompt(apiList: ApiMenuItem[]): string {
  // 将每个 API 格式化为详细的接口文档
  const apiDocs = apiList.length > 0
    ? apiList.map((api, i) => {
      const lines = [`### ${i + 1}. ${api.name}`, ``
        + `- menuItemId: \`${api.id}\``
        + `\n- 方法: ${api.method.toUpperCase()}`
        + `\n- 路径: ${api.path}`]
      if (api.description) lines.push(`- 说明: ${api.description}`)
      if (api.queryParams) lines.push(`- Query 参数:\n${api.queryParams}`)
      if (api.requestBody) lines.push(`- 请求体参数:\n${api.requestBody}`)
      if (api.responseBody) lines.push(`- 响应体结构:\n${api.responseBody}`)
      return lines.join('\n')
    }).join('\n\n')
    : '（当前项目暂无 API 接口，请在项目中先添加 API 定义）'

  return `你是一个测试流程设计专家。你的任务是根据用户提供的测试需求，生成一个完整的测试流程 JSON。
导入后系统会自动布局，所以 position 字段统一填 {"x":0,"y":0} 即可。

---

# 一、当前项目的可用 API 接口

${apiDocs}

在 \`httpRequest\` 节点中通过 \`menuItemId\` 引用上述接口。
使用 \`requestOverride\` 覆盖请求参数，用 \`{{变量名}}\` 引用已保存的变量。
使用 \`postScript\` 中的 \`pm.variables.set('变量名', 值)\` 保存响应数据供后续节点使用。
使用 \`preScript\` 在请求发送前执行预处理逻辑。

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

作用：发送一个 API 请求。这是最核心的节点，通过 menuItemId 关联项目中已定义的 API 接口。
输入：in | 输出：out
使用场景：登录、获取数据、提交表单等任何 API 调用。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称，如"用户登录"、"获取订单列表" |
| enabled | boolean | 是 | 是否启用 |
| menuItemId | string | 是 | 引用上方 API 列表中的接口 id |
| requestOverride | object | 否 | 覆盖请求参数，格式见下方说明。可用 {{变量名}} 引用变量 |
| preScript | string | 否 | 请求发送前执行的 JavaScript 脚本。可操作变量、修改请求等 |
| postScript | string | 否 | 请求完成后执行的 JavaScript 脚本。常用 pm.variables.set('key', value) 保存响应数据 |
| assertions | array | 否 | 断言列表，验证响应是否符合预期（见下方断言格式） |
| extractors | array | 否 | 提取器列表，从响应中提取数据到变量（见下方提取器格式） |

requestOverride 格式（各字段均为可选）：
\`\`\`json
{
  "queryParams": [{"name": "page", "value": "1"}, {"name": "size", "value": "10"}],
  "headers": [{"name": "Authorization", "value": "Bearer {{token}}"}],
  "pathParams": [{"name": "id", "value": "123"}],
  "body": {"type": "json", "json": {"username": "admin", "password": "123456"}}
}
\`\`\`
- queryParams: Query 参数数组，每项 {name, value}
- headers: 请求头数组，每项 {name, value}
- pathParams: 路径参数数组，替换 URL 中的 {param} 占位符
- body: 请求体，type 固定为 "json"，json 字段为实际的 JSON 对象

postScript 中可用的 API：
- pm.variables.set('变量名', 值) — 保存变量，后续节点用 {{变量名}} 引用
- pm.response.json() — 获取 JSON 响应体
- pm.response.status — 获取状态码
- pm.response.headers — 获取响应头

## 4. condition — 条件判断

作用：根据条件表达式的真假，走不同的分支路径。
输入：in | 输出：true（条件满足时）, false（条件不满足时）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| conditionType | string | 是 | 条件类型，见下方三种模式 |
| expression | string | 见说明 | 当 conditionType 为 expression 或 status_code 时必填 |

conditionType 三种模式：
- "expression"：通用 JavaScript 表达式，通过 expression 字段指定。例："variables.token !== undefined"
- "status_code"：检查上一个请求的 HTTP 状态码。expression 填目标状态码，如 "200"
- "variable_check"：变量检查，需额外填写 variableName、operator、compareValue

## 5. loop — 循环

作用：重复执行一组节点，支持固定次数、while 条件、遍历数组三种模式。
输入：in | 输出：out（循环结束后走这里）, loop（循环体，连接要重复执行的节点）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| loopType | string | 是 | 循环类型：'count'（固定次数）/ 'while'（条件循环）/ 'for_each'（遍历数组） |
| count | number/string | count 时必填 | 循环次数，支持数字 5 或变量表达式 "{{maxRetry}}" |
| whileExpression | string | while 时必填 | JavaScript 表达式，为 true 时继续循环，如 "variables.retryCount < 3" |
| collectionVariable | string | for_each 时必填 | 存放数组的变量名，如 "userList" |
| iteratorVariable | string | for_each 时选填 | 循环变量名，默认 "item" |
| maxIterations | number | 否 | 安全限制，防止死循环，默认 100 |

用法：loop 节点的 "loop" 输出连接循环体内的第一个节点，循环体最后一个节点连回 loop 节点的 "in" 或连到 "out" 后续节点。

## 6. wait — 等待

作用：暂停流程执行，用于等待服务端处理、轮询状态等。
输入：in | 输出：out

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| waitType | string | 是 | 'fixed'（固定时长）/ 'variable'（变量时长）/ 'condition'（条件满足时） |
| durationMs | number | fixed 时必填 | 等待毫秒数，如 2000 表示等 2 秒 |
| durationVariable | string | variable 时必填 | 存放等待时长的变量名 |
| conditionExpression | string | condition 时必填 | 轮询直到此表达式为 true |
| pollIntervalMs | number | condition 时选填 | 轮询间隔毫秒，默认 1000 |
| maxWaitMs | number | condition 时选填 | 最大等待时间，超时则失败 |

## 7. setVariable — 变量赋值

作用：设置或修改变量，用于数据传递、计算等。
输入：in | 输出：out

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| assignments | array | 是 | 赋值列表，每项包含 variable（变量名）、operator（"="赋值 / "+="累加 / "-="累减）、value（值，可用 {{变量}} 表达式） |

## 8. assert — 变量断言

作用：验证变量值是否符合预期，失败时标记流程为失败。用于在一系列请求之后检查变量状态。
输入：in | 输出：out
注意：此节点检查的是**变量**（由 setVariable 节点或 httpRequest 的 postScript/extractors 产生的），不是 HTTP 响应。HTTP 响应断言请使用 httpRequest 节点内置的 assertions。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| assertions | array | 是 | 变量断言列表（见下方变量断言格式） |
| script | string | 否 | 高级脚本断言，可用 pm.test/pm.expect，variables 对象可直接访问 |

## 9. parallel — 并行

作用：同时执行多个分支，适合并发请求或多路径验证。
输入：in | 输出：branch-0, branch-1, ...（与 branchCount 对应）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| branchCount | number | 是 | 并行分支数（2-6） |
| waitAll | boolean | 是 | true=等待所有分支完成，false=任一完成即继续 |
| timeoutMs | number | 否 | 整体超时毫秒数 |

## 10. subFlow — 子流程

作用：调用另一个已定义的测试任务，实现流程复用。
输入：in | 输出：out

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| targetTaskId | string | 是 | 要调用的测试任务 id |
| passVariables | boolean | 否 | 是否传递当前变量到子流程，默认 false |
| mergeVariables | boolean | 否 | 是否将子流程变量合并回来，默认 false |

---

# 三、httpRequest 内置断言格式（httpRequest 节点的 assertions 数组）

用于验证 HTTP 响应是否符合预期，每项包含：

| 字段 | 说明 |
|------|------|
| type | 断言类型：'status'（状态码）/ 'json_path'（JSON 路径）/ 'header'（响应头）/ 'response_time'（响应时间）/ 'body_contains'（响应体包含） |
| path | 当 type 为 json_path 时必填，如 "data.user.name" |
| name | 当 type 为 header 时必填，如 "Content-Type"（大小写不敏感） |
| operator | 比较方式：'equals' / 'not_equals' / 'exists' / 'not_exists' / 'contains' / 'not_contains' / 'greater_than' / 'less_than' |
| expected | 期望值，如 200、"application/json"、true |

# 四、assert 节点变量断言格式（assert 节点的 assertions 数组）

用于验证流程变量是否符合预期，每项包含：

| 字段 | 说明 |
|------|------|
| variable | 变量名，如 "token"、"server_ip"、"last_status" |
| operator | 比较方式：'equals' / 'not_equals' / 'exists' / 'not_exists' / 'contains' / 'not_contains' / 'greater_than' / 'less_than' |
| expected | 期望值（exists/not_exists 时不需要） |

示例：
\`\`\`json
{
  "assertions": [
    { "variable": "token", "operator": "exists" },
    { "variable": "last_status", "operator": "equals", "expected": "200" },
    { "variable": "origin", "operator": "contains", "expected": "http" }
  ]
}
\`\`\`

# 五、提取器格式（extractors 数组中的每一项）

| 字段 | 说明 |
|------|------|
| type | 提取类型：'json_path'（从 JSON 响应提取）/ 'header'（从响应头提取）/ 'regex'（正则匹配）/ 'status'（状态码） |
| path | 当 type 为 json_path 时必填，如 "data.token" |
| name | 当 type 为 header 时必填 |
| pattern | 当 type 为 regex 时必填，正则表达式 |
| variable | 提取结果保存到的变量名（必填），后续节点用 {{变量名}} 引用 |

---

# 六、edges（连线）

每条连线表示从一个节点到另一个节点的流向：
- id: 唯一字符串
- source: 源节点 id
- target: 目标节点 id
- sourceHandle: 源节点的输出口（见各节点说明）
- targetHandle: 目标节点的输入口，通常为 "in"

---

# 七、完整示例

需求：调用登录接口获取 token，检查状态码，成功则用 token 获取用户信息并验证返回的用户名。

\`\`\`json
{
  "nodes": [
    { "id": "start-1", "type": "start", "position": {"x":0,"y":0}, "data": { "label": "开始", "enabled": true } },
    { "id": "http-login", "type": "httpRequest", "position": {"x":0,"y":0}, "data": { "label": "用户登录", "enabled": true, "menuItemId": "login-api-id", "postScript": "var resp = pm.response.json(); if (resp.token) { pm.variables.set('token', resp.token); }", "assertions": [{ "type": "status", "operator": "equals", "expected": 200 }] } },
    { "id": "assert-token", "type": "assert", "position": {"x":0,"y":0}, "data": { "label": "验证 token 已获取", "enabled": true, "assertions": [{ "variable": "token", "operator": "exists" }], "script": "pm.test('token 非空', function() { pm.expect(variables.token).toBeTruthy(); });" } },
    { "id": "http-user", "type": "httpRequest", "position": {"x":0,"y":0}, "data": { "label": "获取用户信息", "enabled": true, "menuItemId": "user-info-api-id", "requestOverride": { "headers": [{"name": "Authorization", "value": "Bearer {{token}}"}] }, "assertions": [{ "type": "json_path", "path": "data.username", "operator": "exists" }] } },
    { "id": "end-ok", "type": "end", "position": {"x":0,"y":0}, "data": { "label": "测试通过", "enabled": true } },
    { "id": "end-fail", "type": "end", "position": {"x":0,"y":0}, "data": { "label": "登录失败", "enabled": true } }
  ],
  "edges": [
    { "id": "e-1", "source": "start-1", "target": "http-login", "sourceHandle": "out", "targetHandle": "in" },
    { "id": "e-2", "source": "http-login", "target": "assert-token", "sourceHandle": "out", "targetHandle": "in" },
    { "id": "e-3", "source": "assert-token", "target": "http-user", "sourceHandle": "out", "targetHandle": "in" },
    { "id": "e-4", "source": "http-user", "target": "end-ok", "sourceHandle": "out", "targetHandle": "in" },
    { "id": "e-5", "source": "http-login", "target": "end-fail", "sourceHandle": "out", "targetHandle": "in" }
  ]
}
\`\`\`

---

# 八、用户需求

请根据以下需求生成测试流程 JSON（只输出 JSON，不要其他内容）：
`
}

// ==================== 组件 ====================

interface ImportFlowModalProps {
  open: boolean
  projectId: string
  onClose: () => void
  onImport: (graph: FlowGraph) => void
}

export default function ImportFlowModal({ open, projectId, onClose, onImport }: ImportFlowModalProps) {
  const [jsonText, setJsonText] = useState('')
  const [importing, setImporting] = useState(false)
  const { items: apiList, loading: apiLoading } = useApiMenu(projectId)

  const promptText = useMemo(() => buildPrompt(apiList), [apiList])

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(promptText)
      message.success('Prompt 已复制到剪贴板，粘贴给 AI 即可')
    } catch {
      message.error('复制失败，请手动复制')
    }
  }, [promptText])

  const handleImportFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const graph = JSON.parse(event.target?.result as string)
          onImport(graph)
          onClose()
          message.success('导入成功')
        } catch {
          message.error('JSON 解析失败，请检查文件格式')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [onImport, onClose])

  const handleImportJson = useCallback(() => {
    if (!jsonText.trim()) {
      message.warning('请先粘贴 JSON 内容')
      return
    }
    try {
      const graph = JSON.parse(jsonText)
      if (!graph.nodes || !Array.isArray(graph.nodes)) {
        message.error('JSON 缺少 nodes 数组')
        return
      }
      if (!graph.edges || !Array.isArray(graph.edges)) {
        message.error('JSON 缺少 edges 数组')
        return
      }
      setImporting(true)
      onImport(graph)
      onClose()
      message.success('导入成功')
    } catch (err) {
      message.error('JSON 格式错误：' + (err as Error).message)
    } finally {
      setImporting(false)
    }
  }, [jsonText, onImport, onClose])

  const tabItems = [
    {
      key: 'paste',
      label: <span><FileTextOutlined /> 粘贴 JSON</span>,
      children: (
        <div style={{ padding: '16px 0' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            将 AI 生成的 JSON 粘贴到下方，导入后会自动布局
          </Text>
          <TextArea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='{ "nodes": [...], "edges": [...] }'
            rows={14}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <Popconfirm
              title="确认导入"
              description="导入将覆盖当前画布上的所有节点和连线，确定继续？"
              onConfirm={handleImportJson}
              okText="确定导入"
              cancelText="取消"
              disabled={!jsonText.trim()}
            >
              <Button type="primary" loading={importing} disabled={!jsonText.trim()}>
                导入并覆盖
              </Button>
            </Popconfirm>
          </div>
        </div>
      ),
    },
    {
      key: 'file',
      label: <span><UploadOutlined /> 导入文件</span>,
      children: (
        <div style={{ padding: '16px 0', textAlign: 'center' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            选择之前导出的 .json 文件导入
          </Text>
          <Button type="primary" icon={<UploadOutlined />} onClick={handleImportFile} size="large">
            选择 JSON 文件
          </Button>
        </div>
      ),
    },
    {
      key: 'prompt',
      label: <span><CopyOutlined /> AI Prompt</span>,
      children: (
        <div style={{ padding: '16px 0' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            复制下方 Prompt 给 AI，附上你的测试需求，AI 会生成可直接导入的 JSON
          </Text>
          {apiLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="加载 API 列表..." /></div>
          ) : (
            <div style={{
              background: '#f6f8fa',
              border: '1px solid #d0d7de',
              borderRadius: 6,
              padding: 12,
              maxHeight: 420,
              overflow: 'auto',
              fontSize: 12,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}>
              {promptText}
              <span style={{ color: '#3b82f6' }}>[你的测试需求写在这里]</span>
            </div>
          )}
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <Button type="primary" icon={<CopyOutlined />} onClick={handleCopyPrompt} disabled={apiLoading}>
              复制 Prompt
            </Button>
          </div>
        </div>
      ),
    },
  ]

  return (
    <Modal
      title="导入测试流程"
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      destroyOnClose
    >
      <Tabs items={tabItems} defaultActiveKey="prompt" />
    </Modal>
  )
}
