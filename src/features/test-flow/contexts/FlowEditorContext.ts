import { createContext, useContext } from 'react'

interface FlowEditorContextValue {
  projectId: string
  taskId: string
}

const FlowEditorContext = createContext<FlowEditorContextValue | null>(null)

export function useFlowEditorContext() {
  const ctx = useContext(FlowEditorContext)

  if (!ctx) {
    throw new Error('useFlowEditorContext must be used inside FlowEditorContext.Provider')
  }

  return ctx
}

export { FlowEditorContext }
export type { FlowEditorContextValue }
