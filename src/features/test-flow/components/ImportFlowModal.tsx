import { useState, useCallback, useMemo } from 'react'
import { Modal, Tabs, Input, Button, Typography, message, Popconfirm, Spin } from 'antd'
import { CopyOutlined, UploadOutlined, FileTextOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FlowGraph } from '../../types/flow.types'
import { useApiMenu, type ApiMenuItem } from '@/hooks/useApiMenu'
import { css } from '@emotion/css'

const { Text } = Typography
const { TextArea } = Input

const mdPreviewClass = css`
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  padding: 16px;
  max-height: 420px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.6;
  color: #1f2937;
  h1, h2, h3, h4 { margin: 16px 0 8px; font-weight: 600; }
  h1 { font-size: 18px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  h2 { font-size: 15px; }
  h3 { font-size: 13px; }
  h4 { font-size: 12px; }
  p { margin: 6px 0; }
  ul, ol { padding-left: 20px; margin: 6px 0; }
  li { margin: 2px 0; }
  code { background: #e5e7eb; padding: 1px 4px; border-radius: 3px; font-size: 12px; font-family: 'Cascadia Code', 'Fira Code', monospace; }
  pre { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0; }
  pre code { background: transparent; padding: 0; color: inherit; }
  blockquote { border-left: 3px solid #3b82f6; padding-left: 12px; margin: 8px 0; color: #4b5563; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
  th, td { border: 1px solid #d1d5db; padding: 4px 8px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
  strong { font-weight: 600; }
`

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
      if (api.requestBody) lines.push(`- 请求体参数:\n\n\`\`\`json\n${api.requestBody}\n\`\`\``)
      if (api.responseBody) lines.push(`- 响应体结构:\n\n\`\`\`json\n${api.responseBody}\n\`\`\``)
      return lines.join('\n')
    }).join('\n\n')
    : '（当前项目暂无 API 接口，请在项目中先添加 API 定义）'

  return `你是一个测试流程设计专家。你的任务是根据用户提供的测试需求，生成一个完整的测试流程 JSON。
导入后系统会自动布局，所以 position 字段统一填 {"x":0,"y":0} 即可。

---

# 一、当前项目的可用 API 接口

${apiDocs}

在 \`httpRequest\` 节点中通过 \`menuItemId\` 引用上述接口。
使用 \`requestOverride\` 覆盖请求参数，值中用 \`{{变量名}}\` 引用已保存的变量。
使用 \`postScript\` 中的 \`pm.variables.set('变量名', 值)\` 保存响应数据供后续节点使用。

> **请求体/响应体说明：** 上方接口文档中的 JSON 结构展示了请求/响应的完整字段层级。字段类型用 \`"string"\`、\`0\`、\`true\`、\`null\` 等占位符表示。带 \`// (必填)\` 标注的字段为必填字段。

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
| requestOverride | object | 否 | 覆盖请求参数，各字段均可选，值中可用 \`{{变量名}}\` |
| postScript | string | 否 | 请求完成后执行的 JS 脚本，可读取响应、设置变量 |
| assertions | array | 否 | 断言列表，验证响应是否符合预期 |
| extractors | array | 否 | 提取器列表，从响应中提取数据到变量 |

requestOverride 格式：
\`\`\`json
{
  "queryParams": [{"name": "page", "value": "1"}],
  "headers": [{"name": "Authorization", "value": "Bearer {{token}}"}],
  "pathParams": [{"name": "id", "value": "123"}],
  "body": {"type": "json", "json": {"username": "admin"}}
}
\`\`\`

postScript 中可用的 API：
- \`pm.response.json()\` — 获取 JSON 响应体
- \`pm.response.status\` — 获取状态码（数字）
- \`pm.response.headers\` — 获取响应头（对象）
- \`pm.response.body\` — 获取原始响应体（字符串）
- \`pm.variables.set('变量名', 值)\` — 保存变量，后续节点用 \`{{变量名}}\` 引用
- \`pm.variables.get('变量名')\` — 读取变量

执行顺序：发送请求 → postScript → extractors → assertions

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
- **expression**：通用 JS 表达式，通过 expression 字段指定。表达式可访问 variables 对象。例：\`variables.counter > 0\`、\`variables.token !== undefined\`
- **status_code**：检查上一个请求的 HTTP 状态码（读取内置变量 \`__last_status__\`）。expression 填目标状态码字符串，如 \`"200"\`
- **variable_check**：变量检查，通过 variableName + operator + compareValue 组合判断

variable_check 支持的 operator：
- \`exists\` — 变量已定义（不需要 compareValue）
- \`equals\` — 变量值 === compareValue
- \`not_equals\` — 变量值 !== compareValue
- \`contains\` — 变量值包含 compareValue 子串
- \`greater_than\` — 数值比较：变量值 > compareValue
- \`less_than\` — 数值比较：变量值 < compareValue

## 5. loop — 循环

作用：重复执行一组节点，支持固定次数循环。
输入：in | 输出：out（循环结束后走这里）, loop（循环体，连接要重复执行的节点）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| count | number | 是 | 循环次数，如 3、10 |
| maxIterations | number | 否 | 安全限制，防止死循环，默认 100 |

每次循环时，系统自动设置内置变量 \`__loop_index__\` 为当前循环索引（从 0 开始）。
循环体内的节点可通过 \`{{__loop_index__}}\` 获取当前索引。

用法：loop 节点的 "loop" 输出连接循环体内的第一个节点，循环体最后一个节点连回 loop 节点的 "in" 输入口。

## 6. wait — 等待

作用：暂停流程执行，用于等待服务端处理、轮询状态等。
输入：in | 输出：out

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| waitType | string | 是 | 'fixed'（固定时长）/ 'variable'（变量时长）|
| durationMs | number | fixed 时必填 | 等待毫秒数，如 2000 表示等 2 秒 |
| durationVariable | string | variable 时必填 | 存放等待时长的变量名，如 \`waitTime\` |

## 7. setVariable — 变量赋值

作用：设置或修改变量，用于数据传递、计算等。
输入：in | 输出：out

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| assignments | array | 是 | 赋值列表（见下方） |

assignments 每项格式：\`{"variable": "变量名", "operator": "=", "value": "值"}\`
- operator \`=\` — 赋值（覆盖）
- operator \`+=\` — 字符串拼接追加
- operator \`-=\` — 移除匹配的子串（仅移除第一个匹配）

value 支持 \`{{变量名}}\` 插值。同一节点内，靠前的赋值可被靠后的赋值引用。

## 8. assert — 变量断言

作用：验证变量值是否符合预期，失败时标记流程为失败并停止执行。
输入：in | 输出：out
注意：此节点检查的是**流程变量**（由 httpRequest 的 postScript / extractors 产生的），不是直接检查 HTTP 响应。HTTP 响应断言请使用 httpRequest 节点内置的 assertions。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| assertions | array | 是 | 变量断言列表（见下方） |
| script | string | 否 | 高级脚本断言，可用 pm.test / pm.expect，variables 对象可直接访问 |

assertions 每项格式：\`{"variable": "变量名", "operator": "运算符", "expected": "期望值"}\`

支持的 operator：
- \`exists\` / \`not_exists\` — 变量是否存在（不需要 expected）
- \`equals\` / \`not_equals\` — 等于 / 不等于
- \`contains\` / \`not_contains\` — 包含 / 不包含子串
- \`greater_than\` / \`less_than\` — 数值大于 / 小于

script 中可用的 API：
- \`pm.test('用例名', function() { ... })\` — 定义测试用例，函数内抛异常即为失败
- \`pm.expect(actual).toBe(expected)\` — 严格相等
- \`pm.expect(actual).toEqual(expected)\` — 深度相等（JSON.stringify）
- \`pm.expect(actual).toBeTruthy()\` — 真值检查
- \`pm.expect(actual).toBeDefined()\` — 已定义检查
- \`pm.expect(actual).toContain(str)\` — 字符串包含
- \`pm.expect(actual).toBeGreaterThan(n)\` — 大于
- \`pm.expect(actual).toBeLessThan(n)\` — 小于
- \`pm.variables.get('变量名')\` — 读取变量
- \`pm.variables.all()\` — 获取所有变量的浅拷贝

## 9. parallel — 并行执行

作用：同时执行多个分支，适合并发请求或多路径验证。所有分支执行完毕后走 "out" 后续节点。
输入：in | 输出：branch-0, branch-1, ...（与 branchCount 对应）, out（所有分支完成后继续）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 节点名称 |
| enabled | boolean | 是 | 是否启用 |
| branchCount | number | 是 | 并行分支数（2-6） |
| waitAll | boolean | 是 | true=等待所有分支完成，false=任一完成即继续 |

注意：各分支通过 branch-0、branch-1 等输出口连接；所有分支完成后，通过 "out" 输出口连接后续节点。分支内如果某个节点断言失败，该分支停止但不影响其他分支。

---

# 三、httpRequest 内置断言格式（assertions 数组）

用于验证 HTTP 响应，每项包含：

| 字段 | 说明 |
|------|------|
| type | 断言类型：'status'（状态码）/ 'json_path'（JSON 路径）/ 'header'（响应头）/ 'response_time'（响应时间 ms）/ 'body_contains'（响应体包含） |
| path | 当 type 为 json_path 时必填，如 "data.user.name" |
| name | 当 type 为 header 时必填，如 "Content-Type" |
| operator | 'equals' / 'not_equals' / 'exists' / 'not_exists' / 'contains' / 'not_contains' / 'greater_than' / 'less_than' |
| expected | 期望值。status 和 response_time 类型自动转为数字比较 |

# 四、提取器格式（extractors 数组）

用于从 HTTP 响应中提取数据到变量，后续节点用 \`{{变量名}}\` 引用。

| 字段 | 说明 |
|------|------|
| type | 提取类型（见下方详解） |
| path | type 为 json_path 时必填，如 "data.token" |
| name | type 为 header 时必填，如 "Content-Type" |
| pattern | type 为 regex 时必填，正则表达式 |
| variable | 提取结果保存到的变量名（必填） |

四种提取类型：

- **json_path**：从 JSON 响应体中按路径提取。例：\`"path": "data.token"\` 提取 \`{ "data": { "token": "abc" } }\` 中的 \`"abc"\`
- **header**：从响应头提取。例：\`"name": "Content-Type"\` 提取响应头的值
- **status**：提取 HTTP 状态码（数字转字符串）。不需要 path/name/pattern
- **regex**：用正则表达式匹配**响应体原始文本**。有捕获组 \`(...)\` 返回第 1 个组，无捕获组返回整个匹配。匹配失败时变量为空字符串

regex 示例（假设响应体含 \`"url": "https://httpbin.org/post"\`）：
- \`"pattern": "https?://"\` → 匹配结果 \`https\`
- \`"pattern": "https?://([^/]+)"\` → 捕获组结果 \`httpbin.org\`
- \`"pattern": "\\"origin\\": \\"([^"]+)\\""\` → 提取 origin 值

---

# 五、内置变量

系统在执行过程中自动维护以下变量，可在任何支持 \`{{变量名}}\` 的地方引用：

| 变量名 | 说明 | 设置时机 |
|--------|------|---------|
| __last_status__ | 最近一次 HTTP 请求的状态码（字符串） | 每次 httpRequest 完成后 |
| __last_duration__ | 最近一次 HTTP 请求的耗时（毫秒，字符串） | 每次 httpRequest 完成后 |
| __last_error__ | 最近一次 HTTP 请求失败的错误信息 | 请求失败时 |
| __loop_index__ | 当前循环的索引（从 0 开始，字符串） | loop 节点每次迭代 |

---

# 六、edges（连线）

每条连线表示从一个节点到另一个节点的流向：
- id: 唯一字符串
- source: 源节点 id
- target: 目标节点 id
- sourceHandle: 源节点的输出口（out / true / false / loop / branch-0 等，见各节点说明）
- targetHandle: 目标节点的输入口，通常为 "in"

---

# 七、完整示例

需求：调用登录接口获取 token，检查状态码，成功则用 token 获取用户信息并验证返回的用户名。

\`\`\`json
{
  "nodes": [
    { "id": "start-1", "type": "start", "position": {"x":0,"y":0}, "data": { "label": "开始", "enabled": true } },
    { "id": "http-login", "type": "httpRequest", "position": {"x":0,"y":0}, "data": { "label": "用户登录", "enabled": true, "menuItemId": "login-api-id", "postScript": "var resp = pm.response.json(); if (resp.token) { pm.variables.set('token', resp.token); }", "assertions": [{ "type": "status", "operator": "equals", "expected": 200 }] } },
    { "id": "cond-token", "type": "condition", "position": {"x":0,"y":0}, "data": { "label": "检查登录是否成功", "enabled": true, "conditionType": "variable_check", "variableName": "token", "operator": "exists" } },
    { "id": "http-user", "type": "httpRequest", "position": {"x":0,"y":0}, "data": { "label": "获取用户信息", "enabled": true, "menuItemId": "user-info-api-id", "requestOverride": { "headers": [{"name": "Authorization", "value": "Bearer {{token}}"}] }, "assertions": [{ "type": "json_path", "path": "data.username", "operator": "exists" }] } },
    { "id": "end-ok", "type": "end", "position": {"x":0,"y":0}, "data": { "label": "测试通过", "enabled": true } },
    { "id": "end-fail", "type": "end", "position": {"x":0,"y":0}, "data": { "label": "登录失败", "enabled": true } }
  ],
  "edges": [
    { "id": "e1", "source": "start-1", "target": "http-login", "sourceHandle": "out", "targetHandle": "in" },
    { "id": "e2", "source": "http-login", "target": "cond-token", "sourceHandle": "out", "targetHandle": "in" },
    { "id": "e3", "source": "cond-token", "target": "http-user", "sourceHandle": "true", "targetHandle": "in" },
    { "id": "e4", "source": "cond-token", "target": "end-fail", "sourceHandle": "false", "targetHandle": "in" },
    { "id": "e5", "source": "http-user", "target": "end-ok", "sourceHandle": "out", "targetHandle": "in" }
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
            <div className={mdPreviewClass}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{promptText}</ReactMarkdown>
              <p style={{ color: '#3b82f6', marginTop: 8 }}><strong>[你的测试需求写在这里]</strong></p>
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
