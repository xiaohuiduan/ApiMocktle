import { FlowNodeType } from '../types/flow.types'

/**
 * 节点类型语义色（全站统一单源）
 *
 * 画布节点（BaseNode）、节点面板（NodePalette）、类型头（TypeHeader）、
 * 画布 handle 标签（FlowCanvas）共用此表，避免同套色值散落多处。
 *
 * 注意：类型色是"语义色"（每种节点一个标识色），刻意不随设计风格变化；
 * 状态色（通过/失败/跳过等）则走 --ds-* 变量随主题，见 BaseNode 的 STATUS_COLORS。
 */
export const NODE_TYPE_COLORS: Record<FlowNodeType, string> = {
  [FlowNodeType.Start]: '#6b7280',
  [FlowNodeType.End]: '#6b7280',
  [FlowNodeType.HttpRequest]: '#3b82f6',
  [FlowNodeType.Condition]: '#f97316',
  [FlowNodeType.Loop]: '#a855f7',
  [FlowNodeType.Parallel]: '#14b8a6',
  [FlowNodeType.Wait]: '#eab308',
  [FlowNodeType.SubFlow]: '#6366f1',
  [FlowNodeType.SetVariable]: '#22c55e',
  [FlowNodeType.Assert]: '#ef4444',
}
