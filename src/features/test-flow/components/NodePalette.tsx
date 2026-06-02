import { useState, useCallback, useEffect } from 'react'
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
  Variable,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { FlowNodeType } from '../types/flow.types'
import { useFlowStore } from '../store/useFlowStore'
import { getDefaultNodeData } from '../nodes/nodeRegistry'
import type { FlowNode } from '../types/flow.types'

// ==================== 节点定义 ====================

interface PaletteNodeItem {
  type: FlowNodeType
  label: string
  description: string
  icon: LucideIcon
  color: string
}

const PALETTE_NODES: PaletteNodeItem[] = [
  { type: FlowNodeType.Start, label: '开始', description: '流程起点', icon: Play, color: '#6b7280' },
  { type: FlowNodeType.End, label: '结束', description: '流程终点', icon: CircleStop, color: '#6b7280' },
  { type: FlowNodeType.HttpRequest, label: 'HTTP 请求', description: '发送 API 请求', icon: Globe, color: '#3b82f6' },
  { type: FlowNodeType.Condition, label: '条件判断', description: 'if/else 分支', icon: GitBranch, color: '#f97316' },
  { type: FlowNodeType.Loop, label: '循环', description: '重复执行', icon: Repeat, color: '#a855f7' },
  { type: FlowNodeType.Parallel, label: '并行', description: '同时执行', icon: Split, color: '#14b8a6' },
  { type: FlowNodeType.Wait, label: '等待', description: '延迟执行', icon: Timer, color: '#eab308' },
  { type: FlowNodeType.SetVariable, label: '变量赋值', description: '设置变量', icon: Variable, color: '#22c55e' },
  { type: FlowNodeType.Assert, label: '断言', description: '验证变量', icon: ShieldCheck, color: '#ef4444' },
]

// ==================== 样式 ====================

const panelClass = css`
  width: 100%;
  height: 100%;
  overflow-y: auto;
  background: transparent;
  padding: 8px;
`

const titleClass = css`
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  padding: 4px 8px 8px;
`

const cardClass = css`
  display: flex;
  align-items: stretch;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  margin-bottom: 6px;
  cursor: grab;
  overflow: hidden;
  transition: box-shadow 0.15s;
  user-select: none;

  &:hover {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
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
  gap: 8px;
  padding: 8px 10px;
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
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const cardDescClass = css`
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

// ==================== 组件 ====================

export default function NodePalette() {
  const { token } = theme.useToken()
  const [draggingType, setDraggingType] = useState<FlowNodeType | null>(null)
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 })

  // 鼠标事件模拟拖拽（绕过 Tauri WebView2 对 HTML5 拖拽 API 的兼容问题）
  const handleMouseDown = useCallback((e: React.MouseEvent, nodeType: FlowNodeType) => {
    console.log('[MouseDown] nodeType:', nodeType)
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
      if ((window as any).__DRAG_NODE_TYPE__) {
        console.log('[MouseUp] 拖动结束，nodeType:', (window as any).__DRAG_NODE_TYPE__)
      }
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
              style={{
                opacity: isDragging ? 0.5 : 1,
                border: isDragging ? '2px solid #1677ff' : undefined,
              }}
              onMouseDown={(e) => handleMouseDown(e, item.type)}
              data-node-type={item.type}
              data-testid={`palette-node-${item.type}`}
            >
              <div
                className={colorBarClass}
                style={{ backgroundColor: item.color }}
              />
              <div className={cardContentClass}>
                <Icon size={16} color={item.color} />
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
            padding: '8px 12px',
            background: '#fff',
            border: '2px solid #1677ff',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontSize: 12,
            fontWeight: 600,
            color: '#1f2937',
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
