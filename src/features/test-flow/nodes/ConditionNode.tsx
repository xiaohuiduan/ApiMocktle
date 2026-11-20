import { memo, useMemo } from 'react'

import type { NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'

import { translateKey } from '@/i18n/translate'

import { type ConditionNodeData, type FlowNode, FlowNodeType, type HandleSpec } from '../types/flow.types'

import BaseNode from './BaseNode'

function truncate(str: string, max: number): string {
  if (!str) { return '' }

  return str.length > max ? str.slice(0, max) + '…' : str
}

/** 操作符的展示符号。数学/协议符号不翻译，语义词走 i18n。 */
const OPERATOR_SYMBOLS: Record<string, string> = {
  equals: '==',
  not_equals: '!=',
  greater_than: '>',
  less_than: '<',
}

const OPERATOR_LABEL_KEYS: Record<string, string> = {
  exists: 'flow.enum.operator.exists',
  contains: 'flow.enum.operator.contains',
}

/** 根据已配置的条件数据生成易读的 summary */
function buildSummary(
  data: ConditionNodeData,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const conditionType = data.conditionType

  if (conditionType === 'expression') {
    return data.expression
      ? truncate(data.expression, 30)
      : t('flow.node.condition.expressionPending')
  }

  if (conditionType === 'variable_check') {
    const vn = data.variableName ?? '?'

    if (data.operator === 'exists') {
      return t('flow.node.condition.variableExists', { variable: vn })
    }

    const symbol = OPERATOR_SYMBOLS[data.operator ?? '']
    const semanticKey = OPERATOR_LABEL_KEYS[data.operator ?? '']
    // data.operator 为枚举联合（不可能为空串），仅在缺省时回退 '?'
    const fallbackOp = data.operator ?? '?'
    const op = symbol ?? (semanticKey ? translateKey(semanticKey) : fallbackOp)

    const cv = data.compareValue ?? '?'

    return `${vn} ${op} ${cv}`
  }

  if (conditionType === 'status_code') {
    return data.expression
      ? t('flow.node.condition.statusCode', { code: truncate(data.expression, 20) })
      : t('flow.node.condition.statusCodePending')
  }

  return t('flow.node.pending')
}

function ConditionNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const { t } = useTranslation()
  const nodeData = data as unknown as ConditionNodeData
  const conditions = nodeData.conditions
  const defaultLabel = nodeData.defaultLabel ?? t('flow.canvas.defaultBranch')

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
      { id: 'true', label: t('flow.canvas.handleTrue'), color: '#22c55e' },
      { id: 'false', label: t('flow.canvas.handleFalse'), color: '#ef4444' },
    ]
  }, [conditions, defaultLabel, t])

  const summary = conditions && conditions.length > 0
    ? t('flow.node.condition.branchCount', { count: conditions.length + 1 })
    : buildSummary(nodeData, t as unknown as (key: string, options?: Record<string, unknown>) => string)

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
