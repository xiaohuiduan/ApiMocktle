import { memo } from 'react'

import type { NodeProps } from '@xyflow/react'

import { type FlowNode, FlowNodeType } from '../types/flow.types'

import BaseNode from './BaseNode'

function StartNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  return (
    <BaseNode
      data={data as Record<string, unknown>}
      id={id}
      outputHandles={['out']}
      type={type ?? FlowNodeType.Start}
    />
  )
}

const StartNode = memo(StartNodeInner)

export default StartNode
