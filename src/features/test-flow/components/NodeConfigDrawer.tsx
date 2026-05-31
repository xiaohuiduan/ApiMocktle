import { useCallback, useContext, useState } from 'react'
import { Drawer, Divider, Tag, Typography, Collapse, Button } from 'antd'
import { CheckCircle, XCircle, Clock, AlertTriangle, CopyOutlined } from 'lucide-react'
import { css } from '@emotion/css'
import { useFlowStore } from '../store/useFlowStore'
import { FlowEditorContext } from '../contexts/FlowEditorContext'
import type { FlowNodeData, NodeExecStatus } from '../types/flow.types'
import TypeHeader from './node-config-panels/TypeHeader'
import BaseFields from './node-config-panels/BaseFields'
import { getPanelComponent } from './node-config-panels/shared/panelRegistry'

const { Text, Paragraph } = Typography

// ==================== 样式 ====================

const resultBlockClass = css`
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
`

const codeBlockClass = css`
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 4px;
  padding: 8px 10px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  max-height: 200px;
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

// ==================== 组件 ====================

export default function NodeConfigDrawer() {
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId)
  const nodes = useFlowStore((s) => s.nodes)
  const drawerOpen = useFlowStore((s) => s.drawerOpen)
  const setDrawerOpen = useFlowStore((s) => s.setDrawerOpen)
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  const flowContext = useContext(FlowEditorContext)
  const projectId = flowContext?.projectId || ''

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

  return (
    <Drawer
      title="节点配置"
      placement="right"
      width={480}
      open={drawerOpen && !!selectedNode}
      onClose={handleClose}
      data-testid="node-config-drawer"
    >
      {selectedNode && (
        <div className="space-y-4">
          {/* 节点类型头部信息 */}
          <TypeHeader
            nodeType={selectedNode.type}
            nodeId={selectedNode.id}
          />

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
  )
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
    const headers = req.headers as Record<string, string>
    for (const [k, v] of Object.entries(headers)) {
      parts.push(`  ${k}: ${v}`)
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
    // 尝试格式化 JSON
    try {
      const parsed = JSON.parse(body)
      parts.push(JSON.stringify(parsed, null, 2))
    } catch {
      parts.push(body)
    }
  }
  return parts.join('\n') || '(无详情)'
}
