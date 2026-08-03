import { useCallback, useEffect, useRef, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'
import { Button, Divider, Modal, Select, Space, Switch, Tag, Typography } from 'antd'
import { AlertTriangle, CheckCircle, Clock, Play, SkipForward, Square, XCircle } from 'lucide-react'

import { type FlowExecLog, type useFlowExecution, type VariableSource } from '../hooks/useFlowExecution'
import { type FlowEdge, type FlowNode, NODE_TYPE_LABELS, type NodeExecStatus } from '../types/flow.types'

import { css } from '@emotion/css'

export type { VariableSource }

const { Text } = Typography

// ==================== 样式 ====================

const logClass = css`
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.8;
  overflow-y: auto;
  padding: var(--ds-pad-sm);
  background: var(--ds-code-bg);
  border-radius: 6px;
  color: var(--ds-code-color);
  position: relative;
`

const resizeHandleClass = css`
  height: 6px;
  cursor: ns-resize;
  background: transparent;
  position: relative;
  &:hover::after, &:active::after {
    content: '';
    position: absolute;
    left: 30%;
    right: 30%;
    top: 2px;
    height: 2px;
    background: var(--ds-divider-color);
    border-radius: 1px;
  }
`

const logLineClass = css`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 4px;
  border-radius: 3px;
  &:hover { background: rgba(255,255,255,0.05); }
`

const statusIconMap: Record<NodeExecStatus, React.ReactNode> = {
  idle: <Clock color="var(--ds-node-text-muted)" size={12} />,
  running: <Clock color="var(--ds-highlight-selected)" size={12} />,
  passed: <CheckCircle color="var(--ds-success-color)" size={12} />,
  failed: <XCircle color="var(--ds-error-color)" size={12} />,
  skipped: <SkipForward color="var(--ds-node-text-muted)" size={12} />,
  error: <AlertTriangle color="var(--ds-error-color)" size={12} />,
}

// ==================== 组件 ====================

interface Environment {
  name: string
  url?: string
  baseUrls?: { id: string, url: string }[]
  variables?: { id: string, name: string, value?: string, enable?: boolean }[] | Record<string, string>
  agentUrl?: string
  [key: string]: unknown
}

interface RunFlowModalProps {
  open: boolean
  onClose: () => void
  taskId: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  projectId: string
  environments?: Environment[]
  /** 执行引擎（由父组件持有，便于工具栏同步运行/中止状态） */
  execution: ReturnType<typeof useFlowExecution>
  onNodeStatusChange?: (nodeId: string, status: NodeExecStatus, extra?: {
    execError?: string
    execDurationMs?: number
    execRequest?: Record<string, unknown>
    execResponse?: Record<string, unknown>
  }) => void
  onRunComplete?: (variableSources: Record<string, VariableSource>) => void
}

export default function RunFlowModal({
  open,
  onClose,
  taskId,
  nodes,
  edges,
  projectId,
  environments = [],
  execution,
  onNodeStatusChange,
  onRunComplete,
}: RunFlowModalProps) {
  const [selectedEnv, setSelectedEnv] = useState<string>('')
  const [failFast, setFailFast] = useState(true)
  const [logHeight, setLogHeight] = useState(400)
  const { state, executeFlow, abort, reset } = execution
  const logEndRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)

  // 自动滚动到底部（仅在未手动调整大小时）
  useEffect(() => {
    if (!resizingRef.current) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [state.logs.length])

  // 拖拽调整日志面板高度
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    const startY = e.clientY
    const startHeight = logHeight

    const onMouseMove = (ev: MouseEvent) => {
      const newHeight = Math.max(150, startHeight + (ev.clientY - startY))
      setLogHeight(newHeight)
    }

    const onMouseUp = () => {
      resizingRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [logHeight])

  // 弹窗打开时重置
  useEffect(() => {
    if (open) {
      reset()

      if (environments.length > 0 && !selectedEnv) {
        setSelectedEnv(environments[0].name)
      }
    }
  }, [open])

  const handleRun = useCallback(async () => {
    const env = environments.find((e) => e.name === selectedEnv)

    if (!env) { return } // 未选择环境（按钮已禁用，此处兜底）

    // 优先取 baseUrls[0].url，其次取 env.url
    const baseUrl = env?.baseUrls?.[0]?.url ?? env?.url ?? undefined
    // variables 是 [{name, value}] 数组，转为 Record
    const initialVars: Record<string, string> = {}

    if (env?.variables) {
      if (Array.isArray(env.variables)) {
        for (const v of env.variables) {
          if (v.name && v.enable !== false) { initialVars[v.name] = v.value ?? '' }
        }
      }
      else {
        for (const [name, value] of Object.entries(env.variables)) {
          if (name) { initialVars[name] = value || '' }
        }
      }
    }

    const agentUrl = typeof env?.agentUrl === 'string' ? env.agentUrl : undefined
    const result = await executeFlow(nodes, edges, projectId, baseUrl, initialVars, failFast, undefined, agentUrl)

    // 回调节点状态变化
    if (onNodeStatusChange && result) {
      for (const [nodeId, status] of Object.entries(result.nodeStatuses)) {
        onNodeStatusChange(nodeId, status, {
          execError: result.nodeErrors[nodeId],
          execDurationMs: result.nodeDurations[nodeId],
          execRequest: result.nodeRequests[nodeId],
          execResponse: result.nodeResponses[nodeId],
        })
      }
    }

    // 传出变量来源数据
    if (onRunComplete && result) {
      onRunComplete(result.variableSources)
    }

    // 持久化执行记录
    if (result) {
      try {
        const execRes = await invoke<{ ok: boolean, data?: { id: string } }>(
          'create_test_execution',
          { taskId, envJson: selectedEnv ? { name: selectedEnv } : null },
        )

        if (execRes.ok && execRes.data) {
          const executionId = execRes.data.id
          let sortOrder = 0

          for (const [nodeId, status] of Object.entries(result.nodeStatuses)) {
            if (status === 'idle') { continue }

            const stepData = {
              id: crypto.randomUUID(),
              executionId,
              stepId: nodeId,
              sortOrder: sortOrder++,
              status,
              requestJson: result.nodeRequests[nodeId] || null,
              responseJson: result.nodeResponses[nodeId] || null,
              scriptResultsJson: null,
              variableDeltasJson: null,
              durationMs: result.nodeDurations[nodeId] || 0,
              errorMessage: result.nodeErrors[nodeId] || null,
              executedAt: new Date().toISOString(),
            }

            try {
              await invoke('create_test_step_result', { result: stepData })
            }
            catch (stepErr) {
              console.error(`[RunFlowModal] 保存步骤 ${nodeId} 失败:`, stepErr)
            }
          }

          const passed = Object.values(result.nodeStatuses).filter((s) => s === 'passed').length
          const failed = Object.values(result.nodeStatuses).filter((s) => s === 'failed' || s === 'error').length
          const skipped = Object.values(result.nodeStatuses).filter((s) => s === 'skipped').length
          const duration = result.endTime && result.startTime ? result.endTime - result.startTime : 0
          await invoke('finish_test_execution', {
            execId: executionId,
            status: result.status,
            passed,
            failed,
            skipped,
            duration,
          })
        }
      }
      catch (err) {
        console.error('[RunFlowModal] 保存执行记录失败:', err)
      }
    }
  }, [nodes, edges, projectId, taskId, selectedEnv, environments, executeFlow, onNodeStatusChange, onRunComplete])

  const handleClose = useCallback(() => {
    if (state.status === 'running') {
      abort()
    }

    onClose()
  }, [state.status, abort, onClose])

  // 执行统计
  const stats = {
    total: Object.keys(state.nodeStatuses).length,
    passed: Object.values(state.nodeStatuses).filter((s) => s === 'passed').length,
    failed: Object.values(state.nodeStatuses).filter((s) => s === 'failed' || s === 'error').length,
    running: Object.values(state.nodeStatuses).filter((s) => s === 'running').length,
    duration: state.endTime && state.startTime ? state.endTime - state.startTime : undefined,
  }

  return (
    <Modal
      destroyOnClose
      footer={(
        <Space>
          <Button onClick={handleClose}>
            {state.status === 'running' ? '中止并关闭' : '关闭'}
          </Button>
          {state.status === 'running' && (
            <Button danger icon={<Square size={14} />} onClick={abort}>
              中止
            </Button>
          )}
          {(state.status === 'idle' || state.status === 'passed' || state.status === 'failed' || state.status === 'aborted') && (
            <Button
              disabled={!selectedEnv}
              icon={<Play size={14} />}
              type="primary"
              onClick={() => { void handleRun() }}
            >
              {state.status === 'idle' ? '开始运行' : '重新运行'}
            </Button>
          )}
        </Space>
      )}
      open={open}
      title="运行测试流程"
      width={720}
      onCancel={handleClose}
    >
      {/* 配置区 */}
      <div style={{ display: 'flex', gap: 'var(--ds-pad-lg)', marginBottom: 'var(--ds-pad-md)', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <Text style={{ display: 'block', fontSize: 12, marginBottom: 4 }} type="secondary">
            运行环境
          </Text>
          <Select
            options={environments.map((e) => {
              const url = e.baseUrls?.[0]?.url ?? e.url ?? ''

              return {
                value: e.name,
                label: `${e.name}${url ? ` (${url})` : ''}`,
              }
            })}
            placeholder="选择运行环境"
            size="small"
            status={selectedEnv ? undefined : 'warning'}
            style={{ width: '100%' }}
            value={selectedEnv || undefined}
            onChange={setSelectedEnv}
          />
        </div>
        <div>
          <Text style={{ display: 'block', fontSize: 12, marginBottom: 4 }} type="secondary">
            快速失败
          </Text>
          <Switch checked={failFast} size="small" onChange={setFailFast} />
        </div>
      </div>
      {!selectedEnv && (
        <Text style={{ display: 'block', fontSize: 12, marginBottom: 'var(--ds-pad-md)' }} type="warning">
          {environments.length === 0
            ? '当前项目未配置环境。请先在「环境」管理中创建环境（含 Base URL），否则相对路径请求无法解析。'
            : '请先选择运行环境（需包含 Base URL），否则相对路径请求无法解析。'}
        </Text>
      )}

      {/* 状态统计 */}
      {state.status !== 'idle' && (
        <div style={{ display: 'flex', gap: 'var(--ds-pad-md)', marginBottom: 'var(--ds-pad-md)' }}>
          <Tag color={state.status === 'running' ? 'processing' : state.status === 'passed' ? 'success' : 'error'}>
            {state.status === 'running' ? '运行中' : state.status === 'passed' ? '通过' : state.status === 'failed' ? '失败' : '中止'}
          </Tag>
          <Text style={{ fontSize: 12 }} type="secondary">
            通过 {stats.passed} / 失败 {stats.failed} / 共 {stats.total}
            {stats.duration !== undefined && ` · ${(stats.duration / 1000).toFixed(1)}s`}
          </Text>
        </div>
      )}

      {/* 日志面板 */}
      {state.logs.length > 0 && (
        <>
          <Divider style={{ margin: 'var(--ds-pad-sm) 0' }} />
          <div className={logClass} style={{ height: logHeight }}>
            {state.logs.map((log, i) => (
              <LogLine key={i} log={log} />
            ))}
            <div ref={logEndRef} />
          </div>
          <div className={resizeHandleClass} onMouseDown={handleResizeStart} />
        </>
      )}

      {/* 初始提示 */}
      {state.status === 'idle' && state.logs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ds-node-text-muted)' }}>
          <Play size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
          <div>选择环境后点击「开始运行」</div>
        </div>
      )}
    </Modal>
  )
}

// ==================== 日志行组件 ====================

function LogLine({ log }: { log: FlowExecLog }) {
  const [expanded, setExpanded] = useState(false)
  const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false })

  const hasDetails = log.requestJson ?? log.responseJson ?? (log.variables && Object.keys(log.variables).length > 0)

  return (
    <div className={logLineClass}>
      <span style={{ color: 'var(--ds-node-text-secondary)', flexShrink: 0, width: 70 }}>{time}</span>
      <span style={{ flexShrink: 0, width: 16 }}>{statusIconMap[log.status]}</span>
      <span style={{ color: 'var(--ds-node-text-muted)', flexShrink: 0, width: 40 }}>
        [{NODE_TYPE_LABELS[log.nodeType] || log.nodeType}]
      </span>
      <span style={{ fontWeight: 600, color: 'var(--ds-code-color)', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {log.nodeName}
      </span>
      <span style={{ flex: 1, color: log.status === 'error' || log.status === 'failed' ? 'var(--ds-error-color)' : 'var(--ds-code-color)' }}>
        {log.message}
        {log.durationMs !== undefined && (
          <span style={{ color: 'var(--ds-node-text-secondary)', marginLeft: 4 }}>({log.durationMs}ms)</span>
        )}
      </span>
      {hasDetails && (
        <span
          style={{ color: 'var(--ds-highlight-selected)', cursor: 'pointer', fontSize: 11 }}
          onClick={() => { setExpanded(!expanded) }}
        >
          {expanded ? '收起' : '详情'}
        </span>
      )}
    </div>
  )
}
