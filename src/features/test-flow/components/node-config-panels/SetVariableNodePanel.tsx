import { useCallback } from 'react'
import { Typography } from 'antd'
import type { PanelProps } from './shared/panelRegistry'
import type { SetVariableNodeData } from '../../types/flow.types'
import AssignmentListEditor from './shared/AssignmentListEditor'

const { Text } = Typography

// ==================== 组件 ====================

export default function SetVariableNodePanel({ data, onChange }: PanelProps<SetVariableNodeData>) {
  // 更新赋值列表
  const handleAssignmentsChange = useCallback(
    (assignments: SetVariableNodeData['assignments']) => {
      onChange({ assignments })
    },
    [onChange],
  )

  return (
    <div className="space-y-4">
      <Text type="secondary" className="block text-xs">
        变量赋值配置
      </Text>

      {/* 赋值列表编辑器 */}
      <AssignmentListEditor
        assignments={data.assignments || []}
        onChange={handleAssignmentsChange}
      />
    </div>
  )
}
