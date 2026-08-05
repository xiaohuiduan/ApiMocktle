import { getDefaultNodeData } from '../nodes/nodeRegistry'
import { type FlowEdge, type FlowGraph, type FlowNode, type FlowNodeData, FlowNodeType } from '../types/flow.types'

/** 构造节点（id 唯一，label 用中文便于新手理解） */
function makeNode(
  type: FlowNodeType,
  label: string,
  x: number,
  y: number,
  stamp: number,
): FlowNode {
  return {
    id: `${type}-${stamp}`,
    type,
    position: { x, y },
    data: { ...getDefaultNodeData(type), label } as FlowNodeData,
  }
}

function makeEdge(id: string, source: string, target: string): FlowEdge {
  return { id, source, target, sourceHandle: 'out', targetHandle: 'in' }
}

/** 空画布预置：开始 → 结束 */
export function createInitialGraph(): FlowGraph {
  const stamp = Date.now()

  return {
    nodes: [
      makeNode(FlowNodeType.Start, '开始', 0, 0, stamp),
      makeNode(FlowNodeType.End, '结束', 0, 200, stamp),
    ],
    edges: [],
  }
}

/** 一键模板：开始 → HTTP 请求 → 断言 → 结束 */
export function createRequestAssertTemplate(): FlowGraph {
  const stamp = Date.now()
  const start = makeNode(FlowNodeType.Start, '开始', 0, 0, stamp)
  const http = makeNode(FlowNodeType.HttpRequest, 'HTTP 请求', 0, 140, stamp)
  const assert = makeNode(FlowNodeType.Assert, '断言', 0, 280, stamp)
  const end = makeNode(FlowNodeType.End, '结束', 0, 420, stamp)

  return {
    nodes: [start, http, assert, end],
    edges: [
      makeEdge(`e1-${stamp}`, start.id, http.id),
      makeEdge(`e2-${stamp}`, http.id, assert.id),
      makeEdge(`e3-${stamp}`, assert.id, end.id),
    ],
  }
}
