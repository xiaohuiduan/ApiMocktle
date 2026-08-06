import type { Connection, Edge, Node } from '@xyflow/react'

import type { TestAssertion, TestExtractor } from '@/types'

import type { MockCallLog, MockRule } from './mock.types'

// ==================== 节点类型枚举 ====================

export enum FlowNodeType {
  Start = 'start',
  End = 'end',
  HttpRequest = 'httpRequest',
  Condition = 'condition',
  Loop = 'loop',
  Parallel = 'parallel',
  Wait = 'wait',
  SubFlow = 'subFlow',
  SetVariable = 'setVariable',
  Assert = 'assert',
}

// ==================== 执行状态类型 ====================

export type NodeExecStatus = 'idle' | 'running' | 'passed' | 'failed' | 'skipped' | 'error'

// ==================== 节点类型中文名（全站统一） ====================

export const NODE_TYPE_LABELS: Record<FlowNodeType, string> = {
  [FlowNodeType.Start]: '开始',
  [FlowNodeType.End]: '结束',
  [FlowNodeType.HttpRequest]: 'HTTP 请求',
  [FlowNodeType.Condition]: '条件判断',
  [FlowNodeType.Loop]: '循环',
  [FlowNodeType.Parallel]: '并行',
  [FlowNodeType.Wait]: '等待',
  [FlowNodeType.SetVariable]: '变量赋值',
  [FlowNodeType.Assert]: '断言',
  [FlowNodeType.SubFlow]: '子流程',
}

// ==================== 基础节点数据 ====================

export interface BaseNodeData {
  label: string
  description?: string
  enabled: boolean
  execStatus?: NodeExecStatus
  execDurationMs?: number
  execError?: string
  [key: string]: unknown // required by ReactFlow
}

// ==================== Handle 规范类型 ====================

export type HandleSpec = string | { id: string, label?: string, color?: string }

// ==================== 条件分支类型 ====================

export interface ConditionBranch {
  id: string // 唯一 handle ID，如 'cond-0', 'cond-1'
  expression: string // JavaScript 表达式
  label: string // 显示标签，如 'Status 200', 'Has Token'
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 标记类型，仅用于区分联合成员
export interface StartNodeData extends BaseNodeData {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 标记类型，仅用于区分联合成员
export interface EndNodeData extends BaseNodeData {}

// ==================== 各节点类型数据 ====================

export interface HttpRequestNodeData extends BaseNodeData {
  menuItemId: string // reference to existing API menu item
  requestOverride?: Record<string, unknown>
  preScript?: string
  postScript?: string
  assertions?: TestAssertion[]
  extractors?: TestExtractor[]
  mockRules?: MockRule[]
}

export interface ConditionNodeData extends BaseNodeData {
  conditionType: 'expression' | 'variable_check' | 'status_code'
  expression?: string // JavaScript expression evaluated with variables
  variableName?: string // for variable_check type
  operator?: 'equals' | 'not_equals' | 'exists' | 'greater_than' | 'less_than' | 'contains'
  compareValue?: string
  // 新增：多条件分支支持
  conditions?: ConditionBranch[]
  defaultLabel?: string
}

export interface LoopNodeData extends BaseNodeData {
  loopType: 'count' | 'while' | 'for_each'
  count?: number | string // fixed number or {{variable}} expression
  whileExpression?: string // JavaScript expression for while loop
  collectionVariable?: string // variable name holding array for for_each
  iteratorVariable?: string // loop variable name (e.g., "i", "item")
  maxIterations?: number // safety limit, default 100
  breakOnFailure?: boolean // true = 循环体失败时中断循环（默认 true）
}

export interface ParallelNodeData extends BaseNodeData {
  branchCount: number // how many parallel branches (>=2)
  waitAll: boolean // true = wait all, false = wait first
  timeoutMs?: number // overall timeout for all branches
}

export interface WaitNodeData extends BaseNodeData {
  waitType: 'fixed' | 'variable' | 'condition'
  durationMs?: number // for fixed wait
  durationVariable?: string // variable name holding ms value
  conditionExpression?: string // poll until this is truthy
  pollIntervalMs?: number // for condition-based wait
  maxWaitMs?: number // timeout for condition wait
}

export interface SubFlowNodeData extends BaseNodeData {
  targetTaskId: string // references another TestTask
  passVariables?: boolean // pass current scope to sub-flow
  mergeVariables?: boolean // merge sub-flow results back
}

export interface SetVariableNodeData extends BaseNodeData {
  assignments: {
    variable: string
    operator: '=' | '+=' | '-='
    value: string // literal or {{expression}}
  }[]
}

export interface AssertNodeData extends BaseNodeData {
  assertions: TestAssertion[]
  variableExpression?: string // evaluate expression and assert
  script?: string // JavaScript assertion code using pm.test()
}

// ==================== 类型联合 ====================

export type FlowNodeData =
  | StartNodeData
  | EndNodeData
  | HttpRequestNodeData
  | ConditionNodeData
  | LoopNodeData
  | ParallelNodeData
  | WaitNodeData
  | SubFlowNodeData
  | SetVariableNodeData
  | AssertNodeData

// ==================== ReactFlow 类型 ====================

export type FlowNode = Node<FlowNodeData, FlowNodeType>
export type FlowEdge = Edge
export type FlowConnection = Connection

// ==================== 流程图数据结构 ====================

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
  viewport?: { x: number, y: number, zoom: number }
}

// ==================== 执行计划类型 ====================

export interface ExecutionStep {
  nodeId: string
  type: FlowNodeType
  data: FlowNodeData
  next?: ExecutionStep // for sequential nodes
  branches?: {
    // for Condition, Parallel
    label: string
    steps: ExecutionStep
  }[]
  loopBody?: ExecutionStep // for Loop nodes
  afterLoop?: ExecutionStep // loop continuation
}

// ==================== 执行上下文 ====================

export interface ExecutionContext {
  variables: Record<string, string>
  projectId: string
  baseUrl?: string
  environmentVariables: Record<string, string>
  failFast: boolean
  abortSignal: AbortSignal
  onNodeStart: (nodeId: string) => void
  onNodeComplete: (nodeId: string, result: NodeResult) => void
  onVariableChange: (variables: Record<string, string>) => void
}

// ==================== 节点执行结果 ====================

export interface NodeResult {
  nodeId: string
  status: NodeExecStatus
  requestJson?: Record<string, unknown>
  responseJson?: Record<string, unknown>
  assertionResults?: {
    assertion: TestAssertion
    passed: boolean
    actual?: unknown
    error?: string
  }[]
  extractorResults?: {
    extractor: TestExtractor
    success: boolean
    value?: string
    error?: string
  }[]
  variableDeltas?: Record<string, string>
  mockCallLogs?: MockCallLog[]
  durationMs: number
  error?: string
}

// ==================== 变量作用域 ====================

export type VariableScopeLayer = Record<string, string>

// ==================== 节点配置 ====================

export interface NodeConfig {
  type: FlowNodeType
  label: string
  icon: string
  color: string
  defaultData: Partial<FlowNodeData>
  inputHandles: string[]
  outputHandles: string[]
}

// ==================== 工具栏动作 ====================

export type ToolbarAction =
  | 'run'
  | 'abort'
  | 'validate'
  | 'autoLayout'
  | 'undo'
  | 'redo'
  | 'zoomIn'
  | 'zoomOut'
  | 'fitView'
  | 'export'
  | 'import'
  | 'clear'

// ==================== 验证警告 ====================

export interface ValidationWarning {
  type: 'error' | 'warning'
  message: string
  nodeId?: string
  edgeId?: string
}
