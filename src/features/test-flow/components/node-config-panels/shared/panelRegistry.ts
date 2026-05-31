import { FlowNodeType } from '../../../types/flow.types'
import type { FlowNodeData } from '../../../types/flow.types'
import ParallelNodePanel from '../ParallelNodePanel'
import ConditionNodePanel from '../ConditionNodePanel'
import WaitNodePanel from '../WaitNodePanel'
import LoopNodePanel from '../LoopNodePanel'
import SetVariableNodePanel from '../SetVariableNodePanel'
import AssertNodePanel from '../AssertNodePanel'
import HttpRequestNodePanel from '../HttpRequestNodePanel'
import SubFlowNodePanel from '../SubFlowNodePanel'

// ==================== 面板组件 Props 类型 ====================

export interface PanelProps<T extends FlowNodeData = FlowNodeData> {
  data: T
  onChange: (partial: Partial<T>) => void
  projectId: string
}

// 面板组件类型
type PanelComponent = React.ComponentType<PanelProps<any>>

// ==================== 面板注册表 ====================

// 注意：面板组件将在后续步骤中逐步创建和导入
// 目前先定义注册表结构，后续会填充具体的面板组件

export const panelRegistry: Partial<Record<FlowNodeType, PanelComponent>> = {
  // Phase 3: 简单面板
  [FlowNodeType.Parallel]: ParallelNodePanel,
  [FlowNodeType.Condition]: ConditionNodePanel,
  [FlowNodeType.Wait]: WaitNodePanel,
  [FlowNodeType.Loop]: LoopNodePanel,

  // Phase 4: 复杂面板
  [FlowNodeType.SetVariable]: SetVariableNodePanel,
  [FlowNodeType.Assert]: AssertNodePanel,
  [FlowNodeType.HttpRequest]: HttpRequestNodePanel,
  [FlowNodeType.SubFlow]: SubFlowNodePanel,
}

// ==================== 获取面板组件 ====================

export function getPanelComponent(nodeType: FlowNodeType): PanelComponent | null {
  return panelRegistry[nodeType] || null
}

// ==================== 注册面板组件（用于后续扩展） ====================

export function registerPanelComponent(nodeType: FlowNodeType, component: PanelComponent) {
  ;(panelRegistry as any)[nodeType] = component
}
