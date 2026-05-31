import { FlowNodeType, type FlowGraph } from '../types/flow.types'

/**
 * 迁移流程图数据，确保向后兼容
 */
export function migrateGraph(graph: FlowGraph): FlowGraph {
  let edges = graph.edges
  const nodes = graph.nodes

  // 迁移 1：并行节点边从 'out' 迁移到 'branch-0'
  edges = edges.map((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source)
    if (sourceNode?.type === FlowNodeType.Parallel && edge.sourceHandle === 'out') {
      return { ...edge, sourceHandle: 'branch-0' }
    }
    return edge
  })

  // 未来可以在这里添加更多迁移逻辑

  return { ...graph, nodes, edges }
}
