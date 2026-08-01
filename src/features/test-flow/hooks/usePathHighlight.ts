import { useCallback, useMemo, useState } from 'react'

import { useFlowStore } from '../store/useFlowStore'
import type { FlowEdge } from '../types/flow.types'

// ==================== 类型 ====================

interface PathResult {
  nodeIds: Set<string>
  edgeIds: Set<string>
}

export interface PathHighlight {
  upstreamNodeIds: Set<string>
  downstreamNodeIds: Set<string>
  upstreamEdgeIds: Set<string>
  downstreamEdgeIds: Set<string>
  activeNodeId: string | null
  isLocked: boolean
  onNodeHover: (nodeId: string | null) => void
  onNodeClick: (nodeId: string) => void
  onPaneClick: () => void
  breadcrumbs: { id: string, label: string }[] | null
}

// ==================== BFS 工具函数 ====================

/** 逆向 BFS：找所有上游节点和边 */
function getUpstream(nodeId: string, edges: FlowEdge[]): PathResult {
  const visited = new Set<string>()
  const queue = [nodeId]
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()!

    for (const edge of edges) {
      if (edge.target === current && !visited.has(edge.source)) {
        visited.add(edge.source)
        queue.push(edge.source)
        nodeIds.add(edge.source)
        edgeIds.add(edge.id)
      }
    }
  }

  return { nodeIds, edgeIds }
}

/** 正向 BFS：找所有下游节点和边 */
function getDownstream(nodeId: string, edges: FlowEdge[]): PathResult {
  const visited = new Set<string>()
  const queue = [nodeId]
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()!

    for (const edge of edges) {
      if (edge.source === current && !visited.has(edge.target)) {
        visited.add(edge.target)
        queue.push(edge.target)
        nodeIds.add(edge.target)
        edgeIds.add(edge.id)
      }
    }
  }

  return { nodeIds, edgeIds }
}

/** 构建面包屑：从 Start 到当前节点的上游路径 + 当前 + 下游到 End */
function buildBreadcrumbs(
  nodeId: string,
  nodes: { id: string, data: { label: string } }[],
  edges: FlowEdge[],
): { id: string, label: string }[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  // 上游路径：逆向 BFS 收集，然后反转得到 Start → current 的顺序
  const upstream: string[] = []
  const visited = new Set<string>()
  const queue = [nodeId]

  while (queue.length > 0) {
    const current = queue.shift()!

    for (const edge of edges) {
      if (edge.target === current && !visited.has(edge.source)) {
        visited.add(edge.source)
        upstream.push(edge.source)
        queue.push(edge.source)
      }
    }
  }

  upstream.reverse()

  // 下游路径：正向 BFS
  const downstream: string[] = []
  const visitedDown = new Set<string>()
  const queueDown = [nodeId]

  while (queueDown.length > 0) {
    const current = queueDown.shift()!

    for (const edge of edges) {
      if (edge.source === current && !visitedDown.has(edge.target)) {
        visitedDown.add(edge.target)
        downstream.push(edge.target)
        queueDown.push(edge.target)
      }
    }
  }

  // 组合：upstream → current → downstream
  const allIds = [...upstream, nodeId, ...downstream]

  return allIds.map((id) => ({
    id,
    label: nodeMap.get(id)?.data?.label ?? id,
  }))
}

// ==================== Hook ====================

export function usePathHighlight(): PathHighlight {
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)

  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)
  const [lockedNodeId, setLockedNodeId] = useState<string | null>(null)

  // 锁定优先，否则悬停
  const activeNodeId = lockedNodeId ?? hoverNodeId
  const isLocked = lockedNodeId !== null

  // 计算上游
  const upstream = useMemo(
    () => (activeNodeId ? getUpstream(activeNodeId, edges) : { nodeIds: new Set<string>(), edgeIds: new Set<string>() }),
    [activeNodeId, edges],
  )

  // 计算下游
  const downstream = useMemo(
    () => (activeNodeId ? getDownstream(activeNodeId, edges) : { nodeIds: new Set<string>(), edgeIds: new Set<string>() }),
    [activeNodeId, edges],
  )

  // 面包屑
  const breadcrumbs = useMemo(
    () => (activeNodeId ? buildBreadcrumbs(activeNodeId, nodes, edges) : null),
    [activeNodeId, nodes, edges],
  )

  const onNodeHover = useCallback(
    (nodeId: string | null) => {
      if (lockedNodeId) { return } // 锁定时忽略悬停

      setHoverNodeId(nodeId)
    },
    [lockedNodeId],
  )

  const onNodeClick = useCallback(
    (nodeId: string) => {
      if (lockedNodeId === nodeId) {
        // toggle：取消锁定
        setLockedNodeId(null)
      }
      else {
        setLockedNodeId(nodeId)
      }

      setHoverNodeId(null) // 清除悬停
    },
    [lockedNodeId],
  )

  const onPaneClick = useCallback(() => {
    setLockedNodeId(null)
    setHoverNodeId(null)
  }, [])

  return {
    upstreamNodeIds: upstream.nodeIds,
    downstreamNodeIds: downstream.nodeIds,
    upstreamEdgeIds: upstream.edgeIds,
    downstreamEdgeIds: downstream.edgeIds,
    activeNodeId,
    isLocked,
    onNodeHover,
    onNodeClick,
    onPaneClick,
    breadcrumbs,
  }
}
