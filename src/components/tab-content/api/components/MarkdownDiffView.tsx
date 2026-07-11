import { useEffect, useMemo, useRef } from 'react'

import { Empty } from 'antd'

interface MarkdownDiffViewProps {
  leftText: string
  rightText: string
  leftTitle?: string
  rightTitle?: string
}

interface DiffRow {
  left?: string
  right?: string
  type: 'same' | 'removed' | 'added'
}

/** 基于 LCS 的行级 diff，输出左右对齐的行 */
function lineDiff(left: string, right: string): DiffRow[] {
  const a = left.split('\n')
  const b = right.split('\n')
  const n = a.length
  const m = b.length
  // LCS 长度表
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ left: a[i], right: b[j], type: 'same' })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ left: a[i], right: undefined, type: 'removed' })
      i++
    } else {
      rows.push({ left: undefined, right: b[j], type: 'added' })
      j++
    }
  }
  while (i < n) rows.push({ left: a[i++], right: undefined, type: 'removed' })
  while (j < m) rows.push({ left: undefined, right: b[j++], type: 'added' })
  return rows
}

/** 并排 diff 视图（左旧 / 右新），差异行高亮 */
export function MarkdownDiffView({ leftText, rightText, leftTitle, rightTitle }: MarkdownDiffViewProps) {
  const rows = useMemo(() => lineDiff(leftText ?? '', rightText ?? ''), [leftText, rightText])
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  // 同步滚动
  useEffect(() => {
    const l = leftRef.current
    const r = rightRef.current
    if (!l || !r) return
    const onScroll = (src: HTMLDivElement, dst: HTMLDivElement) => () => {
      dst.scrollTop = src.scrollTop
    }
    const ls = onScroll(l, r)
    const rs = onScroll(r, l)
    l.addEventListener('scroll', ls)
    r.addEventListener('scroll', rs)
    return () => {
      l.removeEventListener('scroll', ls)
      r.removeEventListener('scroll', rs)
    }
  }, [])

  if (!leftText && !rightText) {
    return <Empty description="无可对比内容" />
  }

  const renderCol = (ref: React.RefObject<HTMLDivElement>, side: 'left' | 'right') => (
    <div ref={ref} className="flex-1 overflow-auto font-mono text-xs leading-5" style={{ maxHeight: '60vh' }}>
      {rows.map((row, idx) => {
        const text = side === 'left' ? row.left : row.right
        if (text === undefined) {
          return <div key={idx} style={{ height: 20, backgroundColor: '#fafafa' }} />
        }
        const bg = row.type === 'same'
          ? 'transparent'
          : row.type === 'removed'
            ? 'rgba(255, 0, 0, 0.08)'
            : 'rgba(0, 180, 0, 0.08)'
        const color = row.type === 'removed' ? '#c0392b' : row.type === 'added' ? '#1e8449' : undefined
        return (
          <div key={idx} style={{ backgroundColor: bg, color, padding: '0 8px', whiteSpace: 'pre', borderBottom: '1px solid #f0f0f0' }}>
            {text || ' '}
          </div>
        )
      })}
    </div>
  )

  return (
    <div>
      <div className="mb-2 flex gap-2 text-xs text-secondary">
        <span className="flex-1 font-medium">{leftTitle ?? '原始'}</span>
        <span className="flex-1 font-medium">{rightTitle ?? '对比'}</span>
      </div>
      <div className="flex gap-2">
        {renderCol(leftRef, 'left')}
        {renderCol(rightRef, 'right')}
      </div>
    </div>
  )
}
