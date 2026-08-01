import { memo } from 'react'

import type { NodeProps } from '@xyflow/react'

import { type FlowNode, FlowNodeType } from '../types/flow.types'

import BaseNode from './BaseNode'

function SetVariableNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const assignments = (data as Record<string, unknown>).assignments as Record<string, unknown>[] | undefined
  const summary = assignments?.length ? `${assignments.length} var(s)` : undefined

  return (
    <BaseNode
      data={data as Record<string, unknown>}
      id={id}
      inputHandles={['in']}
      outputHandles={['out']}
      summary={summary}
      type={type ?? FlowNodeType.SetVariable}
    />
  )
}

const SetVariableNode = memo(SetVariableNodeInner)

export default SetVariableNode
