import { memo } from 'react'

import type { NodeProps } from '@xyflow/react'

import { type FlowNode, FlowNodeType } from '../types/flow.types'

import BaseNode from './BaseNode'

function AssertNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const assertions = (data as Record<string, unknown>).assertions as Record<string, unknown>[] | undefined
  const summary = assertions?.length ? `${assertions.length} check(s)` : undefined

  return (
    <BaseNode
      data={data as Record<string, unknown>}
      id={id}
      inputHandles={['in']}
      outputHandles={['out']}
      summary={summary}
      type={type ?? FlowNodeType.Assert}
    />
  )
}

const AssertNode = memo(AssertNodeInner)

export default AssertNode
