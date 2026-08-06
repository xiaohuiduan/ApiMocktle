import { memo } from 'react'

import { Handle, Position } from '@xyflow/react'
import { theme } from 'antd'
import {
  CircleStop,
  GitBranch,
  Globe,
  type LucideIcon,
  Play,
  Repeat,
  ShieldCheck,
  Split,
  Timer,
  Variable,
  Workflow,
} from 'lucide-react'

import { useDesignStyle } from '@/hooks/useDesignStyle'

import { FlowNodeType, type HandleSpec, type NodeExecStatus } from '../types/flow.types'

import { NODE_TYPE_COLORS } from './nodeColors'

import { css, cx } from '@emotion/css'

// ==================== 节点类型颜色映射（单源：nodes/nodeColors.ts） ====================

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

// ==================== 状态颜色映射（跟随主题，接入 --ds-* 变量） ====================

const STATUS_COLORS: Record<NodeExecStatus, string> = {
  idle: '',
  running: 'var(--ds-highlight-selected)',
  passed: 'var(--ds-success-color)',
  failed: 'var(--ds-error-color)',
  skipped: 'var(--ds-node-text-muted)',
  error: 'var(--ds-error-color)',
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
  background: var(--ds-node-bg);
  border-radius: 8px;
  box-shadow: var(--ds-node-shadow, 0 1px 3px rgba(0, 0, 0, 0.12));
  border: 1px solid var(--ds-node-border-color);
  font-size: 13px;
  transition: box-shadow 0.2s ease;
`

const borderClass = css`
  width: 4px;
  flex-shrink: 0;
`

const contentClass = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--ds-node-pad-y) var(--ds-node-pad-x);
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
  color: var(--ds-node-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const descClass = css`
  font-size: 11px;
  color: var(--ds-node-text-secondary);
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
  color: var(--ds-node-text-muted);
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

// ==================== 设计风格签名效果 ====================

const dsGlassNode = css`
  background: var(--ds-node-bg);
  backdrop-filter: blur(var(--ds-blur, 20px)) saturate(var(--ds-saturate, 150%));
  -webkit-backdrop-filter: blur(var(--ds-blur, 20px)) saturate(var(--ds-saturate, 150%));
  border: 1px solid var(--ds-node-border-color);
  box-shadow: var(--ds-node-shadow);
`

const dsNeuNode = css`
  border: none;
  box-shadow: var(--ds-node-shadow);
`

const dsSkeuoNode = css`
  background-image: var(--ds-texture-fine, var(--ds-texture, none));
  border: 1px solid var(--ds-node-border-color);
  box-shadow: var(--ds-node-shadow);
`

// ==================== 辅助函数 ====================

function normalizeHandle(spec: HandleSpec): { id: string, label?: string, color?: string } {
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
  const { isGlassStyle, isNeumorphism, isSkeuomorphism } = useDesignStyle()

  const label = (data.label as string) ?? ''
  const execStatus = data.execStatus as NodeExecStatus | undefined
  const execError = data.execError as string | undefined
  const execDurationMs = data.execDurationMs as number | undefined
  const color = NODE_TYPE_COLORS[type as FlowNodeType] ?? token.colorPrimary
  const Icon = NODE_ICONS[type] ?? Globe

  // 设计风格签名效果类
  const styleClass = isGlassStyle
    ? dsGlassNode
    : isNeumorphism
      ? dsNeuNode
      : isSkeuomorphism
        ? dsSkeuoNode
        : ''

  return (
    <div className={cx(nodeClass, styleClass)} data-exec-status={execStatus ?? 'idle'} data-testid={`node-${type}`} style={minWidth ? { minWidth } : undefined}>
      {/* 左侧彩色边框 */}
      <div
        className={borderClass}
        data-testid="node-border"
        style={{ backgroundColor: color }}
      />

      {/* 内容区 */}
      <div className={contentClass}>
        <div className={headerClass}>
          <Icon className={iconClass} color={color} data-testid="node-icon" size={16} />
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
              color: execStatus === 'passed' ? 'var(--ds-success-color)' : execStatus === 'skipped' ? 'var(--ds-node-text-muted)' : 'var(--ds-error-color)',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={execError ?? execStatus}
          >
            {execStatus === 'passed' && execDurationMs !== undefined && `${execDurationMs}ms`}
            {execStatus === 'passed' && !execDurationMs && execError}
            {(execStatus === 'failed' || execStatus === 'error') && (execError ?? '执行失败')}
            {execStatus === 'skipped' && (execError ?? '已跳过（无详细原因）')}
            {execStatus === 'running' && '执行中...'}
          </span>
        )}
      </div>

      {/* 执行状态徽章 */}
      {execStatus && execStatus !== 'idle' && (
        <span
          className={badgeClass}
          data-testid="node-status-badge"
          style={{ backgroundColor: STATUS_COLORS[execStatus] }}
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
              data-testid={`handle-in-${h.id}`}
              id={h.id}
              position={Position.Top}
              type="target"
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
              data-testid={`handle-out-${h.id}`}
              id={h.id}
              position={Position.Bottom}
              style={h.color ? { background: h.color, border: `2px solid ${h.color}` } : undefined}
              type="source"
            />
            {h.label && (
              <span
                className={`${handleLabelClass} ${handleLabelRightClass}`}
                data-testid={`handle-label-out-${h.id}`}
                style={h.color ? { color: h.color, fontWeight: 600 } : undefined}
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
