import { Fragment, type ReactNode } from 'react'

import type { ResolvedVar } from '../useResolvedVarMap'

/**
 * 将解析后文本按变量替换位置渲染高亮片段：
 * - 变量片段：琥珀色背景 + 虚线下边框，hover 显示原变量名（{{$xxx}}）
 * - 位置基于文本字符偏移（Rust 返回 start/end），替换即原位替换，直接可用
 */
export function renderVarHighlight(
  text: string,
  vars: ResolvedVar[],
  keyPrefix: string,
): ReactNode {
  if (!vars.length) { return text }

  const sorted = [...vars].sort((a, b) => a.start - b.start)
  const nodes: ReactNode[] = []
  let cursor = 0

  for (const v of sorted) {
    if (v.start < cursor) { continue } // 重叠/嵌套保护（起始在已消费区域内的跳过）

    if (v.start > cursor) { nodes.push(text.slice(cursor, v.start)) }

    const raw = text.slice(v.start, v.end)

    nodes.push(
      <span
        key={`${keyPrefix}-${v.start}`}
        className="var-highlight"
        title={`{{${v.name}}}`}
      >
        {raw}
      </span>,
    )
    cursor = v.end
  }

  if (cursor < text.length) { nodes.push(text.slice(cursor)) }

  return <Fragment>{nodes}</Fragment>
}
