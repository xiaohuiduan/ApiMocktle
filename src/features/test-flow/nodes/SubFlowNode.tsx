import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { FlowNodeType, type FlowNode } from '../types/flow.types'
import BaseNode from './BaseNode'

function SubFlowNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const targetTaskId = (data as Record<string, unknown>).targetTaskId as string | undefined
  return (
    <BaseNode
      id={id}
      data={data as Record<string, unknown>}
      type={type ?? FlowNodeType.SubFlow}
      inputHandles={['in']}
      outputHandles={['out']}
      summary={targetTaskId}
    />
  )
}

const SubFlowNode = memo(SubFlowNodeInner)
export default SubFlowNode
