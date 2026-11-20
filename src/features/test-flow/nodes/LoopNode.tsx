import { memo } from 'react'

import type { NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'

import { translateKey } from '@/i18n/translate'

import { type FlowNode, FlowNodeType, type HandleSpec } from '../types/flow.types'

import BaseNode from './BaseNode'

const LOOP_TYPE_LABEL_KEYS: Record<string, string> = {
  count: 'flow.enum.loopType.count',
  while: 'flow.enum.loopType.while',
  for_each: 'flow.enum.loopType.forEach',
}

type Translate = (key: string, options?: Record<string, unknown>) => string

function buildSummary(data: Record<string, unknown>, t: Translate): string {
  const loopType = data.loopType as string

  if (loopType === 'count') {
    const count = data.count ?? '?'
    const countLabel = t('flow.node.loop.count', { count })

    // 注意：中文模板已含「次」，英文模板已含 "time(s)"，此处不再拼接语义词
    return countLabel
  }

  if (loopType === 'while') {
    const expr = data.whileExpression as string

    return expr
      ? t('flow.node.loop.whileExpression', { expression: expr })
      : t('flow.node.loop.whilePending')
  }

  if (loopType === 'for_each') {
    const cv = data.collectionVariable as string
    const iv = (data.iteratorVariable as string) || 'item'

    return cv
      ? t('flow.node.loop.forEach', { collection: `{{${cv}}}`, iterator: `{{${iv}}}` })
      : t('flow.node.loop.forEachPending')
  }

  const labelKey = LOOP_TYPE_LABEL_KEYS[loopType]

  return labelKey ? translateKey(labelKey) : t('flow.node.pending')
}

function LoopNodeInner({ id, data, type }: NodeProps<FlowNode>) {
  const { t } = useTranslation()

  const outputHandles: HandleSpec[] = [
    { id: 'out', label: t('flow.canvas.handleOut') },
    { id: 'loop', label: t('flow.canvas.handleLoop'), color: '#a855f7' },
  ]

  return (
    <BaseNode
      data={data as Record<string, unknown>}
      id={id}
      inputHandles={['in']}
      outputHandles={outputHandles}
      summary={buildSummary(data as Record<string, unknown>, t as unknown as Translate)}
      type={type ?? FlowNodeType.Loop}
    />
  )
}

const LoopNode = memo(LoopNodeInner)

export default LoopNode
