import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, InputNumber, Radio, Switch, Typography } from 'antd'

import type { LoopNodeData } from '../../types/flow.types'

import type { PanelProps } from './shared/panelRegistry'
import { useDraft } from './shared/useDraft'

import { translateKey } from '@/i18n/translate'

const { Text } = Typography

// ==================== 循环类型选项 ====================

const LOOP_TYPE_OPTIONS = [
  { value: 'count', labelKey: 'flow.enum.loopType.count' },
  { value: 'while', labelKey: 'flow.enum.loopType.while' },
  { value: 'for_each', labelKey: 'flow.enum.loopType.forEach' },
]

// ==================== 组件 ====================

export default function LoopNodePanel({ data, onChange }: PanelProps<LoopNodeData>) {
  const { t } = useTranslation()

  // 循环次数（受控草稿 + blur 提交，支持 {{variable}} 表达式）
  const { draft: countDraft, setDraft: setCountDraft, commit: commitCount } = useDraft(
    data.count !== undefined ? String(data.count) : '',
    (v) => {
      onChange({ count: v })
    },
  )

  // while 表达式（受控草稿 + blur 提交）
  const { draft: whileDraft, setDraft: setWhileDraft, commit: commitWhile } = useDraft(
    data.whileExpression ?? '',
    (v) => {
      onChange({ whileExpression: v })
    },
  )

  // 集合变量名（受控草稿 + blur 提交）
  const { draft: collectionDraft, setDraft: setCollectionDraft, commit: commitCollection } = useDraft(
    data.collectionVariable ?? '',
    (v) => {
      onChange({ collectionVariable: v })
    },
  )

  // 迭代变量名（受控草稿 + blur 提交）
  const { draft: iteratorDraft, setDraft: setIteratorDraft, commit: commitIterator } = useDraft(
    data.iteratorVariable ?? 'item',
    (v) => {
      onChange({ iteratorVariable: v })
    },
  )

  // 更新循环类型
  const handleLoopTypeChange = useCallback(
    (e: any) => {
      onChange({ loopType: e.target.value })
    },
    [onChange],
  )

  // 更新最大迭代次数
  const handleMaxIterationsChange = useCallback(
    (value: number | null) => {
      onChange({ maxIterations: value ?? 100 })
    },
    [onChange],
  )

  // 更新失败中断策略
  const handleBreakOnFailureChange = useCallback(
    (checked: boolean) => {
      onChange({ breakOnFailure: checked })
    },
    [onChange],
  )

  return (
    <div className="space-y-4">
      <Text className="block text-xs" type="secondary">
        {t('flow.nodeConfig.loop.title')}
      </Text>

      {/* 循环类型 */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          {t('flow.nodeConfig.loop.type')}
        </Text>
        <Radio.Group
          data-testid="loop-type"
          size="small"
          value={data.loopType}
          onChange={handleLoopTypeChange}
        >
          {LOOP_TYPE_OPTIONS.map((option) => (
            <Radio.Button key={option.value} value={option.value}>
              {translateKey(option.labelKey)}
            </Radio.Button>
          ))}
        </Radio.Group>
      </div>

      {/* 循环次数（loopType=count 时显示） */}
      {data.loopType === 'count' && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            {t('flow.nodeConfig.loop.count')}
          </Text>
          <Input
            data-testid="loop-count"
            placeholder={t('flow.nodeConfig.loop.countPlaceholder')}
            size="small"
            value={countDraft}
            onBlur={commitCount}
            onChange={(e) => {
              setCountDraft(e.target.value)
            }}
          />
          <Text className="mt-1 block text-xs" type="secondary">
            {t('flow.nodeConfig.loop.countHint', { token: t('flow.shared.variableToken') })}
          </Text>
        </div>
      )}

      {/* while 表达式（loopType=while 时显示） */}
      {data.loopType === 'while' && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            {t('flow.nodeConfig.loop.whileCondition')}
          </Text>
          <Input.TextArea
            data-testid="loop-while-expression"
            placeholder={t('flow.nodeConfig.loop.whilePlaceholder')}
            rows={2}
            size="small"
            value={whileDraft}
            onBlur={commitWhile}
            onChange={(e) => {
              setWhileDraft(e.target.value)
            }}
          />
        </div>
      )}

      {/* 集合变量（loopType=for_each 时显示） */}
      {data.loopType === 'for_each' && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            {t('flow.nodeConfig.loop.collection')}
          </Text>
          <Input
            data-testid="loop-collection-variable"
            placeholder={t('flow.nodeConfig.loop.collectionPlaceholder')}
            size="small"
            value={collectionDraft}
            onBlur={commitCollection}
            onChange={(e) => {
              setCollectionDraft(e.target.value)
            }}
          />
        </div>
      )}

      {/* 迭代变量名（仅 for_each 时显示） */}
      {data.loopType === 'for_each' && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            {t('flow.nodeConfig.loop.iterator')}
          </Text>
          <Input
            data-testid="loop-iterator-variable"
            placeholder={t('flow.nodeConfig.loop.iteratorPlaceholder', { token: '{{item}}' })}
            size="small"
            value={iteratorDraft}
            onBlur={commitIterator}
            onChange={(e) => {
              setIteratorDraft(e.target.value)
            }}
          />
        </div>
      )}

      {/* 最大迭代次数（始终显示） */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          {t('flow.nodeConfig.loop.maxIterations')}
        </Text>
        <InputNumber
          data-testid="loop-max-iterations"
          max={10000}
          min={1}
          size="small"
          style={{ width: '100%' }}
          value={data.maxIterations ?? 100}
          onChange={handleMaxIterationsChange}
        />
      </div>

      {/* 失败策略 */}
      <div className="flex items-center justify-between">
        <Text className="text-xs" type="secondary">
          {t('flow.nodeConfig.loop.breakOnFailure')}
        </Text>
        <Switch
          checked={data.breakOnFailure !== false}
          data-testid="loop-break-on-failure"
          size="small"
          onChange={handleBreakOnFailureChange}
        />
      </div>
    </div>
  )
}
