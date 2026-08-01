import { memo } from 'react'

import type { NodeProps } from '@xyflow/react'

import { type FlowNode, FlowNodeType } from '../types/flow.types'

import BaseNode from './BaseNode'

function HttpRequestNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const menuItemId = (data as Record<string, unknown>).menuItemId as string | undefined

  return (
    <BaseNode
      data={data as Record<string, unknown>}
      id={id}
      inputHandles={['in']}
      outputHandles={['out']}
      summary={menuItemId}
      type={type ?? FlowNodeType.HttpRequest}
    />
  )
}

const HttpRequestNode = memo(HttpRequestNodeInner)

export default HttpRequestNode
