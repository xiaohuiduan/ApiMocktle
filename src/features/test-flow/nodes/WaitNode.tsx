import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { FlowNodeType, type FlowNode } from '../types/flow.types'
import BaseNode from './BaseNode'

function WaitNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const waitType = (data as Record<string, unknown>).waitType as string | undefined
  return (
    <BaseNode
      id={id}
      data={data as Record<string, unknown>}
      type={type ?? FlowNodeType.Wait}
      inputHandles={['in']}
      outputHandles={['out']}
      summary={waitType}
    />
  )
}

const WaitNode = memo(WaitNodeInner)
export default WaitNode
