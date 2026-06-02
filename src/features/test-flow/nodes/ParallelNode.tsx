import { memo, useMemo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { FlowNodeType, type FlowNode, type HandleSpec } from '../types/flow.types'
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

  const summary = `${branchCount} 并行分支`

  return (
    <BaseNode
      id={id}
      data={data as Record<string, unknown>}
      type={type ?? FlowNodeType.Parallel}
      inputHandles={['in']}
      outputHandles={outputHandles}
      summary={summary}
    />
  )
}

const ParallelNode = memo(ParallelNodeInner)
export default ParallelNode
