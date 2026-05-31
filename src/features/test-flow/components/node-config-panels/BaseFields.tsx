import { useCallback } from 'react'
import { Input, Switch, Space, Typography } from 'antd'
import type { FlowNodeData } from '../../types/flow.types'

const { Text } = Typography

// ==================== 组件 Props ====================

interface BaseFieldsProps {
  data: FlowNodeData
  onChange: (partial: Partial<FlowNodeData>) => void
}

// ==================== 组件 ====================

export default function BaseFields({ data, onChange }: BaseFieldsProps) {
  // 更新标签（onBlur 提交）
  const handleLabelBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      onChange({ label: e.target.value })
    },
    [onChange],
  )

  // 更新描述（onBlur 提交）
  const handleDescriptionBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      onChange({ description: e.target.value })
    },
    [onChange],
  )

  // 切换启用状态（直接提交）
  const handleEnabledChange = useCallback(
    (checked: boolean) => {
      onChange({ enabled: checked })
    },
    [onChange],
  )

  return (
    <div className="space-y-4">
      {/* 标签编辑 */}
      <div>
        <Text type="secondary" className="block text-xs mb-1">
          标签
        </Text>
        <Input
          defaultValue={data.label || ''}
          onBlur={handleLabelBlur}
          placeholder="节点标签"
          data-testid="node-label-input"
        />
      </div>

      {/* 描述编辑 */}
      <div>
        <Text type="secondary" className="block text-xs mb-1">
          描述（可选）
        </Text>
        <Input.TextArea
          defaultValue={data.description || ''}
          onBlur={handleDescriptionBlur}
          placeholder="节点描述"
          rows={2}
          data-testid="node-description-input"
        />
      </div>

      {/* 启用/禁用开关 */}
      <div>
        <Space>
          <Text type="secondary" className="text-xs">
            启用状态
          </Text>
          <Switch
            checked={data.enabled ?? true}
            onChange={handleEnabledChange}
            data-testid="node-enabled-switch"
          />
        </Space>
      </div>
    </div>
  )
}
