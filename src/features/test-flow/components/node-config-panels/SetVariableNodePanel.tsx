import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { Typography } from 'antd'

import type { SetVariableNodeData } from '../../types/flow.types'

import AssignmentListEditor from './shared/AssignmentListEditor'
import type { PanelProps } from './shared/panelRegistry'

const { Text } = Typography

// ==================== 组件 ====================

export default function SetVariableNodePanel({ data, onChange }: PanelProps<SetVariableNodeData>) {
  const { t } = useTranslation()

  // 更新赋值列表
  const handleAssignmentsChange = useCallback(
    (assignments: SetVariableNodeData['assignments']) => {
      onChange({ assignments })
    },
    [onChange],
  )

  return (
    <div className="space-y-4">
      <Text className="block text-xs" type="secondary">
        {t('flow.nodeConfig.setVariable.title')}
      </Text>

      {/* 赋值列表编辑器 */}
      <AssignmentListEditor
        assignments={data.assignments || []}
        onChange={handleAssignmentsChange}
      />
    </div>
  )
}
