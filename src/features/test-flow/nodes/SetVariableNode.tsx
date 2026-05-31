import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { FlowNodeType, type FlowNode } from '../types/flow.types'
import BaseNode from './BaseNode'

function SetVariableNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const assignments = (data as Record<string, unknown>).assignments as Array<Record<string, unknown>> | undefined
  const summary = assignments?.length ? `${assignments.length} var(s)` : undefined
  return (
    <BaseNode
      id={id}
      data={data as Record<string, unknown>}
      type={type ?? FlowNodeType.SetVariable}
      inputHandles={['in']}
      outputHandles={['out']}
      summary={summary}
    />
  )
}

const SetVariableNode = memo(SetVariableNodeInner)
export default SetVariableNode
