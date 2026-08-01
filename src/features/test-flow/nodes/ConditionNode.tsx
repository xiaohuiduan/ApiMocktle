import { memo, useMemo } from 'react'

import type { NodeProps } from '@xyflow/react'

import { type ConditionNodeData, type FlowNode, FlowNodeType, type HandleSpec } from '../types/flow.types'

import BaseNode from './BaseNode'

function truncate(str: string, max: number): string {
  if (!str) { return '' }

  return str.length > max ? str.slice(0, max) + '…' : str
}

const OPERATOR_LABELS: Record<string, string> = {
  equals: '==',
  not_equals: '!=',
  exists: '存在',
  greater_than: '>',
  less_than: '<',
  contains: '包含',
}

/** 根据已配置的条件数据生成易读的 summary */
function buildSummary(data: ConditionNodeData): string {
  const t = data.conditionType

  if (t === 'expression') {
    return data.expression ? truncate(data.expression, 30) : '待配置表达式'
  }

  if (t === 'variable_check') {
    const vn = data.variableName ?? '?'
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- falsy 链语义（空串也回退到 '?'）
    const op = OPERATOR_LABELS[data.operator || ''] || data.operator || '?'

    if (data.operator === 'exists') { return `${vn} 存在` }

    const cv = data.compareValue ?? '?'

    return `${vn} ${op} ${cv}`
  }

  if (t === 'status_code') {
    return data.expression ? `状态码 == ${truncate(data.expression, 20)}` : '待配置状态码'
  }

  return '待配置'
}

function ConditionNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const nodeData = data as unknown as ConditionNodeData
  const conditions = nodeData.conditions
  const defaultLabel = nodeData.defaultLabel ?? '默认'

  const outputHandles = useMemo((): HandleSpec[] => {
    // 多分支模式：显示每个条件的表达式
    if (conditions && conditions.length > 0) {
      const branchHandles: HandleSpec[] = conditions.map((c) => ({
        id: c.id,
        label: c.expression ? truncate(c.expression, 24) : c.label,
      }))
      branchHandles.push({ id: 'default', label: defaultLabel })

      return branchHandles
    }

    // 传统模式：符合/不符合，颜色区分
    return [
      { id: 'true', label: '符合', color: '#22c55e' },
      { id: 'false', label: '不符合', color: '#ef4444' },
    ]
  }, [conditions, defaultLabel])

  const summary = conditions && conditions.length > 0
    ? `${conditions.length + 1} 分支`
    : buildSummary(nodeData)

  return (
    <BaseNode
      data={data as Record<string, unknown>}
      id={id}
      inputHandles={['in']}
      minWidth={220}
      outputHandles={outputHandles}
      summary={summary}
      type={type ?? FlowNodeType.Condition}
    />
  )
}

const ConditionNode = memo(ConditionNodeInner)

export default ConditionNode
