import { useCallback, useEffect, useState } from 'react'

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
} from 'lucide-react'

import { NODE_TYPE_COLORS } from '../nodes/nodeColors'
import { FlowNodeType, NODE_TYPE_LABELS } from '../types/flow.types'

import { css } from '@emotion/css'

// ==================== 节点定义 ====================

interface PaletteNodeItem {
  type: FlowNodeType
  label: string
  description: string
  icon: LucideIcon
  color: string
}

const PALETTE_NODES: PaletteNodeItem[] = [
  { type: FlowNodeType.Start, label: NODE_TYPE_LABELS[FlowNodeType.Start], description: '流程起点', icon: Play, color: NODE_TYPE_COLORS[FlowNodeType.Start] },
  { type: FlowNodeType.End, label: NODE_TYPE_LABELS[FlowNodeType.End], description: '流程终点', icon: CircleStop, color: NODE_TYPE_COLORS[FlowNodeType.End] },
  { type: FlowNodeType.HttpRequest, label: NODE_TYPE_LABELS[FlowNodeType.HttpRequest], description: '发送 API 请求', icon: Globe, color: NODE_TYPE_COLORS[FlowNodeType.HttpRequest] },
  { type: FlowNodeType.Condition, label: NODE_TYPE_LABELS[FlowNodeType.Condition], description: 'if/else 分支', icon: GitBranch, color: NODE_TYPE_COLORS[FlowNodeType.Condition] },
  { type: FlowNodeType.Loop, label: NODE_TYPE_LABELS[FlowNodeType.Loop], description: '重复执行', icon: Repeat, color: NODE_TYPE_COLORS[FlowNodeType.Loop] },
  { type: FlowNodeType.Parallel, label: NODE_TYPE_LABELS[FlowNodeType.Parallel], description: '同时执行', icon: Split, color: NODE_TYPE_COLORS[FlowNodeType.Parallel] },
  { type: FlowNodeType.Wait, label: NODE_TYPE_LABELS[FlowNodeType.Wait], description: '延迟执行', icon: Timer, color: NODE_TYPE_COLORS[FlowNodeType.Wait] },
  { type: FlowNodeType.SetVariable, label: NODE_TYPE_LABELS[FlowNodeType.SetVariable], description: '设置变量', icon: Variable, color: NODE_TYPE_COLORS[FlowNodeType.SetVariable] },
  { type: FlowNodeType.Assert, label: NODE_TYPE_LABELS[FlowNodeType.Assert], description: '验证变量', icon: ShieldCheck, color: NODE_TYPE_COLORS[FlowNodeType.Assert] },
]

// ==================== 样式 ====================

const panelClass = css`
  width: 100%;
  height: 100%;
  overflow-y: auto;
  background: transparent;
  padding: var(--ds-pad-sm);
`

const titleClass = css`
  font-size: 13px;
  font-weight: 600;
  color: var(--ds-node-text-primary);
  padding: var(--ds-pad-xs) var(--ds-pad-sm) var(--ds-pad-sm);
`

const cardClass = css`
  display: flex;
  align-items: stretch;
  border-radius: 6px;
  background: var(--ds-node-bg);
  box-shadow: var(--ds-node-shadow, 0 1px 2px rgba(0, 0, 0, 0.06));
  border: 1px solid var(--ds-node-border-color, transparent);
  margin-bottom: var(--ds-list-gap);
  cursor: grab;
  overflow: hidden;
  transition: box-shadow 0.15s;
  user-select: none;

  &:hover {
    box-shadow: var(--ds-node-shadow-hover, 0 2px 6px rgba(0, 0, 0, 0.12));
  }

  &:active {
    cursor: grabbing;
  }
`

const colorBarClass = css`
  width: 4px;
  flex-shrink: 0;
`

const cardContentClass = css`
  display: flex;
  align-items: center;
  gap: var(--ds-gap-sm);
  padding: var(--ds-pad-sm) 10px;
  flex: 1;
  min-width: 0;
`

const cardTextClass = css`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`

const cardLabelClass = css`
  font-size: 12px;
  font-weight: 600;
  color: var(--ds-node-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const cardDescClass = css`
  font-size: 11px;
  color: var(--ds-node-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

// ==================== 组件 ====================

export default function NodePalette() {
  const [draggingType, setDraggingType] = useState<FlowNodeType | null>(null)
  const [, setGhostPos] = useState({ x: 0, y: 0 })

  // 鼠标事件模拟拖拽（绕过 Tauri WebView2 对 HTML5 拖拽 API 的兼容问题）
  const handleMouseDown = useCallback((e: React.MouseEvent, nodeType: FlowNodeType) => {
    setDraggingType(nodeType)
    setGhostPos({ x: e.clientX, y: e.clientY })
    ;(window as any).__DRAG_NODE_TYPE__ = nodeType
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if ((window as any).__DRAG_NODE_TYPE__) {
        setGhostPos({ x: e.clientX, y: e.clientY })
      }
    }

    const handleMouseUp = () => {
      setDraggingType(null)
      // 注意：不清除 __DRAG_NODE_TYPE__，由 FlowCanvas 读取后负责清理
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <>
      <div className={panelClass} data-testid="node-palette">
        <div className={titleClass}>节点面板（点住拖到画布）</div>
        {PALETTE_NODES.map((item) => {
          const Icon = item.icon
          const isDragging = draggingType === item.type

          return (
            <div
              key={item.type}
              className={cardClass}
              data-node-type={item.type}
              data-testid={`palette-node-${item.type}`}
              style={{
                opacity: isDragging ? 0.5 : 1,
                border: isDragging ? '2px solid var(--ds-primary-color)' : undefined,
              }}
              onMouseDown={(e) => { handleMouseDown(e, item.type) }}
            >
              <div
                className={colorBarClass}
                style={{ backgroundColor: item.color }}
              />
              <div className={cardContentClass}>
                <Icon color={item.color} size={16} />
                <div className={cardTextClass}>
                  <span className={cardLabelClass}>{item.label}</span>
                  <span className={cardDescClass}>{item.description}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 拖动时的幽灵节点，跟随鼠标 */}
      {draggingType && (
        <div
          style={{
            position: 'fixed',
            pointerEvents: 'none',
            zIndex: 9999,
            padding: 'var(--ds-pad-sm) var(--ds-pad-md)',
            background: 'var(--ds-node-bg)',
            border: '2px solid var(--ds-primary-color)',
            borderRadius: 6,
            boxShadow: 'var(--ds-node-shadow-hover, 0 4px 12px rgba(0,0,0,0.15))',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ds-node-text-primary)',
            top: 0,
            left: 0,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {PALETTE_NODES.find((n) => n.type === draggingType)?.label}
        </div>
      )}
    </>
  )
}
