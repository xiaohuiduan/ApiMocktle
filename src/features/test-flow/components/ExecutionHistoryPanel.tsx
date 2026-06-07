import { useEffect, useState, useCallback, useMemo } from 'react'
import { Tag, Button, Popconfirm, Spin, Empty, Modal, Collapse, Typography } from 'antd'
import { RefreshCw, Trash2, Clock, ChevronRight, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { css } from '@emotion/css'
import { useTestExecutions } from '@/hooks/useTestTask'
import { useFlowStore } from '../store/useFlowStore'
import type { TestExecution, TestExecutionDetail, TestStepResult } from '@/types'

const { Text } = Typography

// ==================== 样式 ====================

const codeBlockClass = css`
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 4px;
  padding: 8px 10px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  max-height: 250px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 4px 0;
`

const resultBlockClass = css`
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
`

const STEP_STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  passed: { color: 'success', icon: <CheckCircle size={14} />, label: '通过' },
  failed: { color: 'error', icon: <XCircle size={14} />, label: '失败' },
  error: { color: 'warning', icon: <AlertTriangle size={14} />, label: '错误' },
  skipped: { color: 'default', icon: null, label: '跳过' },
}

const EXEC_STATUS_COLORS: Record<string, string> = {
  passed: '#22c55e',
  failed: '#ef4444',
  aborted: '#f59e0b',
  error: '#ef4444',
  running: '#3b82f6',
}

const EXEC_STATUS_LABELS: Record<string, string> = {
  passed: '通过',
  failed: '失败',
  aborted: '中止',
  error: '错误',
  running: '运行中',
}

// ==================== 工具函数 ====================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m${s}s`
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return date.toLocaleString()
}

function formatRequestText(req: Record<string, unknown>): string {
  const lines: string[] = []
  lines.push(`${String(req.method || 'GET')} ${String(req.url || '')}`)
  const headers = req.headers as Array<{ name: string; value: string }> | undefined
  if (headers && headers.length > 0) {
    lines.push('\n-- Headers --')
    for (const h of headers) lines.push(`${h.name}: ${h.value}`)
  }
  if (req.body) {
    lines.push('\n-- Body --')
    try { lines.push(JSON.stringify(JSON.parse(String(req.body)), null, 2)) } catch { lines.push(String(req.body)) }
  }
  return lines.join('\n') || '(无详情)'
}

function formatResponseText(resp: Record<string, unknown>): string {
  const lines: string[] = []
  const status = Number(resp.status || 0)
  lines.push(`HTTP ${status} ${status >= 200 && status < 400 ? 'OK' : 'Error'}`)
  if (resp.duration_ms) lines.push(`耗时: ${resp.duration_ms}ms`)
  const headers = resp.headers as Record<string, string> | undefined
  if (headers && Object.keys(headers).length > 0) {
    lines.push('\n-- Headers --')
    for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`)
  }
  if (resp.body) {
    lines.push('\n-- Body --')
    try { lines.push(JSON.stringify(JSON.parse(String(resp.body)), null, 2)) } catch { lines.push(String(resp.body)) }
  }
  return lines.join('\n') || '(无详情)'
}

// ==================== 步骤详情 Modal ====================

interface StepDetailModalProps {
  step: TestStepResult | null
  nodeLabel: string
  onClose: () => void
}

function StepDetailModal({ step, nodeLabel, onClose }: StepDetailModalProps) {
  if (!step) return null

  const config = STEP_STATUS_CONFIG[step.status] || STEP_STATUS_CONFIG.skipped
  const req = step.requestJson as Record<string, unknown> | undefined
  const resp = step.responseJson as Record<string, unknown> | undefined
  const hasRequest = req && Object.keys(req).length > 0
  const hasResponse = resp && Object.keys(resp).length > 0

  return (
    <Modal
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{nodeLabel || step.stepId}</span>
          <Tag icon={config.icon} color={config.color} style={{ margin: 0 }}>
            {config.label}
          </Tag>
          {step.durationMs > 0 && (
            <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 'normal' }}>{step.durationMs}ms</span>
          )}
        </span>
      }
      open={!!step}
      onCancel={onClose}
      footer={null}
      width={560}
      styles={{ body: { padding: '12px 0' } }}
    >
      {/* 错误信息 */}
      {step.errorMessage && (
        <div
          className={resultBlockClass}
          style={{ marginBottom: 12, borderColor: '#fca5a5', background: '#fef2f2' }}
        >
          <Text type="danger" style={{ fontSize: 12 }}>{step.errorMessage}</Text>
        </div>
      )}

      {/* 请求/响应详情 */}
      {(hasRequest || hasResponse) ? (
        <Collapse
          size="small"
          defaultActiveKey={hasRequest ? ['request'] : undefined}
          items={[
            ...(hasRequest ? [{
              key: 'request',
              label: <span style={{ fontSize: 12 }}>请求详情</span>,
              children: <div className={codeBlockClass}>{formatRequestText(req!)}</div>,
            }] : []),
            ...(hasResponse ? [{
              key: 'response',
              label: <span style={{ fontSize: 12 }}>响应详情</span>,
              children: <div className={codeBlockClass}>{formatResponseText(resp!)}</div>,
            }] : []),
          ]}
        />
      ) : (
        !step.errorMessage && <Text type="secondary" style={{ fontSize: 12 }}>此步骤无详细数据</Text>
      )}
    </Modal>
  )
}

// ==================== 执行记录详情（步骤列表） ====================

function ExecutionDetail({ executionId, taskId }: { executionId: string; taskId: string }) {
  const { getExecutionDetail } = useTestExecutions(taskId)
  const nodes = useFlowStore((s) => s.nodes)
  const [steps, setSteps] = useState<TestStepResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStep, setSelectedStep] = useState<TestStepResult | null>(null)

  // 节点 ID → 标签映射
  const nodeLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const n of nodes) {
      map[n.id] = (n.data?.label as string) || n.id
    }
    return map
  }, [nodes])

  const getLabel = useCallback((stepId: string) => nodeLabelMap[stepId] || stepId, [nodeLabelMap])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const d = await getExecutionDetail(executionId)
        if (!cancelled && d) {
          const raw = d as unknown as Record<string, unknown>
          const result = (d.stepResults ?? raw.step_results ?? []) as TestStepResult[]
          setSteps(result)
        }
      } catch (err) {
        if (!cancelled) setError(`加载失败: ${err}`)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [executionId, getExecutionDetail])

  if (loading) return <Spin size="small" style={{ display: 'block', margin: '8px auto' }} />
  if (error) return <div style={{ padding: 8, color: '#ef4444', fontSize: 11, textAlign: 'center' }}>{error}</div>
  if (!steps.length) {
    return <div style={{ padding: 8, color: '#9ca3af', fontSize: 11, textAlign: 'center' }}>无步骤详情</div>
  }

  const sorted = [...steps].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <>
      <div style={{ padding: '2px 0' }}>
        {sorted.map((step) => {
          const color = EXEC_STATUS_COLORS[step.status] || '#9ca3af'
          const hasDetail = step.requestJson || step.responseJson || step.errorMessage
          return (
            <div
              key={step.id}
              onClick={() => setSelectedStep(step)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 6px',
                fontSize: 11,
                cursor: 'pointer',
                borderRadius: 4,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f5f5f5' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getLabel(step.stepId)}
              </span>
              {step.errorMessage && (
                <span style={{ color: '#ef4444', fontSize: 10, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={step.errorMessage}>
                  ✗
                </span>
              )}
              {hasDetail && (
                <ChevronRight size={10} color="#9ca3af" style={{ flexShrink: 0 }} />
              )}
              <span style={{ color: '#9ca3af', flexShrink: 0 }}>{formatDuration(step.durationMs)}</span>
            </div>
          )
        })}
      </div>

      <StepDetailModal step={selectedStep} nodeLabel={selectedStep ? getLabel(selectedStep.stepId) : ''} onClose={() => setSelectedStep(null)} />
    </>
  )
}

// ==================== 组件 ====================

export default function ExecutionHistoryPanel({ taskId }: { taskId: string }) {
  const { executions, loading, fetchExecutions, deleteExecution } = useTestExecutions(taskId)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    fetchExecutions(20)
  }, [fetchExecutions])

  const handleRefresh = useCallback(() => {
    fetchExecutions(20)
  }, [fetchExecutions])

  const handleDelete = useCallback(async (id: string) => {
    await deleteExecution(id)
  }, [deleteExecution])

  if (loading && executions.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <Spin size="small" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 8px', display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          size="small"
          type="text"
          icon={<RefreshCw size={12} />}
          onClick={handleRefresh}
          loading={loading}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
        {executions.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无执行记录"
            style={{ marginTop: 40 }}
          />
        ) : (
          executions.map((exec) => {
            const color = EXEC_STATUS_COLORS[exec.status] || '#9ca3af'
            const isExpanded = expandedId === exec.id
            return (
              <div
                key={exec.id}
                style={{
                  marginBottom: 6,
                  border: '1px solid #f0f0f0',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : exec.id)}
                  style={{
                    padding: '6px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    background: isExpanded ? '#fafafa' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ChevronRight
                      size={12}
                      style={{
                        flexShrink: 0,
                        transition: 'transform 0.15s',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      }}
                    />
                    <Tag color={color} style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>
                      {EXEC_STATUS_LABELS[exec.status] || exec.status}
                    </Tag>
                    <span style={{ flex: 1 }} />
                    <Popconfirm
                      title="确定删除此执行记录？"
                      onConfirm={(e) => { e?.stopPropagation(); handleDelete(exec.id) }}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<Trash2 size={11} />}
                        onClick={(e) => e.stopPropagation()}
                        style={{ padding: 0, width: 20, height: 20 }}
                      />
                    </Popconfirm>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#6b7280' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={10} />
                      {formatDuration(exec.totalDurationMs)}
                    </span>
                    <span style={{ color: '#22c55e' }}>✓{exec.passedSteps}</span>
                    {exec.failedSteps > 0 && <span style={{ color: '#ef4444' }}>✗{exec.failedSteps}</span>}
                    {exec.skippedSteps > 0 && <span style={{ color: '#9ca3af' }}>-{exec.skippedSteps}</span>}
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 10 }}>{formatRelativeTime(exec.startedAt)}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f0f0f0', padding: '4px 8px' }}>
                    <ExecutionDetail executionId={exec.id} taskId={taskId} />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
