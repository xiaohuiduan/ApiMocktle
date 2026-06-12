import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Drawer, Divider, Tag, Typography, Collapse, Button, Modal, Input, Select, Space, Spin, message } from 'antd'
import { CheckCircle, XCircle, Clock, AlertTriangle, Play } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { css } from '@emotion/css'
import { useFlowStore } from '../store/useFlowStore'
import { FlowEditorContext } from '../contexts/FlowEditorContext'
import { useAuth } from '@/contexts/auth'
import { FlowNodeType } from '../types/flow.types'
import type { FlowNodeData, NodeExecStatus } from '../types/flow.types'
import TypeHeader from './node-config-panels/TypeHeader'
import BaseFields from './node-config-panels/BaseFields'
import { getPanelComponent } from './node-config-panels/shared/panelRegistry'

const { Text } = Typography

// ==================== 样式 ====================

const resultBlockClass = css`
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
`

const resizeHandleClass = css`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 10;
  transition: background 0.15s;
  &:hover, &:active {
    background: #91caff;
  }
`

const codeBlockClass = css`
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 4px;
  padding: 8px 10px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  max-height: 400px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 4px 0;
`

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  passed: { color: 'success', icon: <CheckCircle size={14} />, label: '通过' },
  failed: { color: 'error', icon: <XCircle size={14} />, label: '失败' },
  error: { color: 'warning', icon: <AlertTriangle size={14} />, label: '错误' },
  running: { color: 'processing', icon: <Clock size={14} />, label: '运行中' },
  skipped: { color: 'default', icon: null, label: '跳过' },
}

// ==================== 变量提取 ====================

/** 从任意值中递归提取 {{varName}} 占位符 */
function extractVariables(value: unknown): string[] {
  const vars = new Set<string>()
  const regex = /\{\{(\w+)\}\}/g

  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      let match: RegExpExecArray | null
      while ((match = regex.exec(v)) !== null) {
        vars.add(match[1])
      }
    } else if (Array.isArray(v)) {
      v.forEach(walk)
    } else if (v !== null && typeof v === 'object') {
      Object.values(v as Record<string, unknown>).forEach(walk)
    }
  }

  walk(value)
  return Array.from(vars).sort()
}

/** 从 HttpRequest 节点数据中提取所有变量 */
function extractNodeVariables(nodeData: Record<string, unknown>): string[] {
  const override = nodeData.requestOverride as Record<string, unknown> | undefined
  if (!override) return []

  const sources = [
    override.queryParams,
    override.headers,
    override.pathParams,
    override.body,
  ]

  const allVars = new Set<string>()
  for (const src of sources) {
    for (const v of extractVariables(src)) {
      allVars.add(v)
    }
  }
  return Array.from(allVars).sort()
}

// ==================== localStorage 工具 ====================

const LS_PREFIX = 'single-run-vars-'

function loadSavedVars(nodeId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_PREFIX + nodeId)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveSavedVars(nodeId: string, vars: Record<string, string>) {
  try { localStorage.setItem(LS_PREFIX + nodeId, JSON.stringify(vars)) } catch { /* ignore */ }
}

// ==================== 组件 ====================

export default function NodeConfigDrawer() {
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId)
  const nodes = useFlowStore((s) => s.nodes)
  const drawerOpen = useFlowStore((s) => s.drawerOpen)
  const setDrawerOpen = useFlowStore((s) => s.setDrawerOpen)
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  const flowContext = useContext(FlowEditorContext)
  const projectId = flowContext?.projectId || ''
  const { sessionId } = useAuth()

  // 加载项目环境
  const [environments, setEnvironments] = useState<Array<{ name: string; agentUrl?: string; baseUrls?: Array<{ url: string }> }>>([])
  useEffect(() => {
    if (!sessionId || !projectId) return
    const fetchEnvs = async () => {
      try {
        const result = await invoke<{ ok: boolean; data?: { environments: Array<{ name: string; agentUrl?: string; baseUrls?: Array<{ url: string }> }> } }>(
          'get_project_environments',
          { sessionId, projectId },
        )
        if (result.ok && result.data) {
          setEnvironments(result.data.environments || [])
        }
      } catch { /* ignore */ }
    }
    fetchEnvs()
  }, [sessionId, projectId])

  // Drawer 宽度 + 拖拽调整
  const [drawerWidth, setDrawerWidth] = useState(480)
  const resizingRef = useRef(false)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    const startX = e.clientX
    const startWidth = drawerWidth
    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(360, Math.min(900, startWidth + (startX - ev.clientX)))
      setDrawerWidth(newWidth)
    }
    const onMouseUp = () => {
      resizingRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [drawerWidth])

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null

  const PanelComponent = selectedNode?.type
    ? getPanelComponent(selectedNode.type)
    : null

  const handleClose = useCallback(() => {
    setDrawerOpen(false)
  }, [setDrawerOpen])

  const handleBaseFieldsChange = useCallback(
    (partial: Partial<FlowNodeData>) => {
      if (selectedNodeId) {
        updateNodeData(selectedNodeId, partial)
      }
    },
    [selectedNodeId, updateNodeData],
  )

  const handlePanelChange = useCallback(
    (partial: Partial<FlowNodeData>) => {
      if (selectedNodeId) {
        updateNodeData(selectedNodeId, partial)
      }
    },
    [selectedNodeId, updateNodeData],
  )

  // 执行结果
  const nodeData = selectedNode?.data as Record<string, unknown> | undefined
  const execStatus = nodeData?.execStatus as NodeExecStatus | undefined
  const execError = nodeData?.execError as string | undefined
  const execDurationMs = nodeData?.execDurationMs as number | undefined
  const execRequest = nodeData?.execRequest as Record<string, unknown> | undefined
  const execResponse = nodeData?.execResponse as Record<string, unknown> | undefined

  const hasExecResult = execStatus && execStatus !== 'idle'

  // 单节点调试运行
  const [runModalOpen, setRunModalOpen] = useState(false)
  const [runVariables, setRunVariables] = useState<Record<string, string>>({})
  const [runVarNames, setRunVarNames] = useState<string[]>([])
  const [selectedEnvName, setSelectedEnvName] = useState<string>('')
  const [singleRunLoading, setSingleRunLoading] = useState(false)

  const handleRunClick = useCallback(() => {
    if (!nodeData) return
    const vars = extractNodeVariables(nodeData)
    const saved = selectedNodeId ? loadSavedVars(selectedNodeId) : {}
    const initial: Record<string, string> = {}
    for (const v of vars) {
      initial[v] = saved[v] || ''
    }
    setRunVarNames(vars)
    setRunVariables(initial)
    // 默认选第一个环境
    if (!selectedEnvName && environments.length > 0) {
      setSelectedEnvName(environments[0].name)
    }
    setRunModalOpen(true)
  }, [nodeData, selectedNodeId, environments, selectedEnvName])

  const executeSingleNode = useCallback(async (variables: Record<string, string>, envName: string) => {
    if (!selectedNode || !nodeData) return

    const menuItemId = nodeData.menuItemId as string
    if (!menuItemId) {
      message.error('节点未配置 API 接口')
      return
    }

    // 保存变量到 localStorage
    if (selectedNodeId) {
      saveSavedVars(selectedNodeId, variables)
    }

    setSingleRunLoading(true)
    try {
      // 从环境获取 baseUrl 和 agentUrl
      const env = environments.find(e => e.name === envName)
      const baseUrl = env?.baseUrls?.[0]?.url || undefined
      const agentUrl = (env as Record<string, unknown>)?.agentUrl as string | undefined

      // 推送 Mock 规则（如果节点配置了）
      const nodeMockRules = nodeData.mockRules as Array<Record<string, unknown>> | undefined
      if (agentUrl && nodeMockRules && nodeMockRules.length > 0) {
        try {
          const payload = buildSingleNodeMockPayload(nodeMockRules, variables)
          if (payload.length > 0) {
            await invoke('push_mock_rules', { agentUrl, rules: payload })
          }
        } catch {
          // Mock 推送失败不影响请求
        }
      }

      // 构建 requestOverride 并替换变量
      let override = nodeData.requestOverride as Record<string, unknown> | undefined
      if (override && Object.keys(variables).length > 0) {
        override = interpolateOverride(override, variables) as Record<string, unknown>
      }

      const result = await invoke<{ ok: boolean; data?: { request: Record<string, unknown>; response: { status: number; headers: Record<string, string>; body: string; responseTime: number } }; error?: string }>(
        'execute_flow_node_request',
        {
          projectId,
          menuItemId,
          requestOverride: override || null,
          variables,
          baseUrl: baseUrl || null,
        },
      )

      // 清除 Mock 规则
      if (agentUrl) {
        try { await invoke('clear_mock_rules', { agentUrl }) } catch { /* ignore */ }
      }

      if (!result.ok || !result.data) {
        const errMsg = result.error || '请求失败'
        // 写入节点数据
        if (selectedNodeId) {
          updateNodeData(selectedNodeId, {
            execStatus: 'error' as NodeExecStatus,
            execError: errMsg,
            execDurationMs: 0,
          })
        }
        message.error(errMsg)
        return
      }

      const resp = result.data.response
      // 写入节点数据
      if (selectedNodeId) {
        updateNodeData(selectedNodeId, {
          execStatus: (resp.status >= 200 && resp.status < 400 ? 'passed' : 'failed') as NodeExecStatus,
          execError: undefined,
          execDurationMs: resp.responseTime,
          execRequest: result.data.request,
          execResponse: {
            status: resp.status,
            headers: resp.headers,
            body: resp.body,
            duration_ms: resp.responseTime,
          },
        })
      }
    } catch (err) {
      const errMsg = `请求异常: ${err}`
      if (selectedNodeId) {
        updateNodeData(selectedNodeId, {
          execStatus: 'error' as NodeExecStatus,
          execError: errMsg,
        })
      }
      message.error(errMsg)
    } finally {
      setSingleRunLoading(false)
    }
  }, [selectedNode, nodeData, selectedNodeId, projectId, updateNodeData])

  return (
    <>
      <Drawer
        title="节点配置"
        placement="right"
        width={drawerWidth}
        open={drawerOpen && !!selectedNode}
        onClose={handleClose}
        data-testid="node-config-drawer"
        styles={{ body: { position: 'relative' } }}
      >
        {/* 左侧拖拽调整手柄 */}
        <div className={resizeHandleClass} onMouseDown={handleResizeStart} />
        {selectedNode && (
          <div className="space-y-4">
            {/* 节点类型头部 + 运行按钮 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <TypeHeader
                nodeType={selectedNode.type}
                nodeId={selectedNode.id}
              />
              {selectedNode.type === FlowNodeType.HttpRequest && (
                <Button
                  type="primary"
                  size="small"
                  icon={singleRunLoading ? <Spin size="small" /> : <Play size={12} />}
                  loading={singleRunLoading}
                  onClick={handleRunClick}
                  disabled={singleRunLoading}
                >
                  {singleRunLoading ? '运行中...' : '单独运行'}
                </Button>
              )}
            </div>

            <Divider style={{ margin: '12px 0' }} />

            {/* 基础字段 */}
            <BaseFields
              data={selectedNode.data as FlowNodeData}
              onChange={handleBaseFieldsChange}
            />

            {/* 运行结果 */}
            {hasExecResult && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <ExecResultSection
                  status={execStatus}
                  error={execError}
                  durationMs={execDurationMs}
                  request={execRequest}
                  response={execResponse}
                />
              </>
            )}

            {/* 类型特有字段面板 */}
            {PanelComponent && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <PanelComponent
                  data={selectedNode.data as FlowNodeData}
                  onChange={handlePanelChange}
                  projectId={projectId}
                />
              </>
            )}
          </div>
        )}
      </Drawer>

      {/* 运行配置弹窗 */}
      <Modal
        title="单独运行"
        open={runModalOpen}
        onCancel={() => setRunModalOpen(false)}
        onOk={() => {
          if (!selectedEnvName) {
            message.warning('请选择运行环境')
            return
          }
          setRunModalOpen(false)
          executeSingleNode(runVariables, selectedEnvName)
        }}
        okText="运行"
        cancelText="取消"
        width={480}
      >
        <div className="space-y-3">
          {/* 环境选择 */}
          <div>
            <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
              运行环境
            </Text>
            <Select
              size="small"
              value={selectedEnvName || undefined}
              onChange={setSelectedEnvName}
              placeholder="选择运行环境"
              style={{ width: '100%' }}
              options={environments.map(e => ({
                value: e.name,
                label: `${e.name}${e.baseUrls?.[0]?.url ? ` (${e.baseUrls[0].url})` : ''}`,
              }))}
            />
          </div>

          {/* 变量填写 */}
          {runVarNames.length > 0 && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                该请求包含变量，请填写：
              </Text>
              {runVarNames.map((varName) => (
                <div key={varName}>
                  <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 2 }}>
                    {`{{${varName}}}`}
                  </Text>
                  <Input
                    size="small"
                    value={runVariables[varName] || ''}
                    onChange={(e) => setRunVariables((prev) => ({ ...prev, [varName]: e.target.value }))}
                    placeholder={`输入 ${varName} 的值`}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </Modal>
    </>
  )
}

// ==================== 变量替换 ====================

/** 递归替换对象中的 {{var}} 占位符 */
function interpolateOverride(obj: unknown, variables: Record<string, string>): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`)
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => interpolateOverride(item, variables))
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = interpolateOverride(v, variables)
    }
    return result
  }
  return obj
}

// ==================== Mock 规则推送辅助 ====================

/** 将 HttpRequest 节点中的 mockRules 转为 Agent payload 格式并插值变量 */
function buildSingleNodeMockPayload(rules: Array<Record<string, unknown>>, variables: Record<string, string>): Array<Record<string, unknown>> {
  return rules
    .filter(r => r.enabled !== false)
    .map(r => {
      const template = r.responseTemplate
      const interpolated = variables && Object.keys(variables).length > 0
        ? interpolateOverride(template, variables)
        : template
      return {
        id: r.id,
        className: r.className,
        methodName: r.methodName,
        paramTypes: r.paramTypes || undefined,
        responseTemplate: typeof interpolated === 'string' ? interpolated : JSON.stringify(interpolated),
        responseDelay: r.responseDelay || undefined,
        maxTimes: r.maxTimes || undefined,
        returnType: r.responseClassName || undefined,
      }
    })
}

// ==================== 运行结果组件 ====================

interface ExecResultProps {
  status: NodeExecStatus
  error?: string
  durationMs?: number
  request?: Record<string, unknown>
  response?: Record<string, unknown>
}

function ExecResultSection({ status, error, durationMs, request, response }: ExecResultProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.error

  const collapseItems = []

  if (request) {
    collapseItems.push({
      key: 'request',
      label: '请求详情',
      children: (
        <div className={codeBlockClass}>
          {formatRequest(request)}
        </div>
      ),
    })
  }

  if (response) {
    collapseItems.push({
      key: 'response',
      label: '响应详情',
      defaultActiveKey: true,
      children: (
        <div className={codeBlockClass}>
          {formatResponse(response)}
        </div>
      ),
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Text strong style={{ fontSize: 13 }}>运行结果</Text>
        <Tag color={config.color} icon={config.icon}>
          {config.label}
        </Tag>
        {durationMs !== undefined && (
          <Text type="secondary" style={{ fontSize: 12 }}>{durationMs}ms</Text>
        )}
      </div>

      {/* 错误信息 */}
      {error && (
        <div className={resultBlockClass} style={{ borderColor: '#fca5a5', background: '#fef2f2', marginBottom: 8 }}>
          <Text type="danger" style={{ fontSize: 12 }}>{error}</Text>
        </div>
      )}

      {/* 请求/响应折叠面板 */}
      {collapseItems.length > 0 && (
        <Collapse items={collapseItems} size="small" />
      )}
    </div>
  )
}

function formatRequest(req: Record<string, unknown>): string {
  const parts: string[] = []
  if (req.method) parts.push(`${req.method} ${req.url || ''}`)
  parts.push('')
  if (req.headers && typeof req.headers === 'object') {
    parts.push('── Headers ──')
    const headers = req.headers
    if (Array.isArray(headers)) {
      // 后端返回的请求头是 [{name, value}, ...] 格式
      for (const h of headers) {
        const name = (h as Record<string, unknown>)?.name ?? ''
        const value = (h as Record<string, unknown>)?.value ?? ''
        parts.push(`  ${name}: ${value}`)
      }
    } else {
      // 响应头是 key: value 对象格式
      for (const [k, v] of Object.entries(headers as Record<string, string>)) {
        parts.push(`  ${k}: ${v}`)
      }
    }
  }
  if (req.body && req.body !== '(empty)' && req.body !== '') {
    parts.push('')
    parts.push('── Body ──')
    try {
      parts.push(typeof req.body === 'string' ? req.body : JSON.stringify(req.body, null, 2))
    } catch {
      parts.push(String(req.body))
    }
  }
  return parts.join('\n') || '(无详情)'
}

function formatResponse(resp: Record<string, unknown>): string {
  const parts: string[] = []
  if (resp.status) {
    const status = resp.status as number
    const statusText = status >= 200 && status < 300 ? 'OK' : status >= 400 ? 'Error' : ''
    parts.push(`HTTP ${status} ${statusText}`)
  }
  if (resp.duration_ms !== undefined) parts.push(`耗时: ${resp.duration_ms}ms`)
  parts.push('')
  if (resp.headers && typeof resp.headers === 'object') {
    parts.push('── Headers ──')
    const headers = resp.headers as Record<string, string>
    for (const [k, v] of Object.entries(headers)) {
      parts.push(`  ${k}: ${v}`)
    }
  }
  if (resp.body) {
    parts.push('')
    parts.push('── Body ──')
    const body = typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body, null, 2)
    try {
      const parsed = JSON.parse(body)
      parts.push(JSON.stringify(parsed, null, 2))
    } catch {
      parts.push(body)
    }
  }
  return parts.join('\n') || '(无详情)'
}
