import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { FlowNodeType, type FlowNode } from '../types/flow.types'
import BaseNode from './BaseNode'

function AssertNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const assertions = (data as Record<string, unknown>).assertions as Array<Record<string, unknown>> | undefined
  const summary = assertions?.length ? `${assertions.length} check(s)` : undefined
  return (
    <BaseNode
      id={id}
      data={data as Record<string, unknown>}
      type={type ?? FlowNodeType.Assert}
      inputHandles={['in']}
      outputHandles={['out']}
      summary={summary}
    />
  )
}

const AssertNode = memo(AssertNodeInner)
export default AssertNode
