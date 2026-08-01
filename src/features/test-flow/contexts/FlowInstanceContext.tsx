import { createContext, useContext } from 'react'

import type { ReactFlowInstance } from '@xyflow/react'

// ==================== FlowInstance Context ====================
// 让 FlowCanvas 暴露 ReactFlow 实例给外部组件使用

interface FlowInstanceContextValue {
  flowInstanceRef: { current: ReactFlowInstance | null }
}

export const FlowInstanceContext = createContext<FlowInstanceContextValue>({
  flowInstanceRef: { current: null },
})

// 模块级 ref：侧边栏等 ReactFlowProvider 外的组件可通过此直接访问
export const globalFlowInstanceRef: { current: ReactFlowInstance | null } = { current: null }

export function useFlowInstance(): ReactFlowInstance | null {
  return useContext(FlowInstanceContext).flowInstanceRef.current
}

export function useFlowInstanceRef(): { current: ReactFlowInstance | null } {
  return useContext(FlowInstanceContext).flowInstanceRef
}
