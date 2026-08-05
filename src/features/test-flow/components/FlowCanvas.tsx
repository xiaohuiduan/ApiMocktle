import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import {
  Background,
  type Connection,
  Controls,
  type Edge,
  type IsValidConnection,
  MarkerType,
  MiniMap,
  type Node,
  ReactFlow,
  type ReactFlowInstance,
  ReactFlowProvider,
  reconnectEdge,
  useReactFlow,
} from '@xyflow/react'

import { Button, Space } from 'antd'
import { Wand2 } from 'lucide-react'

import { useDesignStyle } from '@/hooks/useDesignStyle'

import { FlowInstanceContext, globalFlowInstanceRef } from '../contexts/FlowInstanceContext'
import { usePathHighlightContext } from '../contexts/PathHighlightContext'
import { NODE_TYPE_COLORS } from '../nodes/nodeColors'
import { getDefaultNodeData, getNodeTypes } from '../nodes/nodeRegistry'
import { useFlowStore } from '../store/useFlowStore'
import { type FlowEdge, type FlowGraph, type FlowNode, FlowNodeType } from '../types/flow.types'
import { createInitialGraph, createRequestAssertTemplate } from '../utils/flow-templates'

import '@xyflow/react/dist/style.css'

/** 读取 html 元素上的 CSS 变量值 */
function getCssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

// ==================== 内层画布组件 ====================
// 使用 useReactFlow() 的组件必须在 ReactFlowProvider 内部

function FlowCanvasInner() {
  const reactFlow = useReactFlow()
  const { screenToFlowPosition } = reactFlow
  const { flowInstanceRef } = useContext(FlowInstanceContext)
  // 设计风格（依赖它刷新 CSS 变量读取结果，主题切换后边色/标签色即时更新）
  const { designStyle } = useDesignStyle()

  // 暴露 ReactFlow 实例给外部
  useEffect(() => {
    flowInstanceRef.current = reactFlow
    globalFlowInstanceRef.current = reactFlow

    return () => {
      flowInstanceRef.current = null
      globalFlowInstanceRef.current = null
    }
  }, [reactFlow, flowInstanceRef])
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const onNodesChange = useFlowStore((s) => s.onNodesChange)
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange)
  const onConnect = useFlowStore((s) => s.onConnect)
  const addNode = useFlowStore((s) => s.addNode)
  const selectNode = useFlowStore((s) => s.selectNode)
  const deleteEdge = useFlowStore((s) => s.deleteEdge)
  const deleteNodes = useFlowStore((s) => s.deleteNodes)
  const selectedEdgeId = useFlowStore((s) => s.selectedEdgeId)
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId)

  // 路径高亮（从 Context 获取）
  const pathHighlight = usePathHighlightContext()
  const upstreamNodeIds = pathHighlight?.upstreamNodeIds ?? new Set<string>()
  const downstreamNodeIds = pathHighlight?.downstreamNodeIds ?? new Set<string>()
  const upstreamEdgeIds = pathHighlight?.upstreamEdgeIds ?? new Set<string>()
  const downstreamEdgeIds = pathHighlight?.downstreamEdgeIds ?? new Set<string>()
  const activeNodeId = pathHighlight?.activeNodeId ?? null
  const isLocked = pathHighlight?.isLocked ?? false
  const onNodeHover = pathHighlight?.onNodeHover ?? (() => { /* noop */ })
  const onNodePathClick = pathHighlight?.onNodeClick ?? (() => { /* noop */ })
  const onPanePathClick = pathHighlight?.onPaneClick ?? (() => { /* noop */ })

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    type: 'node' | 'edge'
    id: string
  } | null>(null)

  // 节点类型映射，使用 useMemo 避免重渲染
  const nodeTypes = useMemo(() => getNodeTypes(), [])

  // 边默认配置：平滑折线（自动绕过节点）+ 方向箭头
  const defaultEdgeOptions = useMemo(() => {
    const edgeColor = getCssVar('--ds-edge-color', '#94a3b8')

    return {
      type: 'smoothstep' as const,
      style: { strokeWidth: 2, stroke: edgeColor },
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 20, height: 20 },
    }
  }, [designStyle])

  // 节点的 handle 标签映射（用于连线标注）
  const nodeHandleLabels: Record<string, Record<string, { label: string, color: string }>> = useMemo(() => {
    const map: Record<string, Record<string, { label: string, color: string }>> = {}
    const primaryColor = getCssVar('--ds-primary-color', '#3b82f6')
    const mutedColor = getCssVar('--ds-node-text-muted', '#9ca3af')
    const successColor = getCssVar('--ds-success-color', '#22c55e')
    const errorColor = getCssVar('--ds-error-color', '#ef4444')
    const loopColor = NODE_TYPE_COLORS[FlowNodeType.Loop]

    for (const node of nodes) {
      const d = node.data as Record<string, unknown>

      if (node.type === 'condition') {
        const conditions = d.conditions as { id: string, label: string }[] | undefined

        if (conditions && conditions.length > 0) {
          const handles: Record<string, { label: string, color: string }> = {}

          for (const c of conditions) { handles[c.id] = { label: c.label, color: primaryColor } }

          handles.default = { label: (d.defaultLabel as string) || '默认', color: mutedColor }
          map[node.id] = handles
        }
        else {
          map[node.id] = {
            true: { label: '符合', color: successColor },
            false: { label: '不符合', color: errorColor },
          }
        }
      }
      else if (node.type === 'loop') {
        map[node.id] = {
          out: { label: '出口', color: mutedColor },
          loop: { label: '循环体', color: loopColor },
        }
      }
    }

    return map
  }, [nodes, designStyle])

  // 为边注入选中状态样式 + 连线标签 + 路径高亮
  const edgesWithSelection = useMemo(() => {
    const defaultEdge = getCssVar('--ds-edge-color', '#94a3b8')
    const selectedColor = getCssVar('--ds-highlight-selected', '#3b82f6')
    const upstreamColor = getCssVar('--ds-highlight-upstream', '#f59e0b')
    const downstreamColor = getCssVar('--ds-highlight-downstream', '#10b981')

    return edges.map((e) => {
      const isSelected = e.id === selectedEdgeId
      const isUpstream = activeNodeId && upstreamEdgeIds.has(e.id)
      const isDownstream = activeNodeId && downstreamEdgeIds.has(e.id)

      let edgeColor: string
      let edgeWidth = 2
      let edgeAnimated = false
      let edgeOpacity: string | undefined

      if (isUpstream) {
        edgeColor = isSelected ? selectedColor : upstreamColor
        edgeWidth = isSelected ? 3 : 2.5
        edgeAnimated = isLocked
      }
      else if (isDownstream) {
        edgeColor = isSelected ? selectedColor : downstreamColor
        edgeWidth = isSelected ? 3 : 2.5
        edgeAnimated = isLocked
      }
      else if (activeNodeId) {
        const handleInfo = nodeHandleLabels[e.source]?.[e.sourceHandle ?? '']
        edgeColor = handleInfo?.color || defaultEdge
        edgeOpacity = '0.15'
      }
      else {
        const handleInfo = nodeHandleLabels[e.source]?.[e.sourceHandle ?? '']
        edgeColor = isSelected ? selectedColor : handleInfo?.color || defaultEdge
        edgeWidth = isSelected ? 3 : 2
      }

      return {
        ...e,
        label: (nodeHandleLabels[e.source]?.[e.sourceHandle ?? ''])?.label || e.label,
        style: {
          strokeWidth: edgeWidth,
          stroke: edgeColor,
          transition: 'stroke 0.3s ease, stroke-width 0.3s ease',
          ...(edgeOpacity ? { opacity: edgeOpacity } : {}),
        },
        animated: edgeAnimated,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 20, height: 20 },
      }
    })
  },
  [edges, selectedEdgeId, nodeHandleLabels, activeNodeId, upstreamEdgeIds, downstreamEdgeIds, isLocked, designStyle],
  )

  // 节点注入选中状态 + 路径高亮 className
  const nodesWithSelection = useMemo(() =>
    nodes.map((n) => {
      let className = ''

      if (activeNodeId) {
        if (n.id === activeNodeId) {
          className = 'path-highlight-current'
        }
        else if (upstreamNodeIds.has(n.id)) {
          className = isLocked ? 'path-highlight-upstream' : 'path-highlight-upstream path-preview'
        }
        else if (downstreamNodeIds.has(n.id)) {
          className = isLocked ? 'path-highlight-downstream' : 'path-highlight-downstream path-preview'
        }
        else {
          className = 'path-dimmed'
        }
      }

      return { ...n, selected: n.id === selectedNodeId, className }
    }),
  [nodes, selectedNodeId, activeNodeId, upstreamNodeIds, downstreamNodeIds, isLocked],
  )

  // 右键菜单处理
  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault()
      selectNode(node.id)
      setContextMenu({ x: e.clientX, y: e.clientY, type: 'node', id: node.id })
    },
    [selectNode],
  )

  const handleEdgeContextMenu = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, type: 'edge', id: edge.id })
    },
    [],
  )

  const handlePaneClick = useCallback(() => {
    selectNode(null)
    setContextMenu(null)
    onPanePathClick()
  }, [selectNode, onPanePathClick])

  // 应用模板/预置流程（空画布引导用）
  const applyTemplate = useCallback((graph: FlowGraph) => {
    useFlowStore.getState().loadGraph(graph)
    // 标记为未保存，触发自动保存，让模板持久化
    useFlowStore.setState({ isDirty: true })
    // 等 ReactFlow 同步新节点后再适应视图
    setTimeout(() => { void reactFlow.fitView({ padding: 0.2 }) }, 0)
  }, [reactFlow])

  const handleDeleteFromMenu = useCallback(() => {
    if (!contextMenu) { return }

    if (contextMenu.type === 'node') {
      deleteNodes([contextMenu.id])
    }
    else {
      deleteEdge(contextMenu.id)
    }

    setContextMenu(null)
  }, [contextMenu, deleteNodes, deleteEdge])

  // 连接校验：不允许自连接，源节点不能是 End，目标节点不能是 Start
  const isValidConnection: IsValidConnection<FlowEdge> = useCallback(
    (edge: Connection | FlowEdge) => {
      const connection = edge as Connection

      if (connection.source === connection.target) { return false }

      const sourceNode = useFlowStore.getState().nodes.find((n) => n.id === connection.source)
      const targetNode = useFlowStore.getState().nodes.find((n) => n.id === connection.target)

      if (sourceNode?.type === FlowNodeType.End) { return false }

      if (targetNode?.type === FlowNodeType.Start) { return false }

      return true
    },
    [],
  ) as IsValidConnection<FlowEdge>

  // 节点点击处理
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id)
      onNodePathClick(node.id)
    },
    [selectNode, onNodePathClick],
  )

  // 节点悬停
  const onNodeMouseEnter = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeHover(node.id)
    },
    [onNodeHover],
  )

  const onNodeMouseLeave = useCallback(
    () => {
      onNodeHover(null)
    },
    [onNodeHover],
  )

  // 连线点击：选中连线
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      useFlowStore.setState({ selectedEdgeId: edge.id })
    },
    [],
  )

  // 连线双击：删除连线
  const onEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      deleteEdge(edge.id)
    },
    [deleteEdge],
  )

  // 连线重连（拖拽连线端点到新的节点）
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      useFlowStore.getState().pushHistory()
      useFlowStore.setState({
        edges: reconnectEdge(oldEdge, newConnection, useFlowStore.getState().edges),
        isDirty: true,
      })
    },
    [],
  )

  // 键盘事件：Delete/Backspace 删除选中连线
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // 如果焦点在输入框中则不处理
        const target = e.target as HTMLElement

        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) { return }

        const { selectedEdgeId: eid, selectedNodeId: nid } = useFlowStore.getState()

        if (eid) {
          e.preventDefault()
          deleteEdge(eid)
        }
        else if (nid) {
          e.preventDefault()
          useFlowStore.getState().deleteNodes([nid])
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => { window.removeEventListener('keydown', handleKeyDown) }
  }, [deleteEdge])

  // ==================== 用鼠标事件模拟拖拽（绕过 Tauri WebView2 HTML5 拖拽 API 兼容问题） ====================

  const canvasRef = useRef<HTMLDivElement>(null)

  // 监听全局 mouseup：如果 palette 设置了 __DRAG_NODE_TYPE__，则在画布中创建节点
  useEffect(() => {
    const el = canvasRef.current

    if (!el) { return }

    const handleMouseUp = (e: MouseEvent) => {
      const draggingType = (window as any).__DRAG_NODE_TYPE__ as string | undefined
      delete (window as any).__DRAG_NODE_TYPE__ // 读取后立即清理，防止重复放置

      if (!draggingType) { return }

      // 检查鼠标是否在画布区域内
      const r = el.getBoundingClientRect()

      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        return
      }

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })

      const defaultData = getDefaultNodeData(draggingType as FlowNodeType)
      const newNode: FlowNode = {
        id: `${draggingType}-${Date.now()}`,
        type: draggingType as FlowNodeType,
        position,
        data: defaultData,
      } as FlowNode

      addNode(newNode)
    }

    window.addEventListener('mouseup', handleMouseUp)

    return () => { window.removeEventListener('mouseup', handleMouseUp) }
  }, [screenToFlowPosition, addNode])

  return (
    <div
      ref={canvasRef}
      data-testid="flow-canvas"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        // 画布背景跟随设计风格（玻璃/拟物/新拟态各有专属背景与渐变素材）
        background: 'var(--ds-canvas-bg)',
      }}
    >
      {/* 节点高亮样式 */}
      <style>{`
        .react-flow__node.selected {
          box-shadow: 0 0 0 2px var(--ds-highlight-selected) !important;
          border-radius: 8px;
        }
        @keyframes node-running-pulse {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ds-highlight-selected) 40%, transparent); }
          50% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--ds-highlight-selected) 0%, transparent); }
        }
        .react-flow__node[data-exec-status="running"] {
          animation: node-running-pulse 1.5s ease-in-out infinite;
          border-radius: 8px;
        }
        /* 控件条（缩放/适应视图）跟随主题 */
        .react-flow__controls {
          background: var(--ds-panel-bg);
          border: var(--ds-border, none);
          box-shadow: var(--ds-shadow-sm, 0 1px 3px rgba(0,0,0,0.1));
          border-radius: 8px;
          overflow: hidden;
        }
        .react-flow__controls-button {
          background: var(--ds-node-bg);
          border-bottom: 1px solid var(--ds-divider-color);
          color: var(--ds-node-text-primary);
          fill: var(--ds-node-text-primary);
        }
        .react-flow__controls-button:hover {
          background: var(--ds-bg-elevated);
        }
        .react-flow__controls-button:last-child {
          border-bottom: none;
        }
        /* 小地图遮罩与背景跟随主题 */
        .react-flow__minimap {
          background: var(--ds-panel-bg);
          border: var(--ds-border, none);
          border-radius: 8px;
        }
        .react-flow__node[data-exec-status="passed"] {
          box-shadow: 0 0 0 2px var(--ds-success-color) !important;
          border-radius: 8px;
        }
        .react-flow__node[data-exec-status="failed"],
        .react-flow__node[data-exec-status="error"] {
          box-shadow: 0 0 0 2px var(--ds-error-color) !important;
          border-radius: 8px;
        }
        /* 路径高亮 */
        .react-flow__node.path-dimmed {
          opacity: 0.15 !important;
          transition: opacity 0.2s ease;
        }
        .react-flow__node.path-highlight-upstream {
          opacity: 1;
          transition: opacity 0.2s ease;
        }
        .react-flow__node.path-highlight-downstream {
          opacity: 1;
          transition: opacity 0.2s ease;
        }
        .react-flow__node.path-highlight-current {
          box-shadow: 0 0 0 3px var(--ds-highlight-selected), 0 0 12px color-mix(in srgb, var(--ds-highlight-selected) 40%, transparent) !important;
          border-radius: 8px;
          opacity: 1;
        }
        .react-flow__node.path-preview.path-highlight-upstream,
        .react-flow__node.path-preview.path-highlight-downstream {
          opacity: 0.5;
        }
        .react-flow__node.path-preview.path-highlight-current {
          opacity: 0.6;
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--ds-highlight-selected) 40%, transparent) !important;
        }
        .react-flow__edge.path-dimmed {
          opacity: 0.15 !important;
          transition: opacity 0.2s ease;
        }
      `}
      </style>
      <ReactFlow
        edgesReconnectable
        fitView
        defaultEdgeOptions={defaultEdgeOptions}
        edges={edgesWithSelection}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        nodes={nodesWithSelection}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onEdgeContextMenu={handleEdgeContextMenu}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodesChange={onNodesChange}
        onPaneClick={handlePaneClick}
        onReconnect={onReconnect}
      >
        <Background color="var(--ds-canvas-dot, rgba(0, 0, 0, 0.08))" gap={16} size={1} />
        <MiniMap
          maskColor="var(--ds-bg-overlay, rgba(0, 0, 0, 0.2))"
          nodeColor={(node) => {
            if (!activeNodeId) { return getCssVar('--ds-node-border-color', '#ddd') }

            if (node.id === activeNodeId) { return getCssVar('--ds-highlight-selected', '#3b82f6') }

            if (upstreamNodeIds.has(node.id)) { return getCssVar('--ds-highlight-upstream', '#f59e0b') }

            if (downstreamNodeIds.has(node.id)) { return getCssVar('--ds-highlight-downstream', '#10b981') }

            return getCssVar('--ds-node-border-color', '#ddd')
          }}
          style={{ background: 'var(--ds-panel-bg)' }}
        />
        <Controls />
      </ReactFlow>

      {/* 空画布引导 */}
      {nodes.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          <div
            style={{
              textAlign: 'center',
              pointerEvents: 'auto',
              background: 'var(--ds-panel-bg)',
              border: 'var(--ds-border, none)',
              borderRadius: 12,
              boxShadow: 'var(--ds-shadow-md, 0 2px 12px rgba(0,0,0,0.15))',
              padding: '28px 36px',
              maxWidth: 420,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ds-node-text-primary)' }}>
              从零开始搭建测试流程
            </div>
            <div style={{ fontSize: 12, color: 'var(--ds-node-text-muted)', margin: '8px 0 20px' }}>
              从左侧拖入节点，或用模板快速开始
            </div>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                block
                icon={<Wand2 size={14} />}
                type="primary"
                onClick={() => { applyTemplate(createRequestAssertTemplate()) }}
              >
                一键模板：请求 + 断言
              </Button>
              <Button
                block
                onClick={() => { applyTemplate(createInitialGraph()) }}
              >
                空白流程（开始/结束）
              </Button>
            </Space>
          </div>
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 10000,
            background: 'var(--ds-node-bg)',
            borderRadius: 6,
            boxShadow: 'var(--ds-shadow-md, 0 2px 12px rgba(0,0,0,0.15))',
            border: 'var(--ds-border, none)',
            padding: '4px 0',
            minWidth: 140,
          }}
          onContextMenu={(e) => { e.preventDefault() }}
        >
          <div
            style={{
              padding: '6px 16px',
              fontSize: 13,
              cursor: 'pointer',
              color: 'var(--ds-error-color)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onClick={handleDeleteFromMenu}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ds-bg-elevated)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            🗑 删除{contextMenu.type === 'node' ? '节点' : '连线'}
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== 外层容器组件 ====================
// 提供 ReactFlowProvider 上下文

export default function FlowCanvas() {
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null)

  return (
    <FlowInstanceContext.Provider value={{ flowInstanceRef }}>
      <ReactFlowProvider>
        <FlowCanvasInner />
      </ReactFlowProvider>
    </FlowInstanceContext.Provider>
  )
}
