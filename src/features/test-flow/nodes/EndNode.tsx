import { memo } from 'react'

import type { NodeProps } from '@xyflow/react'

import { type FlowNode, FlowNodeType } from '../types/flow.types'

import BaseNode from './BaseNode'

function EndNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  return (
    <BaseNode
      data={data as Record<string, unknown>}
      id={id}
      inputHandles={['in']}
      type={type ?? FlowNodeType.End}
    />
  )
}

const EndNode = memo(EndNodeInner)

export default EndNode
