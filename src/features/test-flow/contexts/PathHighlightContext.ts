import { createContext, useContext } from 'react'

export interface PathHighlightContextValue {
  upstreamNodeIds: Set<string>
  downstreamNodeIds: Set<string>
  upstreamEdgeIds: Set<string>
  downstreamEdgeIds: Set<string>
  activeNodeId: string | null
  isLocked: boolean
  onNodeHover: (nodeId: string | null) => void
  onNodeClick: (nodeId: string) => void
  onPaneClick: () => void
  breadcrumbs: { id: string, label: string }[] | null
}

export const PathHighlightContext = createContext<PathHighlightContextValue | null>(null)

export function usePathHighlightContext(): PathHighlightContextValue | null {
  return useContext(PathHighlightContext)
}
