import { describe, it, expect } from 'vitest'
import { nodeRegistry, getNodeTypes, getDefaultNodeData } from './nodeRegistry'
import { FlowNodeType } from '../types/flow.types'

describe('nodeRegistry', () => {
  it('应该注册所有 10 种节点类型', () => {
    const types = Object.keys(nodeRegistry)
    expect(types).toHaveLength(10)
  })

  it('应该包含 start 节点', () => {
    const entry = nodeRegistry[FlowNodeType.Start]
    expect(entry).toBeDefined()
    expect(entry.component).toBeDefined()
    expect(entry.defaultData.label).toBe('Start')
    expect(entry.inputHandles).toEqual([])
    expect(entry.outputHandles).toEqual(['out'])
  })

  it('应该包含 end 节点', () => {
    const entry = nodeRegistry[FlowNodeType.End]
    expect(entry).toBeDefined()
    expect(entry.defaultData.label).toBe('End')
    expect(entry.inputHandles).toEqual(['in'])
    expect(entry.outputHandles).toEqual([])
  })

  it('应该包含 httpRequest 节点', () => {
    const entry = nodeRegistry[FlowNodeType.HttpRequest]
    expect(entry).toBeDefined()
    expect(entry.defaultData.label).toBe('HTTP Request')
    expect(entry.inputHandles).toEqual(['in'])
    expect(entry.outputHandles).toEqual(['out'])
  })

  it('应该包含 condition 节点（有两个输出）', () => {
    const entry = nodeRegistry[FlowNodeType.Condition]
    expect(entry).toBeDefined()
    expect(entry.outputHandles).toEqual(['true', 'false'])
  })

  it('应该包含 loop 节点（有 out 和 loop 输出）', () => {
    const entry = nodeRegistry[FlowNodeType.Loop]
    expect(entry).toBeDefined()
    expect(entry.outputHandles).toEqual(['out', 'loop'])
  })

  it('应该包含 parallel 节点', () => {
    const entry = nodeRegistry[FlowNodeType.Parallel]
    expect(entry).toBeDefined()
    expect(entry.defaultData.label).toBe('Parallel')
  })

  it('应该包含 wait 节点', () => {
    const entry = nodeRegistry[FlowNodeType.Wait]
    expect(entry).toBeDefined()
    expect(entry.defaultData.label).toBe('Wait')
  })

  it('应该包含 subFlow 节点', () => {
    const entry = nodeRegistry[FlowNodeType.SubFlow]
    expect(entry).toBeDefined()
    expect(entry.defaultData.label).toBe('Sub Flow')
  })

  it('应该包含 setVariable 节点', () => {
    const entry = nodeRegistry[FlowNodeType.SetVariable]
    expect(entry).toBeDefined()
    expect(entry.defaultData.label).toBe('Set Variable')
  })

  it('应该包含 assert 节点', () => {
    const entry = nodeRegistry[FlowNodeType.Assert]
    expect(entry).toBeDefined()
    expect(entry.defaultData.label).toBe('Assert')
  })
})

describe('getNodeTypes', () => {
  it('应该返回 nodeTypes 映射', () => {
    const types = getNodeTypes()
    expect(Object.keys(types)).toHaveLength(10)
    expect(types[FlowNodeType.Start]).toBeDefined()
    expect(types[FlowNodeType.End]).toBeDefined()
  })
})

describe('getDefaultNodeData', () => {
  it('应该返回指定类型的默认数据', () => {
    const data = getDefaultNodeData(FlowNodeType.HttpRequest)
    expect(data.label).toBe('HTTP Request')
    expect(data.enabled).toBe(true)
    expect((data as Record<string, unknown>).menuItemId).toBe('')
  })

  it('应该返回新的副本（不共享引用）', () => {
    const data1 = getDefaultNodeData(FlowNodeType.Start)
    const data2 = getDefaultNodeData(FlowNodeType.Start)
    expect(data1).not.toBe(data2)
    expect(data1).toEqual(data2)
  })

  it('应该为 condition 类型返回正确数据', () => {
    const data = getDefaultNodeData(FlowNodeType.Condition)
    expect(data.label).toBe('Condition')
    expect((data as Record<string, unknown>).conditionType).toBe('expression')
  })

  it('应该为 loop 类型返回正确数据', () => {
    const data = getDefaultNodeData(FlowNodeType.Loop)
    expect(data.label).toBe('Loop')
    expect((data as Record<string, unknown>).loopType).toBe('count')
    expect((data as Record<string, unknown>).maxIterations).toBe(100)
  })

  it('应该为 parallel 类型返回正确数据', () => {
    const data = getDefaultNodeData(FlowNodeType.Parallel)
    expect(data.label).toBe('Parallel')
    expect((data as Record<string, unknown>).branchCount).toBe(2)
    expect((data as Record<string, unknown>).waitAll).toBe(true)
  })

  it('应该为 assert 类型返回空断言数组', () => {
    const data = getDefaultNodeData(FlowNodeType.Assert)
    expect(data.label).toBe('Assert')
    expect((data as Record<string, unknown>).assertions).toEqual([])
  })
})
