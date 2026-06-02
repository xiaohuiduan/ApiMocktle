import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { theme } from 'antd'
import { css } from '@emotion/css'
import {
  Play,
  CircleStop,
  Globe,
  GitBranch,
  Repeat,
  Split,
  Timer,
  Workflow,
  Variable,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { FlowNodeType, type NodeExecStatus, type HandleSpec } from '../types/flow.types'

// ==================== 颜色映射 ====================

const NODE_COLORS: Record<string, string> = {
  [FlowNodeType.Start]: '#6b7280',       // gray-500
  [FlowNodeType.End]: '#6b7280',         // gray-500
  [FlowNodeType.HttpRequest]: '#3b82f6', // blue-500
  [FlowNodeType.Condition]: '#f97316',   // orange-500
  [FlowNodeType.Loop]: '#a855f7',        // purple-500
  [FlowNodeType.Parallel]: '#14b8a6',    // teal-500
  [FlowNodeType.Wait]: '#eab308',        // yellow-500
  [FlowNodeType.SubFlow]: '#6366f1',     // indigo-500
  [FlowNodeType.SetVariable]: '#22c55e', // green-500
  [FlowNodeType.Assert]: '#ef4444',      // red-500
}

// ==================== 图标映射 ====================

const NODE_ICONS: Record<string, LucideIcon> = {
  [FlowNodeType.Start]: Play,
  [FlowNodeType.End]: CircleStop,
  [FlowNodeType.HttpRequest]: Globe,
  [FlowNodeType.Condition]: GitBranch,
  [FlowNodeType.Loop]: Repeat,
  [FlowNodeType.Parallel]: Split,
  [FlowNodeType.Wait]: Timer,
  [FlowNodeType.SubFlow]: Workflow,
  [FlowNodeType.SetVariable]: Variable,
  [FlowNodeType.Assert]: ShieldCheck,
}

// ==================== 状态颜色映射 ====================

const STATUS_COLORS: Record<NodeExecStatus, string> = {
  idle: '',
  running: '#3b82f6',
  passed: '#22c55e',
  failed: '#ef4444',
  skipped: '#9ca3af',
  error: '#ef4444',
}

const STATUS_LABELS: Record<NodeExecStatus, string> = {
  idle: '',
  running: '...',
  passed: '✓',
  failed: '✗',
  skipped: '-',
  error: '!',
}

// ==================== 样式 ====================

const nodeClass = css`
  position: relative;
  display: flex;
  align-items: stretch;
  min-width: 180px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  font-size: 13px;
`

const borderClass = css`
  width: 4px;
  flex-shrink: 0;
`

const contentClass = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  flex: 1;
  min-width: 0;
`

const headerClass = css`
  display: flex;
  align-items: center;
  gap: 6px;
`

const iconClass = css`
  flex-shrink: 0;
`

const labelClass = css`
  font-weight: 600;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const descClass = css`
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const badgeClass = css`
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 10px;
  min-width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  color: #fff;
`

// ==================== Handle 标签样式 ====================

const handleLabelClass = css`
  position: absolute;
  font-size: 9px;
  color: #9ca3af;
  white-space: nowrap;
  pointer-events: none;
  line-height: 1;
  user-select: none;
`

const handleLabelLeftClass = css`
  bottom: 18px;
  text-align: center;
  left: 50%;
  transform: translateX(-50%);
`

const handleLabelRightClass = css`
  top: 18px;
  text-align: center;
  left: 50%;
  transform: translateX(-50%);
`

// ==================== 辅助函数 ====================

function normalizeHandle(spec: HandleSpec): { id: string; label?: string; color?: string } {
  return typeof spec === 'string' ? { id: spec } : spec
}

// ==================== Props ====================

export interface BaseNodeProps {
  id: string
  data: Record<string, unknown>
  type: string
  inputHandles?: HandleSpec[]
  outputHandles?: HandleSpec[]
  summary?: string
  minWidth?: number
}

// ==================== 组件 ====================

function BaseNodeInner({
  data,
  type,
  inputHandles = [],
  outputHandles = [],
  summary,
  minWidth,
}: BaseNodeProps) {
  const { token } = theme.useToken()

  const label = (data.label as string) ?? ''
  const execStatus = data.execStatus as NodeExecStatus | undefined
  const execError = data.execError as string | undefined
  const execDurationMs = data.execDurationMs as number | undefined
  const color = NODE_COLORS[type] ?? token.colorPrimary
  const Icon = NODE_ICONS[type] ?? Globe

  return (
    <div className={nodeClass} style={minWidth ? { minWidth } : undefined} data-testid={`node-${type}`}>
      {/* 左侧彩色边框 */}
      <div
        className={borderClass}
        style={{ backgroundColor: color }}
        data-testid="node-border"
      />

      {/* 内容区 */}
      <div className={contentClass}>
        <div className={headerClass}>
          <Icon size={16} color={color} className={iconClass} data-testid="node-icon" />
          <span className={labelClass} data-testid="node-label">
            {label}
          </span>
        </div>
        {summary && (
          <span className={descClass} data-testid="node-summary">
            {summary}
          </span>
        )}
        {/* 执行结果摘要 */}
        {execStatus && execStatus !== 'idle' && (
          <span
            style={{
              fontSize: 10,
              color: execStatus === 'passed' ? '#16a34a' : execStatus === 'skipped' ? '#9ca3af' : '#dc2626',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={execError || execStatus}
          >
            {execStatus === 'passed' && execDurationMs !== undefined && `${execDurationMs}ms`}
            {execStatus === 'passed' && !execDurationMs && execError}
            {(execStatus === 'failed' || execStatus === 'error') && (execError || '执行失败')}
            {execStatus === 'skipped' && (execError || '已跳过（无详细原因）')}
            {execStatus === 'running' && '执行中...'}
          </span>
        )}
      </div>

      {/* 执行状态徽章 */}
      {execStatus && execStatus !== 'idle' && (
        <span
          className={badgeClass}
          style={{ backgroundColor: STATUS_COLORS[execStatus] }}
          data-testid="node-status-badge"
        >
          {STATUS_LABELS[execStatus]}
        </span>
      )}

      {/* 输入 Handles */}
      {inputHandles.map((spec, index) => {
        const h = normalizeHandle(spec)
        const leftPercent = ((index + 1) / (inputHandles.length + 1)) * 100
        return (
          <div key={h.id} style={{ position: 'absolute', top: 0, left: `${leftPercent}%`, transform: 'translateX(-50%)' }}>
            <Handle
              type="target"
              position={Position.Top}
              id={h.id}
              data-testid={`handle-in-${h.id}`}
            />
            {h.label && (
              <span
                className={`${handleLabelClass} ${handleLabelLeftClass}`}
                data-testid={`handle-label-in-${h.id}`}
              >
                {h.label}
              </span>
            )}
          </div>
        )
      })}

      {/* 输出 Handles */}
      {outputHandles.map((spec, index) => {
        const h = normalizeHandle(spec)
        const leftPercent = ((index + 1) / (outputHandles.length + 1)) * 100
        return (
          <div key={h.id} style={{ position: 'absolute', bottom: 0, left: `${leftPercent}%`, transform: 'translateX(-50%)' }}>
            <Handle
              type="source"
              position={Position.Bottom}
              id={h.id}
              style={h.color ? { background: h.color, border: `2px solid ${h.color}` } : undefined}
              data-testid={`handle-out-${h.id}`}
            />
            {h.label && (
              <span
                className={`${handleLabelClass} ${handleLabelRightClass}`}
                style={h.color ? { color: h.color, fontWeight: 600 } : undefined}
                data-testid={`handle-label-out-${h.id}`}
              >
                {h.label}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

const BaseNode = memo(BaseNodeInner)

export default BaseNode
