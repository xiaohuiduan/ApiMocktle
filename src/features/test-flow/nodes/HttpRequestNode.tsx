import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { FlowNodeType, type FlowNode } from '../types/flow.types'
import BaseNode from './BaseNode'

function HttpRequestNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const menuItemId = (data as Record<string, unknown>).menuItemId as string | undefined
  return (
    <BaseNode
      id={id}
      data={data as Record<string, unknown>}
      type={type ?? FlowNodeType.HttpRequest}
      inputHandles={['in']}
      outputHandles={['out']}
      summary={menuItemId}
    />
  )
}

const HttpRequestNode = memo(HttpRequestNodeInner)
export default HttpRequestNode
