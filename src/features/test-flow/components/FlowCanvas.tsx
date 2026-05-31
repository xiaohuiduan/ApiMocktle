import { useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Controls,
  useReactFlow,
  reconnectEdge,
  type Connection,
  type Node,
  type IsValidConnection,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useFlowStore } from '../store/useFlowStore'
import { getNodeTypes, getDefaultNodeData } from '../nodes/nodeRegistry'
import { FlowNodeType, type FlowNode, type FlowEdge } from '../types/flow.types'
import { FlowInstanceContext } from '../contexts/FlowInstanceContext'

// ==================== 内层画布组件 ====================
// 使用 useReactFlow() 的组件必须在 ReactFlowProvider 内部

function FlowCanvasInner() {
  const reactFlow = useReactFlow()
  const { screenToFlowPosition } = reactFlow
  const { flowInstanceRef } = useContext(FlowInstanceContext)

  // 暴露 ReactFlow 实例给外部
  useEffect(() => {
    flowInstanceRef.current = reactFlow
    return () => { flowInstanceRef.current = null }
  }, [reactFlow, flowInstanceRef])
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const onNodesChange = useFlowStore((s) => s.onNodesChange)
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange)
  const onConnect = useFlowStore((s) => s.onConnect)
  const addNode = useFlowStore((s) => s.addNode)
  const selectNode = useFlowStore((s) => s.selectNode)
  const deleteEdge = useFlowStore((s) => s.deleteEdge)
  const selectedEdgeId = useFlowStore((s) => s.selectedEdgeId)

  // 节点类型映射，使用 useMemo 避免重渲染
  const nodeTypes = useMemo(() => getNodeTypes(), [])

  // 边默认配置：贝塞尔曲线 + 方向箭头
  const defaultEdgeOptions = useMemo(() => ({
    type: 'default',
    style: { strokeWidth: 2, stroke: '#94a3b8' },
    animated: false,
    markerEnd: { type: 'arrowclosed', color: '#94a3b8', width: 20, height: 20 },
  }), [])

  // 节点的 handle 标签映射（用于连线标注）
  const nodeHandleLabels: Record<string, Record<string, { label: string; color: string }>> = useMemo(() => {
    const map: Record<string, Record<string, { label: string; color: string }>> = {}
    for (const node of nodes) {
      const d = node.data as Record<string, unknown>
      if (node.type === 'condition') {
        const conditions = d.conditions as Array<{ id: string; label: string }> | undefined
        if (conditions && conditions.length > 0) {
          const handles: Record<string, { label: string; color: string }> = {}
          for (const c of conditions) handles[c.id] = { label: c.label, color: '#3b82f6' }
          handles['default'] = { label: (d.defaultLabel as string) || '默认', color: '#9ca3af' }
          map[node.id] = handles
        } else {
          map[node.id] = {
            'true': { label: '符合', color: '#22c55e' },
            'false': { label: '不符合', color: '#ef4444' },
          }
        }
      } else if (node.type === 'loop') {
        map[node.id] = {
          'out': { label: '出口', color: '#6b7280' },
          'loop': { label: '循环体', color: '#a855f7' },
        }
      }
    }
    return map
  }, [nodes])

  // 为边注入选中状态样式 + 连线标签
  const edgesWithSelection = useMemo(() =>
    edges.map((e) => {
      const isSelected = e.id === selectedEdgeId
      const handleInfo = nodeHandleLabels[e.source]?.[e.sourceHandle || '']
      const edgeColor = isSelected ? '#3b82f6' : handleInfo?.color || '#94a3b8'
      return {
        ...e,
        label: handleInfo?.label || e.label,
        style: isSelected
          ? { strokeWidth: 3, stroke: edgeColor }
          : { strokeWidth: 2, stroke: edgeColor },
        markerEnd: { type: 'arrowclosed', color: edgeColor, width: 20, height: 20 },
      }
    }),
    [edges, selectedEdgeId, nodeHandleLabels],
  )

  // 连接校验：不允许自连接，源节点不能是 End，目标节点不能是 Start
  const isValidConnection: IsValidConnection<FlowEdge> = useCallback(
    (edge: Connection | FlowEdge) => {
      const connection = edge as Connection
      if (connection.source === connection.target) return false

      const sourceNode = useFlowStore.getState().nodes.find((n) => n.id === connection.source)
      const targetNode = useFlowStore.getState().nodes.find((n) => n.id === connection.target)

      if (sourceNode?.type === FlowNodeType.End) return false
      if (targetNode?.type === FlowNodeType.Start) return false

      return true
    },
    [],
  ) as IsValidConnection<FlowEdge>

  // 节点点击处理
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id)
    },
    [selectNode],
  )

  // 点击空白区域取消所有选择
  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

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
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

        const { selectedEdgeId: eid, selectedNodeId: nid } = useFlowStore.getState()
        if (eid) {
          e.preventDefault()
          deleteEdge(eid)
        } else if (nid) {
          e.preventDefault()
          useFlowStore.getState().deleteNodes([nid])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteEdge])

  // ==================== 用鼠标事件模拟拖拽（绕过 Tauri WebView2 HTML5 拖拽 API 兼容问题） ====================

  const canvasRef = useRef<HTMLDivElement>(null)

  // 监听全局 mouseup：如果 palette 设置了 __DRAG_NODE_TYPE__，则在画布中创建节点
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    console.log('[FlowCanvas] 画布尺寸:', { width: rect.width, height: rect.height, top: rect.top, left: rect.left })

    const handleMouseUp = (e: MouseEvent) => {
      const draggingType = (window as any).__DRAG_NODE_TYPE__ as string | undefined
      delete (window as any).__DRAG_NODE_TYPE__  // 读取后立即清理，防止重复放置
      if (!draggingType) return

      // 检查鼠标是否在画布区域内
      const r = el.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        console.log('[MouseUp] 鼠标不在画布区域内，跳过')
        return
      }

      console.log('[MouseUp] 在画布中放下节点! nodeType:', draggingType, 'clientX:', e.clientX, 'clientY:', e.clientY)

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      console.log('[MouseUp] 画布坐标:', position)

      const defaultData = getDefaultNodeData(draggingType as FlowNodeType)
      const newNode: FlowNode = {
        id: `${draggingType}-${Date.now()}`,
        type: draggingType as FlowNodeType,
        position,
        data: defaultData,
      } as FlowNode

      console.log('[MouseUp] 创建节点:', newNode)
      addNode(newNode)
      console.log('[MouseUp] 当前节点数:', useFlowStore.getState().nodes.length)
    }

    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [screenToFlowPosition, addNode])

  return (
    <div
      ref={canvasRef}
      style={{ width: '100%', height: '100%' }}
      data-testid="flow-canvas"
    >
      <ReactFlow
        nodes={nodes}
        edges={edgesWithSelection}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        isValidConnection={isValidConnection}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onEdgeClick={onEdgeClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        edgesReconnectable
        fitView
      >
        <Background gap={16} size={1} />
        <MiniMap />
        <Controls />
      </ReactFlow>
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
