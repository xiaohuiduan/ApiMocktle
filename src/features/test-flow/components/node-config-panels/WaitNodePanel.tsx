import { useCallback } from 'react'
import { Radio, InputNumber, Input, Typography } from 'antd'
import type { PanelProps } from './shared/panelRegistry'
import type { WaitNodeData } from '../../types/flow.types'

const { Text } = Typography

// ==================== 等待类型选项 ====================

const WAIT_TYPE_OPTIONS = [
  { value: 'fixed', label: '固定时间' },
  { value: 'variable', label: '变量控制' },
  { value: 'condition', label: '条件等待' },
]

// ==================== 组件 ====================

export default function WaitNodePanel({ data, onChange }: PanelProps<WaitNodeData>) {
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
      onChange({ durationMs: value || undefined })
    },
    [onChange],
  )

  // 更新变量名（onBlur 提交）
  const handleVariableBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      onChange({ durationVariable: e.target.value })
    },
    [onChange],
  )

  // 更新条件表达式（onBlur 提交）
  const handleConditionBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      onChange({ conditionExpression: e.target.value })
    },
    [onChange],
  )

  // 更新轮询间隔
  const handlePollIntervalChange = useCallback(
    (value: number | null) => {
      onChange({ pollIntervalMs: value || undefined })
    },
    [onChange],
  )

  // 更新最大等待时间
  const handleMaxWaitChange = useCallback(
    (value: number | null) => {
      onChange({ maxWaitMs: value || undefined })
    },
    [onChange],
  )

  return (
    <div className="space-y-4">
      <Text type="secondary" className="block text-xs">
        等待配置
      </Text>

      {/* 等待类型 */}
      <div>
        <Text type="secondary" className="block text-xs mb-1">
          等待类型
        </Text>
        <Radio.Group
          value={data.waitType}
          onChange={handleWaitTypeChange}
          size="small"
          data-testid="wait-type"
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
          <Text type="secondary" className="block text-xs mb-1">
            等待时间（毫秒）
          </Text>
          <InputNumber
            value={data.durationMs}
            onChange={handleDurationChange}
            min={0}
            size="small"
            style={{ width: '100%' }}
            placeholder="例如: 1000"
            data-testid="wait-duration"
          />
        </div>
      )}

      {/* 变量名（waitType=variable 时显示） */}
      {data.waitType === 'variable' && (
        <div>
          <Text type="secondary" className="block text-xs mb-1">
            变量名（存放毫秒值）
          </Text>
          <Input
            defaultValue={data.durationVariable || ''}
            onBlur={handleVariableBlur}
            placeholder="例如: waitTime"
            size="small"
            data-testid="wait-variable"
          />
        </div>
      )}

      {/* 条件等待配置（waitType=condition 时显示） */}
      {data.waitType === 'condition' && (
        <>
          <div>
            <Text type="secondary" className="block text-xs mb-1">
              轮询条件（为真时结束等待）
            </Text>
            <Input.TextArea
              defaultValue={data.conditionExpression || ''}
              onBlur={handleConditionBlur}
              placeholder="例如: variables.status === 'ready'"
              rows={2}
              size="small"
              data-testid="wait-condition"
            />
          </div>

          <div>
            <Text type="secondary" className="block text-xs mb-1">
              轮询间隔（毫秒）
            </Text>
            <InputNumber
              value={data.pollIntervalMs}
              onChange={handlePollIntervalChange}
              min={100}
              size="small"
              style={{ width: '100%' }}
              placeholder="例如: 1000"
              data-testid="wait-poll-interval"
            />
          </div>

          <div>
            <Text type="secondary" className="block text-xs mb-1">
              最大等待时间（毫秒）
            </Text>
            <InputNumber
              value={data.maxWaitMs}
              onChange={handleMaxWaitChange}
              min={0}
              size="small"
              style={{ width: '100%' }}
              placeholder="例如: 30000"
              data-testid="wait-max-wait"
            />
          </div>
        </>
      )}
    </div>
  )
}
