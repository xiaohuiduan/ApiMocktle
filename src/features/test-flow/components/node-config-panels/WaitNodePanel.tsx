import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, InputNumber, Radio, Typography } from 'antd'

import type { WaitNodeData } from '../../types/flow.types'

import type { PanelProps } from './shared/panelRegistry'
import { useDraft } from './shared/useDraft'

import { translateKey } from '@/i18n/translate'

const { Text } = Typography

// ==================== 等待类型选项 ====================

const WAIT_TYPE_OPTIONS = [
  { value: 'fixed', labelKey: 'flow.enum.waitType.fixed' },
  { value: 'variable', labelKey: 'flow.enum.waitType.variable' },
  { value: 'condition', labelKey: 'flow.enum.waitType.condition' },
]

// ==================== 组件 ====================

export default function WaitNodePanel({ data, onChange }: PanelProps<WaitNodeData>) {
  const { t } = useTranslation()

  // 变量名（受控草稿 + blur 提交）
  const { draft: variableDraft, setDraft: setVariableDraft, commit: commitVariable } = useDraft(
    data.durationVariable ?? '',
    (v) => {
      onChange({ durationVariable: v })
    },
  )

  // 条件表达式（受控草稿 + blur 提交）
  const { draft: conditionDraft, setDraft: setConditionDraft, commit: commitCondition } = useDraft(
    data.conditionExpression ?? '',
    (v) => {
      onChange({ conditionExpression: v })
    },
  )

  // 更新等待类型
  const handleWaitTypeChange = useCallback(
    (e: any) => {
      onChange({ waitType: e.target.value })
    },
    [onChange],
  )

  // 更新固定等待时间
  const handleDurationChange = useCallback(
    (value: number | null) => {
      onChange({ durationMs: value ?? undefined })
    },
    [onChange],
  )

  // 更新轮询间隔
  const handlePollIntervalChange = useCallback(
    (value: number | null) => {
      onChange({ pollIntervalMs: value ?? undefined })
    },
    [onChange],
  )

  // 更新最大等待时间
  const handleMaxWaitChange = useCallback(
    (value: number | null) => {
      onChange({ maxWaitMs: value ?? undefined })
    },
    [onChange],
  )

  return (
    <div className="space-y-4">
      <Text className="block text-xs" type="secondary">
        {t('flow.nodeConfig.wait.title')}
      </Text>

      {/* 等待类型 */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          {t('flow.nodeConfig.wait.type')}
        </Text>
        <Radio.Group
          data-testid="wait-type"
          size="small"
          value={data.waitType}
          onChange={handleWaitTypeChange}
        >
          {WAIT_TYPE_OPTIONS.map((option) => (
            <Radio.Button key={option.value} value={option.value}>
              {translateKey(option.labelKey)}
            </Radio.Button>
          ))}
        </Radio.Group>
      </div>

      {/* 固定等待时间（waitType=fixed 时显示） */}
      {data.waitType === 'fixed' && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            {t('flow.nodeConfig.wait.duration')}
          </Text>
          <InputNumber
            data-testid="wait-duration"
            min={0}
            placeholder={t('flow.nodeConfig.wait.durationPlaceholder')}
            size="small"
            style={{ width: '100%' }}
            value={data.durationMs}
            onChange={handleDurationChange}
          />
        </div>
      )}

      {/* 变量名（waitType=variable 时显示） */}
      {data.waitType === 'variable' && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            {t('flow.nodeConfig.wait.variable')}
          </Text>
          <Input
            data-testid="wait-variable"
            placeholder={t('flow.nodeConfig.wait.variablePlaceholder')}
            size="small"
            value={variableDraft}
            onBlur={commitVariable}
            onChange={(e) => {
              setVariableDraft(e.target.value)
            }}
          />
        </div>
      )}

      {/* 条件等待配置（waitType=condition 时显示） */}
      {data.waitType === 'condition' && (
        <>
          <div>
            <Text className="mb-1 block text-xs" type="secondary">
              {t('flow.nodeConfig.wait.condition')}
            </Text>
            <Input.TextArea
              data-testid="wait-condition"
              placeholder={t('flow.nodeConfig.wait.conditionPlaceholder')}
              rows={2}
              size="small"
              value={conditionDraft}
              onBlur={commitCondition}
              onChange={(e) => {
                setConditionDraft(e.target.value)
              }}
            />
          </div>

          <div>
            <Text className="mb-1 block text-xs" type="secondary">
              {t('flow.nodeConfig.wait.pollInterval')}
            </Text>
            <InputNumber
              data-testid="wait-poll-interval"
              min={100}
              placeholder={t('flow.nodeConfig.wait.pollIntervalPlaceholder')}
              size="small"
              style={{ width: '100%' }}
              value={data.pollIntervalMs}
              onChange={handlePollIntervalChange}
            />
          </div>

          <div>
            <Text className="mb-1 block text-xs" type="secondary">
              {t('flow.nodeConfig.wait.maxWait')}
            </Text>
            <InputNumber
              data-testid="wait-max-wait"
              min={0}
              placeholder={t('flow.nodeConfig.wait.maxWaitPlaceholder')}
              size="small"
              style={{ width: '100%' }}
              value={data.maxWaitMs}
              onChange={handleMaxWaitChange}
            />
          </div>
        </>
      )}
    </div>
  )
}
