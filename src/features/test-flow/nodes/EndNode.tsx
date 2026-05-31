import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { FlowNodeType, type FlowNode } from '../types/flow.types'
import BaseNode from './BaseNode'

function EndNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  return (
    <BaseNode
      id={id}
      data={data as Record<string, unknown>}
      type={type ?? FlowNodeType.End}
      inputHandles={['in']}
    />
  )
}

const EndNode = memo(EndNodeInner)
export default EndNode
