import { useCallback } from 'react'

import { Input, Space, Switch, Typography } from 'antd'

import type { FlowNodeData } from '../../types/flow.types'

import { useDraft } from './shared/useDraft'

const { Text } = Typography

// ==================== 组件 Props ====================

interface BaseFieldsProps {
  data: FlowNodeData
  onChange: (partial: Partial<FlowNodeData>) => void
}

// ==================== 组件 ====================

export default function BaseFields({ data, onChange }: BaseFieldsProps) {
  // 标签（受控草稿 + blur 提交）
  const { draft: labelDraft, setDraft: setLabelDraft, commit: commitLabel } = useDraft(
    data.label,
    (v) => {
      onChange({ label: v })
    },
  )

  // 描述（受控草稿 + blur 提交）
  const { draft: descDraft, setDraft: setDescDraft, commit: commitDesc } = useDraft(
    data.description ?? '',
    (v) => {
      onChange({ description: v })
    },
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
        <Text className="mb-1 block text-xs" type="secondary">
          标签
        </Text>
        <Input
          data-testid="node-label-input"
          placeholder="节点标签"
          value={labelDraft}
          onBlur={commitLabel}
          onChange={(e) => {
            setLabelDraft(e.target.value)
          }}
        />
      </div>

      {/* 描述编辑 */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          描述（可选）
        </Text>
        <Input.TextArea
          data-testid="node-description-input"
          placeholder="节点描述"
          rows={2}
          value={descDraft}
          onBlur={commitDesc}
          onChange={(e) => {
            setDescDraft(e.target.value)
          }}
        />
      </div>

      {/* 启用/禁用开关 */}
      <div>
        <Space>
          <Text className="text-xs" type="secondary">
            启用状态
          </Text>
          <Switch
            checked={data.enabled ?? true}
            data-testid="node-enabled-switch"
            onChange={handleEnabledChange}
          />
        </Space>
      </div>
    </div>
  )
}
