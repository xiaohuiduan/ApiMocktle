import { useCallback } from 'react'
import { Input, Switch, Space, Typography } from 'antd'
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
        <Text type="secondary" className="block text-xs mb-1">
          标签
        </Text>
        <Input
          value={labelDraft}
          onChange={(e) => {
            setLabelDraft(e.target.value)
          }}
          onBlur={commitLabel}
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
          value={descDraft}
          onChange={(e) => {
            setDescDraft(e.target.value)
          }}
          onBlur={commitDesc}
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
