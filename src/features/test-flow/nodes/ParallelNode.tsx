import { memo, useMemo } from 'react'

import type { NodeProps } from '@xyflow/react'

import { type FlowNode, FlowNodeType, type HandleSpec } from '../types/flow.types'

import BaseNode from './BaseNode'

function ParallelNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const branchCount = ((data as Record<string, unknown>).branchCount as number) ?? 2

  const outputHandles = useMemo((): HandleSpec[] => {
    return [
      ...Array.from({ length: branchCount }, (_, i) => ({
        id: `branch-${i}`,
        label: `#${i + 1}`,
      })),
      { id: 'out', label: '续' },
    ]
  }, [branchCount])

  // 分支多时加宽节点，避免输出 handle 与标签挤在一起
  const minWidth = Math.max(180, (branchCount + 2) * 36)
  const summary = `${branchCount} 并行分支`

  return (
    <BaseNode
      data={data as Record<string, unknown>}
      id={id}
      inputHandles={['in']}
      outputHandles={outputHandles}
      summary={summary}
      minWidth={minWidth}
      type={type ?? FlowNodeType.Parallel}
    />
  )
}

const ParallelNode = memo(ParallelNodeInner)

export default ParallelNode
