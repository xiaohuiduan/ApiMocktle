import { createContext, useContext, useRef, type RefObject } from 'react'
import type { ReactFlowInstance } from '@xyflow/react'

// ==================== FlowInstance Context ====================
// 让 FlowCanvas 暴露 ReactFlow 实例给外部组件使用

interface FlowInstanceContextValue {
  flowInstanceRef: RefObject<ReactFlowInstance | null>
}

export const FlowInstanceContext = createContext<FlowInstanceContextValue>({
  flowInstanceRef: { current: null },
})

export function useFlowInstance(): ReactFlowInstance | null {
  return useContext(FlowInstanceContext).flowInstanceRef.current
}

export function useFlowInstanceRef(): RefObject<ReactFlowInstance | null> {
  return useContext(FlowInstanceContext).flowInstanceRef
}
