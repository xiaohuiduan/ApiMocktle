import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges, type Connection,
  type EdgeChange,
  type NodeChange } from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import { create } from 'zustand'

import { getInputHandleIds, getOutputHandleIds } from '../nodes/handleUtils'
import { migrateGraph } from '../nodes/migrations'
import type { FlowEdge, FlowGraph, FlowNode, FlowNodeData } from '../types/flow.types'

// ==================== 接口定义 ====================

interface FlowState {
  // 图数据
  nodes: FlowNode[]
  edges: FlowEdge[]

  // UI 状态
  selectedNodeId: string | null
  selectedEdgeId: string | null
  drawerOpen: boolean

  // 脏状态跟踪
  isDirty: boolean
  lastSavedGraph: FlowGraph | null

  // 撤销/重做
  history: FlowGraph[]
  historyIndex: number

  // 节点/边操作
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (node: FlowNode) => void
  deleteNodes: (nodeIds: string[]) => void
  updateNodeData: (nodeId: string, data: Partial<FlowNodeData>) => void
  cleanupOrphanedEdges: (nodeId: string) => void
  selectNode: (nodeId: string | null) => void
  deleteEdge: (edgeId: string) => void
  setDrawerOpen: (open: boolean) => void

  // 持久化
  loadGraph: (graph: FlowGraph) => void
  getGraph: () => FlowGraph
  markSaved: () => void

  // 撤销/重做
  pushHistory: () => void
  undo: () => void
  redo: () => void
  clearHistory: () => void

  // 重置
  reset: () => void

  // 自动布局
  autoLayout: () => Promise<void>

  // Agent 地址（Mock 依赖发现用）
  agentUrl: string
  setAgentUrl: (url: string) => void
}

// ==================== 常量 ====================

const MAX_HISTORY = 50

// ==================== Agent 地址持久化 ====================

const AGENT_URL_LS_KEY = 'flow-agent-url'

function tryLoadAgentUrl(): string {
  try { return localStorage.getItem(AGENT_URL_LS_KEY) ?? '' }
  catch { return '' }
}

// ==================== Store 实现 ====================

export const useFlowStore = create<FlowState>((set, get) => ({
  // 初始状态
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  drawerOpen: false,
  isDirty: false,
  lastSavedGraph: null,
  history: [],
  historyIndex: -1,
  agentUrl: tryLoadAgentUrl(),

  // 节点变更处理
  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes) as FlowNode[],
      isDirty: true,
    })
  },

  // 边变更处理
  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
      isDirty: true,
    })
  },

  // 连接处理
  onConnect: (connection) => {
    get().pushHistory()
    set({
      edges: addEdge(connection, get().edges),
      isDirty: true,
    })
  },

  // 添加节点
  addNode: (node) => {
    get().pushHistory()
    set({
      nodes: [...get().nodes, node],
      isDirty: true,
    })
  },

  // 删除节点
  deleteNodes: (nodeIds) => {
    get().pushHistory()
    const nodeSet = new Set(nodeIds)
    set({
      nodes: get().nodes.filter((node) => !nodeSet.has(node.id)),
      edges: get().edges.filter(
        (edge) => !nodeSet.has(edge.source) && !nodeSet.has(edge.target),
      ),
      selectedNodeId: nodeSet.has(get().selectedNodeId ?? '') ? null : get().selectedNodeId,
      isDirty: true,
    })
  },

  // 更新节点数据
  updateNodeData: (nodeId, data) => {
    get().pushHistory()
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node,
      ),
      isDirty: true,
    })
    // 自动清理孤立的边
    get().cleanupOrphanedEdges(nodeId)
  },

  // 清理孤立的边（当节点的 handles 数量变化时）
  cleanupOrphanedEdges: (nodeId: string) => {
    const { nodes, edges } = get()
    const node = nodes.find((n) => n.id === nodeId)

    if (!node) { return }

    const nodeType = node.type
    const nodeData = node.data

    const validSourceHandles = new Set(getOutputHandleIds(nodeType, nodeData))
    validSourceHandles.add(undefined as any) // 允许没有 handle ID 的边

    const validTargetHandles = new Set(getInputHandleIds(nodeType, nodeData))
    validTargetHandles.add(undefined as any)

    const filteredEdges = edges.filter((edge) => {
      // 检查源节点的 handle
      if (edge.source === nodeId) {
        if (edge.sourceHandle && !validSourceHandles.has(edge.sourceHandle)) {
          return false
        }
      }

      // 检查目标节点的 handle
      if (edge.target === nodeId) {
        if (edge.targetHandle && !validTargetHandles.has(edge.targetHandle)) {
          return false
        }
      }

      return true
    })

    // 如果有边被删除，更新状态
    if (filteredEdges.length !== edges.length) {
      set({ edges: filteredEdges, isDirty: true })
    }
  },

  // 选择节点
  selectNode: (nodeId) => {
    set({
      selectedNodeId: nodeId,
      selectedEdgeId: null,
      drawerOpen: nodeId !== null,
    })
  },

  // 删除连线
  deleteEdge: (edgeId) => {
    get().pushHistory()
    set({
      edges: get().edges.filter((e) => e.id !== edgeId),
      selectedEdgeId: null,
      isDirty: true,
    })
  },

  // 设置抽屉打开状态
  setDrawerOpen: (open) => {
    if (!open) {
      set({ drawerOpen: false, selectedNodeId: null })
    }
    else {
      set({ drawerOpen: true })
    }
  },

  // Agent 地址
  setAgentUrl: (url) => {
    set({ agentUrl: url })

    try { localStorage.setItem(AGENT_URL_LS_KEY, url) }
    catch { /* ignore */ }
  },

  // 加载图
  loadGraph: (graph) => {
    // 应用迁移逻辑，确保向后兼容
    const migratedGraph = migrateGraph(graph)

    set({
      nodes: migratedGraph.nodes,
      edges: migratedGraph.edges,
      isDirty: false,
      lastSavedGraph: migratedGraph,
      history: [],
      historyIndex: -1,
    })
  },

  // 获取图
  getGraph: () => {
    const { nodes, edges } = get()

    return {
      nodes: nodes.map(({ id, type, position, data }) => {
        // 剔除运行结果字段（exec*），避免污染存档
        const cleanData = { ...(data as Record<string, unknown>) }
        delete cleanData.execStatus
        delete cleanData.execError
        delete cleanData.execDurationMs
        delete cleanData.execRequest
        delete cleanData.execResponse

        return { id, type, position, data: cleanData as FlowNodeData }
      }) as FlowNode[],
      edges: edges.map(({ id, source, target, sourceHandle, targetHandle, label, data }) => ({
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
        label,
        data,
      })) as FlowEdge[],
    }
  },

  // 标记为已保存
  markSaved: () => {
    const graph = get().getGraph()
    set({
      isDirty: false,
      lastSavedGraph: graph,
    })
  },

  // 推送历史
  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get()
    const currentGraph: FlowGraph = {
      nodes: [...nodes],
      edges: [...edges],
    }

    // 截断当前位置之后的历史
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(currentGraph)

    // 限制历史长度
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift()
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    })
  },

  // 撤销
  undo: () => {
    const { history, historyIndex } = get()

    if (historyIndex < 0) { return }

    const previousGraph = history[historyIndex]
    set({
      nodes: previousGraph.nodes,
      edges: previousGraph.edges,
      historyIndex: historyIndex - 1,
      isDirty: true,
    })
  },

  // 重做
  redo: () => {
    const { history, historyIndex } = get()

    if (historyIndex >= history.length - 1) { return }

    const nextIndex = historyIndex + 1
    const nextGraph = history[nextIndex]
    set({
      nodes: nextGraph.nodes,
      edges: nextGraph.edges,
      historyIndex: nextIndex,
      isDirty: true,
    })
  },

  // 清空历史
  clearHistory: () => {
    set({
      history: [],
      historyIndex: -1,
    })
  },

  // 重置
  reset: () => {
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      drawerOpen: false,
      isDirty: false,
      lastSavedGraph: null,
      history: [],
      historyIndex: -1,
    })
    // 重置不清理 agentEnvName，这是用户偏好
  },

  // 自动布局（使用 ELK 算法，最小化边交叉）
  autoLayout: async () => {
    const { nodes, edges } = get()

    if (nodes.length === 0) { return }

    get().pushHistory()

    const NODE_WIDTH = 200
    const NODE_HEIGHT = 60

    const elk = new ELK()

    const graph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.spacing.nodeNode': '60',
        'elk.layered.spacing.nodeNodeBetweenLayers': '80',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
        'elk.padding': '[40, 40, 40, 40]',
      },
      children: nodes.map((node) => ({
        id: node.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    }

    try {
      const layouted = await elk.layout(graph)
      const posMap = new Map<string, { x: number, y: number }>()

      for (const child of layouted.children ?? []) {
        posMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
      }

      const layoutedNodes = nodes.map((node) => {
        const pos = posMap.get(node.id)

        return pos ? { ...node, position: pos } : node
      })

      set({ nodes: layoutedNodes, isDirty: true })
    }
    catch (err) {
      console.error('[autoLayout] ELK layout failed:', err)
    }
  },
}))
