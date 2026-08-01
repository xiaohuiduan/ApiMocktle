import { memo } from 'react'

import type { NodeProps } from '@xyflow/react'

import { type FlowNode, FlowNodeType, type HandleSpec } from '../types/flow.types'

import BaseNode from './BaseNode'

const LOOP_TYPE_LABELS: Record<string, string> = {
  count: '固定次数',
  while: '条件循环',
  for_each: '遍历集合',
}

function buildSummary(data: Record<string, unknown>): string {
  const loopType = data.loopType as string

  if (loopType === 'count') {
    const count = data.count ?? '?'

    return `循环 ${count} 次`
  }

  if (loopType === 'while') {
    const expr = data.whileExpression as string

    return expr ? `while: ${expr}` : '条件循环（待配置）'
  }

  if (loopType === 'for_each') {
    const cv = data.collectionVariable as string
    const iv = (data.iteratorVariable as string) || 'item'

    return cv ? `遍历 {{${cv}}}，每轮 {{${iv}}}` : '遍历集合（待配置）'
  }

  return LOOP_TYPE_LABELS[loopType] || '待配置'
}

function LoopNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const outputHandles: HandleSpec[] = [
    { id: 'out', label: '出口' },
    { id: 'loop', label: '循环体', color: '#a855f7' },
  ]

  return (
    <BaseNode
      data={data as Record<string, unknown>}
      id={id}
      inputHandles={['in']}
      outputHandles={outputHandles}
      summary={buildSummary(data as Record<string, unknown>)}
      type={type ?? FlowNodeType.Loop}
    />
  )
}

const LoopNode = memo(LoopNodeInner)

export default LoopNode
