import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button, Collapse, Empty, message, Modal, Popconfirm, Spin, Tag, Typography } from 'antd'
import { AlertTriangle, CheckCircle, ChevronRight, Clock, CopyIcon, RefreshCw, Trash2, XCircle } from 'lucide-react'

import { useTestExecutions } from '@/hooks/useTestTask'
import type { TestStepResult } from '@/types'

import { useFlowStore } from '../store/useFlowStore'

import { css } from '@emotion/css'

const { Text } = Typography

// ==================== 样式 ====================

const codeBlockClass = css`
  background: var(--ds-code-bg);
  color: var(--ds-code-color);
  border-radius: 4px;
  padding: var(--ds-pad-sm) 10px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  max-height: 250px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: var(--ds-pad-xs) 0;
`

const resultBlockClass = css`
  background: var(--ds-node-bg-elevated);
  border: 1px solid var(--ds-node-border-color);
  border-radius: 6px;
  padding: var(--ds-pad-md);
  font-size: 12px;
`

const STEP_STATUS_CONFIG: Record<string, { color: string, icon: React.ReactNode, label: string }> = {
  passed: { color: 'success', icon: <CheckCircle size={14} />, label: '通过' },
  failed: { color: 'error', icon: <XCircle size={14} />, label: '失败' },
  error: { color: 'error', icon: <AlertTriangle size={14} />, label: '错误' },
  skipped: { color: 'default', icon: null, label: '跳过' },
}

const EXEC_STATUS_COLORS: Record<string, string> = {
  passed: 'var(--ds-success-color)',
  failed: 'var(--ds-error-color)',
  aborted: 'var(--ds-warning-color)',
  error: 'var(--ds-error-color)',
  running: 'var(--ds-highlight-selected)',
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
  if (ms < 1000) { return `${ms}ms` }

  if (ms < 60000) { return `${(ms / 1000).toFixed(1)}s` }

  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)

  return `${m}m${s}s`
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) { return '刚刚' }

  if (diff < 3600000) { return `${Math.floor(diff / 60000)}分钟前` }

  if (diff < 86400000) { return `${Math.floor(diff / 3600000)}小时前` }

  return date.toLocaleString()
}

function formatRequestText(req: Record<string, unknown>): string {
  const lines: string[] = []
  lines.push(`${String(req.method ?? 'GET')} ${String(req.url ?? '')}`)
  const headers = req.headers as { name: string, value: string }[] | undefined

  if (headers && headers.length > 0) {
    lines.push('\n-- Headers --')

    for (const h of headers) { lines.push(`${h.name}: ${h.value}`) }
  }

  if (req.body) {
    lines.push('\n-- Body --')

    try { lines.push(JSON.stringify(JSON.parse(String(req.body)), null, 2)) }
    catch { lines.push(String(req.body)) }
  }

  return lines.join('\n') || '(无详情)'
}

function formatResponseText(resp: Record<string, unknown>): string {
  const lines: string[] = []
  const status = Number(resp.status ?? 0)
  lines.push(`HTTP ${status} ${status >= 200 && status < 400 ? 'OK' : 'Error'}`)

  if (resp.duration_ms) { lines.push(`耗时: ${resp.duration_ms}ms`) }

  const headers = resp.headers as Record<string, string> | undefined

  if (headers && Object.keys(headers).length > 0) {
    lines.push('\n-- Headers --')

    for (const [k, v] of Object.entries(headers)) { lines.push(`${k}: ${v}`) }
  }

  if (resp.body) {
    lines.push('\n-- Body --')

    try { lines.push(JSON.stringify(JSON.parse(String(resp.body)), null, 2)) }
    catch { lines.push(String(resp.body)) }
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
  if (!step) { return null }

  const config = STEP_STATUS_CONFIG[step.status] || STEP_STATUS_CONFIG.skipped
  const req = step.requestJson
  const resp = step.responseJson
  const hasRequest = req && Object.keys(req).length > 0
  const hasResponse = resp && Object.keys(resp).length > 0

  const handleCopyRequest = () => {
    if (req) {
      void navigator.clipboard.writeText(formatRequestText(req)).then(() => {
        message.success('已复制')
      })
    }
  }

  const handleCopyResponse = () => {
    if (resp) {
      void navigator.clipboard.writeText(formatResponseText(resp)).then(() => {
        message.success('已复制')
      })
    }
  }

  return (
    <Modal
      footer={null}
      open={!!step}
      styles={{ body: { padding: 'var(--ds-pad-md) 0' } }}
      title={(
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{nodeLabel || step.stepId}</span>
          <Tag color={config.color} icon={config.icon} style={{ margin: 0 }}>
            {config.label}
          </Tag>
          {step.durationMs > 0 && (
            <span style={{ color: 'var(--ds-node-text-muted)', fontSize: 12, fontWeight: 'normal' }}>{step.durationMs}ms</span>
          )}
        </span>
      )}
      width={560}
      onCancel={onClose}
    >
      {/* 错误信息 */}
      {step.errorMessage && (
        <div
          className={resultBlockClass}
          style={{ marginBottom: 'var(--ds-pad-md)', borderColor: 'var(--ds-error-color)', background: 'rgba(239, 68, 68, 0.08)' }}
        >
          <Text style={{ fontSize: 12 }} type="danger">{step.errorMessage}</Text>
        </div>
      )}

      {/* 请求/响应详情 */}
      {(hasRequest || hasResponse)
        ? (
            <Collapse
              defaultActiveKey={hasRequest ? ['request'] : undefined}
              items={[
                ...(hasRequest
                  ? [
                      {
                        key: 'request',
                        label: <span style={{ fontSize: 12 }}>请求详情</span>,
                        extra: (
                          <Button
                            icon={<CopyIcon size={12} />}
                            size="small"
                            type="text"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCopyRequest()
                            }}
                          />
                        ),
                        children: <div className={codeBlockClass}>{formatRequestText(req)}</div>,
                      },
                    ]
                  : []),
                ...(hasResponse
                  ? [
                      {
                        key: 'response',
                        label: <span style={{ fontSize: 12 }}>响应详情</span>,
                        extra: (
                          <Button
                            icon={<CopyIcon size={12} />}
                            size="small"
                            type="text"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCopyResponse()
                            }}
                          />
                        ),
                        children: <div className={codeBlockClass}>{formatResponseText(resp)}</div>,
                      },
                    ]
                  : []),
              ]}
              size="small"
            />
          )
        : (
            !step.errorMessage && <Text style={{ fontSize: 12 }} type="secondary">此步骤无详细数据</Text>
          )}
    </Modal>
  )
}

// ==================== 执行记录详情（步骤列表） ====================

function ExecutionDetail({ executionId, taskId }: { executionId: string, taskId: string }) {
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
      map[n.id] = (n.data?.label) || n.id
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
          const result = (d.stepResults ?? raw.step_results ?? [])
          setSteps(result)
        }
      }
      catch (err) {
        if (!cancelled) { setError(`加载失败: ${err}`) }
      }

      if (!cancelled) { setLoading(false) }
    }

    load()

    return () => { cancelled = true }
  }, [executionId, getExecutionDetail])

  if (loading) { return <Spin size="small" style={{ display: 'block', margin: '8px auto' }} /> }

  if (error) { return <div style={{ padding: 'var(--ds-pad-sm)', color: 'var(--ds-error-color)', fontSize: 11, textAlign: 'center' }}>{error}</div> }

  if (!steps.length) {
    return <div style={{ padding: 'var(--ds-pad-sm)', color: 'var(--ds-node-text-muted)', fontSize: 11, textAlign: 'center' }}>无步骤详情</div>
  }

  const sorted = [...steps].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <>
      <div style={{ padding: '2px 0' }}>
        {sorted.map((step) => {
          const color = EXEC_STATUS_COLORS[step.status] || '#9ca3af'
          const hasDetail = step.requestJson ?? step.responseJson ?? step.errorMessage

          return (
            <div
              key={step.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: 'var(--ds-pad-xs) var(--ds-pad-sm)',
                fontSize: 11,
                cursor: 'pointer',
                borderRadius: 4,
                transition: 'background 0.15s',
              }}
              onClick={() => { setSelectedStep(step) }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--ds-bg-elevated)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getLabel(step.stepId)}
              </span>
              {step.errorMessage && (
                <span style={{ color: 'var(--ds-error-color)', fontSize: 10, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={step.errorMessage}>
                  ✗
                </span>
              )}
              {hasDetail && (
                <ChevronRight color="var(--ds-node-text-muted)" size={10} style={{ flexShrink: 0 }} />
              )}
              <span style={{ color: 'var(--ds-node-text-muted)', flexShrink: 0 }}>{formatDuration(step.durationMs)}</span>
            </div>
          )
        })}
      </div>

      <StepDetailModal nodeLabel={selectedStep ? getLabel(selectedStep.stepId) : ''} step={selectedStep} onClose={() => { setSelectedStep(null) }} />
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
      <div style={{ padding: 'var(--ds-list-gap) var(--ds-pad-sm)', display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          icon={<RefreshCw size={12} />}
          loading={loading}
          size="small"
          type="text"
          onClick={handleRefresh}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--ds-pad-xs)' }}>
        {executions.length === 0
          ? (
              <Empty
                description="暂无执行记录"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ marginTop: 40 }}
              />
            )
          : (
              executions.map((exec) => {
                const color = EXEC_STATUS_COLORS[exec.status] || '#9ca3af'
                const isExpanded = expandedId === exec.id

                return (
                  <div
                    key={exec.id}
                    style={{
                      marginBottom: 'var(--ds-list-gap)',
                      border: '1px solid var(--ds-divider-color)',
                      borderRadius: 6,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: 'var(--ds-list-gap) var(--ds-pad-sm)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        background: isExpanded ? 'var(--ds-bg-elevated)' : 'var(--ds-node-bg)',
                      }}
                      onClick={() => { setExpandedId(isExpanded ? null : exec.id) }}
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
                          onCancel={(e) => e?.stopPropagation()}
                          onConfirm={(e) => { e?.stopPropagation(); handleDelete(exec.id) }}
                        >
                          <Button
                            danger
                            icon={<Trash2 size={11} />}
                            size="small"
                            style={{ padding: 0, width: 20, height: 20 }}
                            type="text"
                            onClick={(e) => { e.stopPropagation() }}
                          />
                        </Popconfirm>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--ds-node-text-secondary)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={10} />
                          {formatDuration(exec.totalDurationMs)}
                        </span>
                        <span style={{ color: 'var(--ds-success-color)' }}>✓{exec.passedSteps}</span>
                        {exec.failedSteps > 0 && <span style={{ color: 'var(--ds-error-color)' }}>✗{exec.failedSteps}</span>}
                        {exec.skippedSteps > 0 && <span style={{ color: 'var(--ds-node-text-muted)' }}>-{exec.skippedSteps}</span>}
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: 10 }}>{formatRelativeTime(exec.startedAt)}</span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ borderTop: '1px solid var(--ds-divider-color)', padding: 'var(--ds-pad-xs) var(--ds-pad-sm)' }}>
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
