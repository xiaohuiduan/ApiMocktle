import { FlowNodeType, type FlowNodeData } from '../types/flow.types'
import StartNode from './StartNode'
import EndNode from './EndNode'
import HttpRequestNode from './HttpRequestNode'
import ConditionNode from './ConditionNode'
import LoopNode from './LoopNode'
import ParallelNode from './ParallelNode'
import WaitNode from './WaitNode'
import SubFlowNode from './SubFlowNode'
import SetVariableNode from './SetVariableNode'
import AssertNode from './AssertNode'

// ==================== 注册表条目 ====================

export interface NodeRegistryEntry {
  component: React.ComponentType<any>
  defaultData: Partial<FlowNodeData>
  inputHandles: string[]
  outputHandles: string[]
}

// ==================== 默认数据 ====================

const startDefault = (): Partial<FlowNodeData> => ({
  label: 'Start',
  enabled: true,
})

const endDefault = (): Partial<FlowNodeData> => ({
  label: 'End',
  enabled: true,
})

const httpRequestDefault = (): Partial<FlowNodeData> => ({
  label: 'HTTP Request',
  enabled: true,
  menuItemId: '',
})

const conditionDefault = (): Partial<FlowNodeData> => ({
  label: 'Condition',
  enabled: true,
  conditionType: 'expression',
})

const loopDefault = (): Partial<FlowNodeData> => ({
  label: 'Loop',
  enabled: true,
  loopType: 'count',
  count: 1,
  iteratorVariable: 'i',
  maxIterations: 100,
})

const parallelDefault = (): Partial<FlowNodeData> => ({
  label: 'Parallel',
  enabled: true,
  branchCount: 2,
  waitAll: true,
})

const waitDefault = (): Partial<FlowNodeData> => ({
  label: 'Wait',
  enabled: true,
  waitType: 'fixed',
  durationMs: 1000,
})

const subFlowDefault = (): Partial<FlowNodeData> => ({
  label: 'Sub Flow',
  enabled: true,
  targetTaskId: '',
})

const setVariableDefault = (): Partial<FlowNodeData> => ({
  label: 'Set Variable',
  enabled: true,
  assignments: [],
})

const assertDefault = (): Partial<FlowNodeData> => ({
  label: 'Assert',
  enabled: true,
  assertions: [],
})

// ==================== 注册表 ====================

export const nodeRegistry: Record<string, NodeRegistryEntry> = {
  [FlowNodeType.Start]: {
    component: StartNode,
    defaultData: startDefault(),
    inputHandles: [],
    outputHandles: ['out'],
  },
  [FlowNodeType.End]: {
    component: EndNode,
    defaultData: endDefault(),
    inputHandles: ['in'],
    outputHandles: [],
  },
  [FlowNodeType.HttpRequest]: {
    component: HttpRequestNode,
    defaultData: httpRequestDefault(),
    inputHandles: ['in'],
    outputHandles: ['out'],
  },
  [FlowNodeType.Condition]: {
    component: ConditionNode,
    defaultData: conditionDefault(),
    inputHandles: ['in'],
    outputHandles: ['true', 'false'],
  },
  [FlowNodeType.Loop]: {
    component: LoopNode,
    defaultData: loopDefault(),
    inputHandles: ['in'],
    outputHandles: ['out', 'loop'],
  },
  [FlowNodeType.Parallel]: {
    component: ParallelNode,
    defaultData: parallelDefault(),
    inputHandles: ['in'],
    outputHandles: ['out'],
  },
  [FlowNodeType.Wait]: {
    component: WaitNode,
    defaultData: waitDefault(),
    inputHandles: ['in'],
    outputHandles: ['out'],
  },
  [FlowNodeType.SubFlow]: {
    component: SubFlowNode,
    defaultData: subFlowDefault(),
    inputHandles: ['in'],
    outputHandles: ['out'],
  },
  [FlowNodeType.SetVariable]: {
    component: SetVariableNode,
    defaultData: setVariableDefault(),
    inputHandles: ['in'],
    outputHandles: ['out'],
  },
  [FlowNodeType.Assert]: {
    component: AssertNode,
    defaultData: assertDefault(),
    inputHandles: ['in'],
    outputHandles: ['out'],
  },
}

// ==================== 辅助函数 ====================

/**
 * 获取 ReactFlow nodeTypes 对象，可直接传给 <ReactFlow nodeTypes={...} />
 */
export function getNodeTypes(): Record<string, React.ComponentType<any>> {
  const types: Record<string, React.ComponentType<any>> = {}
  for (const [key, entry] of Object.entries(nodeRegistry)) {
    types[key] = entry.component
  }
  return types
}

/**
 * 根据节点类型获取默认数据（返回新副本）
 */
export function getDefaultNodeData(type: FlowNodeType): Partial<FlowNodeData> {
  const entry = nodeRegistry[type]
  return entry ? { ...entry.defaultData } : { label: 'Unknown', enabled: true }
}
