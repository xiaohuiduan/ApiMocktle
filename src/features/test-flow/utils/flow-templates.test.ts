import { describe, expect, it } from 'vitest'

import { FlowNodeType } from '../types/flow.types'

import { createInitialGraph, createRequestAssertTemplate } from './flow-templates'

describe('flow-templates', () => {
  it('空流程包含开始和结束节点，无连线', () => {
    const graph = createInitialGraph()

    expect(graph.nodes.map((n) => n.type)).toEqual([FlowNodeType.Start, FlowNodeType.End])
    expect(graph.nodes[0].data.label).toBe('开始')
    expect(graph.nodes[1].data.label).toBe('结束')
    expect(graph.edges).toEqual([])
  })

  it('请求断言模板节点完整、边连接正确', () => {
    const graph = createRequestAssertTemplate()

    expect(graph.nodes.map((n) => n.type)).toEqual([
      FlowNodeType.Start,
      FlowNodeType.HttpRequest,
      FlowNodeType.Assert,
      FlowNodeType.End,
    ])
    expect(graph.edges).toHaveLength(3)

    const ids = new Set(graph.nodes.map((n) => n.id))

    for (const edge of graph.edges) {
      expect(ids.has(edge.source)).toBe(true)
      expect(ids.has(edge.target)).toBe(true)
    }

    // 链式：开始 → HTTP 请求 → 断言 → 结束
    expect(graph.edges[0].source).toBe(graph.nodes[0].id)
    expect(graph.edges[0].target).toBe(graph.nodes[1].id)
    expect(graph.edges[1].source).toBe(graph.nodes[1].id)
    expect(graph.edges[1].target).toBe(graph.nodes[2].id)
    expect(graph.edges[2].source).toBe(graph.nodes[2].id)
    expect(graph.edges[2].target).toBe(graph.nodes[3].id)
  })

  it('节点 id 唯一', () => {
    const graph = createRequestAssertTemplate()
    const ids = graph.nodes.map((n) => n.id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})
