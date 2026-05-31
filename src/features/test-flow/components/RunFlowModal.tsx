import { useState, useEffect, useRef, useCallback } from 'react'
import { Modal, Select, Button, Space, Typography, Tag, Divider, Switch, Collapse } from 'antd'
import { Play, Square, CheckCircle, XCircle, Clock, AlertTriangle, SkipForward } from 'lucide-react'
import { css } from '@emotion/css'
import type { FlowNode, FlowEdge, FlowNodeType, NodeExecStatus } from '../types/flow.types'
import { FlowNodeType as NT } from '../types/flow.types'
import { useFlowExecution, type FlowExecLog, type FlowExecState } from '../hooks/useFlowExecution'

const { Text } = Typography

// ==================== 样式 ====================

const logClass = css`
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.8;
  max-height: 400px;
  overflow-y: auto;
  padding: 8px;
  background: #1e1e1e;
  border-radius: 6px;
  color: #d4d4d4;
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
  idle: <Clock size={12} color="#9ca3af" />,
  running: <Clock size={12} color="#3b82f6" />,
  passed: <CheckCircle size={12} color="#22c55e" />,
  failed: <XCircle size={12} color="#ef4444" />,
  skipped: <SkipForward size={12} color="#9ca3af" />,
  error: <AlertTriangle size={12} color="#f97316" />,
}

const NODE_TYPE_LABELS: Record<string, string> = {
  [NT.Start]: '开始',
  [NT.End]: '结束',
  [NT.HttpRequest]: 'HTTP',
  [NT.Condition]: '条件',
  [NT.Loop]: '循环',
  [NT.Parallel]: '并行',
  [NT.Wait]: '等待',
  [NT.SetVariable]: '变量',
  [NT.Assert]: '断言',
  [NT.SubFlow]: '子流程',
}

// ==================== 组件 ====================

interface Environment {
  name: string
  url?: string
  baseUrls?: Array<{ id: string; name: string; url: string }>
  variables?: Array<{ id: string; name: string; value?: string; enable?: boolean }>
  [key: string]: unknown
}

interface RunFlowModalProps {
  open: boolean
  onClose: () => void
  nodes: FlowNode[]
  edges: FlowEdge[]
  projectId: string
  environments?: Environment[]
  onNodeStatusChange?: (nodeId: string, status: NodeExecStatus, extra?: {
    execError?: string
    execDurationMs?: number
    execRequest?: Record<string, unknown>
    execResponse?: Record<string, unknown>
  }) => void
}

export default function RunFlowModal({
  open,
  onClose,
  nodes,
  edges,
  projectId,
  environments = [],
  onNodeStatusChange,
}: RunFlowModalProps) {
  const [selectedEnv, setSelectedEnv] = useState<string>('')
  const [failFast, setFailFast] = useState(true)
  const { state, executeFlow, abort, reset } = useFlowExecution()
  const logEndRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.logs.length])

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
    // 优先取 baseUrls[0].url，其次取 env.url
    const baseUrl = env?.baseUrls?.[0]?.url || env?.url || undefined
    // variables 是 [{name, value}] 数组，转为 Record
    const initialVars: Record<string, string> = {}
    if (env?.variables) {
      for (const v of env.variables) {
        if (v.name && v.enable !== false) initialVars[v.name] = v.value || ''
      }
    }

    const result = await executeFlow(nodes, edges, projectId, baseUrl, initialVars, failFast)

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
  }, [nodes, edges, projectId, selectedEnv, environments, executeFlow, onNodeStatusChange])

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
      title="运行测试流程"
      open={open}
      onCancel={handleClose}
      width={720}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={handleClose}>
            {state.status === 'running' ? '关闭（后台继续）' : '关闭'}
          </Button>
          {state.status === 'running' && (
            <Button danger icon={<Square size={14} />} onClick={abort}>
              中止
            </Button>
          )}
          {(state.status === 'idle' || state.status === 'passed' || state.status === 'failed' || state.status === 'aborted') && (
            <Button
              type="primary"
              icon={<Play size={14} />}
              onClick={handleRun}
              disabled={state.status === 'running'}
            >
              {state.status === 'idle' ? '开始运行' : '重新运行'}
            </Button>
          )}
        </Space>
      }
    >
      {/* 配置区 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            运行环境
          </Text>
          <Select
            value={selectedEnv || undefined}
            onChange={setSelectedEnv}
            placeholder="选择运行环境"
            style={{ width: '100%' }}
            size="small"
            options={environments.map((e) => {
              const url = e.baseUrls?.[0]?.url || e.url || ''
              return {
                value: e.name,
                label: `${e.name}${url ? ` (${url})` : ''}`,
              }
            })}
          />
        </div>
        <div>
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            快速失败
          </Text>
          <Switch checked={failFast} onChange={setFailFast} size="small" />
        </div>
      </div>

      {/* 状态统计 */}
      {state.status !== 'idle' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <Tag color={state.status === 'running' ? 'processing' : state.status === 'passed' ? 'success' : 'error'}>
            {state.status === 'running' ? '运行中' : state.status === 'passed' ? '通过' : state.status === 'failed' ? '失败' : '中止'}
          </Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            通过 {stats.passed} / 失败 {stats.failed} / 共 {stats.total}
            {stats.duration !== undefined && ` · ${(stats.duration / 1000).toFixed(1)}s`}
          </Text>
        </div>
      )}

      {/* 日志面板 */}
      {state.logs.length > 0 && (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <div className={logClass}>
            {state.logs.map((log, i) => (
              <LogLine key={i} log={log} />
            ))}
            <div ref={logEndRef} />
          </div>
        </>
      )}

      {/* 初始提示 */}
      {state.status === 'idle' && state.logs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
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

  const hasDetails = log.requestJson || log.responseJson || (log.variables && Object.keys(log.variables).length > 0)

  return (
    <div className={logLineClass}>
      <span style={{ color: '#6b7280', flexShrink: 0, width: 70 }}>{time}</span>
      <span style={{ flexShrink: 0, width: 16 }}>{statusIconMap[log.status]}</span>
      <span style={{ color: '#94a3b8', flexShrink: 0, width: 40 }}>
        [{NODE_TYPE_LABELS[log.nodeType] || log.nodeType}]
      </span>
      <span style={{ fontWeight: 600, color: '#e5e7eb', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {log.nodeName}
      </span>
      <span style={{ flex: 1, color: log.status === 'error' || log.status === 'failed' ? '#f87171' : '#d4d4d4' }}>
        {log.message}
        {log.durationMs !== undefined && (
          <span style={{ color: '#6b7280', marginLeft: 4 }}>({log.durationMs}ms)</span>
        )}
      </span>
      {hasDetails && (
        <span
          style={{ color: '#60a5fa', cursor: 'pointer', fontSize: 11 }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起' : '详情'}
        </span>
      )}
    </div>
  )
}
