import { useCallback } from 'react'

import { Input, InputNumber, Radio, Typography } from 'antd'

import type { WaitNodeData } from '../../types/flow.types'

import type { PanelProps } from './shared/panelRegistry'
import { useDraft } from './shared/useDraft'

const { Text } = Typography

// ==================== 等待类型选项 ====================

const WAIT_TYPE_OPTIONS = [
  { value: 'fixed', label: '固定时间' },
  { value: 'variable', label: '变量控制' },
  { value: 'condition', label: '条件等待' },
]

// ==================== 组件 ====================

export default function WaitNodePanel({ data, onChange }: PanelProps<WaitNodeData>) {
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
        等待配置
      </Text>

      {/* 等待类型 */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          等待类型
        </Text>
        <Radio.Group
          data-testid="wait-type"
          size="small"
          value={data.waitType}
          onChange={handleWaitTypeChange}
        >
          {WAIT_TYPE_OPTIONS.map((option) => (
            <Radio.Button key={option.value} value={option.value}>
              {option.label}
            </Radio.Button>
          ))}
        </Radio.Group>
      </div>

      {/* 固定等待时间（waitType=fixed 时显示） */}
      {data.waitType === 'fixed' && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            等待时间（毫秒）
          </Text>
          <InputNumber
            data-testid="wait-duration"
            min={0}
            placeholder="例如: 1000"
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
            变量名（存放毫秒值）
          </Text>
          <Input
            data-testid="wait-variable"
            placeholder="例如: waitTime"
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
              轮询条件（为真时结束等待）
            </Text>
            <Input.TextArea
              data-testid="wait-condition"
              placeholder="例如: variables.status === 'ready'"
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
              轮询间隔（毫秒）
            </Text>
            <InputNumber
              data-testid="wait-poll-interval"
              min={100}
              placeholder="例如: 1000"
              size="small"
              style={{ width: '100%' }}
              value={data.pollIntervalMs}
              onChange={handlePollIntervalChange}
            />
          </div>

          <div>
            <Text className="mb-1 block text-xs" type="secondary">
              最大等待时间（毫秒）
            </Text>
            <InputNumber
              data-testid="wait-max-wait"
              min={0}
              placeholder="例如: 30000"
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
