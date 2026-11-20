import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { NodeProps } from '@xyflow/react'

import { type FlowNode, FlowNodeType, type HandleSpec } from '../types/flow.types'

import BaseNode from './BaseNode'

function ParallelNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const { t } = useTranslation()
  const branchCount = ((data as Record<string, unknown>).branchCount as number) ?? 2

  const outputHandles = useMemo((): HandleSpec[] => {
    return [
      ...Array.from({ length: branchCount }, (_, i) => ({
        id: `branch-${i}`,
        label: `#${i + 1}`,
      })),
      { id: 'out', label: t('flow.node.parallel.mergeOut'), color: 'var(--ds-success-color)' },
    ]
  }, [branchCount, t])

  // 分支多时加宽节点，避免输出 handle 与标签挤在一起
  const minWidth = Math.max(180, (branchCount + 2) * 36)
  const summary = t('flow.node.parallel.branchCount', { count: branchCount })

  return (
    <BaseNode
      data={data as Record<string, unknown>}
      id={id}
      inputHandles={['in']}
      minWidth={minWidth}
      outputHandles={outputHandles}
      summary={summary}
      type={type ?? FlowNodeType.Parallel}
    />
  )
}

const ParallelNode = memo(ParallelNodeInner)

export default ParallelNode
