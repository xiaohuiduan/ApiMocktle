import { memo } from 'react'

import type { NodeProps } from '@xyflow/react'

import { type FlowNode, FlowNodeType } from '../types/flow.types'

import BaseNode from './BaseNode'

function SubFlowNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const targetTaskId = (data as Record<string, unknown>).targetTaskId as string | undefined

  return (
    <BaseNode
      data={data as Record<string, unknown>}
      id={id}
      inputHandles={['in']}
      outputHandles={['out']}
      summary={targetTaskId}
      type={type ?? FlowNodeType.SubFlow}
    />
  )
}

const SubFlowNode = memo(SubFlowNodeInner)

export default SubFlowNode
