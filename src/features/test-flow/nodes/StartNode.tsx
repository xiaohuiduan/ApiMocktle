import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { FlowNodeType, type FlowNode } from '../types/flow.types'
import BaseNode from './BaseNode'

function StartNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  return (
    <BaseNode
      id={id}
      data={data as Record<string, unknown>}
      type={type ?? FlowNodeType.Start}
      outputHandles={['out']}
    />
  )
}

const StartNode = memo(StartNodeInner)
export default StartNode
