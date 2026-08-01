import { memo } from 'react'

import type { NodeProps } from '@xyflow/react'

import { type FlowNode, FlowNodeType } from '../types/flow.types'

import BaseNode from './BaseNode'

function WaitNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const waitType = (data as Record<string, unknown>).waitType as string | undefined

  return (
    <BaseNode
      data={data as Record<string, unknown>}
      id={id}
      inputHandles={['in']}
      outputHandles={['out']}
      summary={waitType}
      type={type ?? FlowNodeType.Wait}
    />
  )
}

const WaitNode = memo(WaitNodeInner)

export default WaitNode
