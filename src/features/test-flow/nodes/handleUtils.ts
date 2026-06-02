import { FlowNodeType, type FlowNodeData, type ConditionBranch } from '../types/flow.types'

/**
 * 根据节点类型和数据计算有效的输出 Handle ID 列表
 */
export function getOutputHandleIds(type: FlowNodeType, data: FlowNodeData): string[] {
  switch (type) {
    case FlowNodeType.Condition: {
      const d = data as any
      if (d.conditions && d.conditions.length > 0) {
        return [...d.conditions.map((c: ConditionBranch) => c.id), 'default']
      }
      return ['true', 'false']
    }
    case FlowNodeType.Parallel: {
      const count = (data as any).branchCount ?? 2
      return [...Array.from({ length: count }, (_, i) => `branch-${i}`), 'out']
    }
    case FlowNodeType.Loop:
      return ['out', 'loop']
    case FlowNodeType.End:
      return [] // End 节点没有输出
    default:
      return ['out'] // Start, HttpRequest, SetVariable, Wait, Assert 等默认输出 'out'
  }
}

/**
 * 根据节点类型和数据计算有效的输入 Handle ID 列表
 */
export function getInputHandleIds(type: FlowNodeType, data: FlowNodeData): string[] {
  switch (type) {
    case FlowNodeType.Start:
      return []
    default:
      return ['in']
  }
}
