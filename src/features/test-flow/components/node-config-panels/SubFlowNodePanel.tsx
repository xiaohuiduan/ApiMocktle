import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { Select, Space, Spin, Switch, Typography } from 'antd'

import { useTestTasks } from '@/hooks/useTestTasks'

import type { SubFlowNodeData } from '../../types/flow.types'

import type { PanelProps } from './shared/panelRegistry'

const { Text } = Typography

// ==================== 组件 ====================

export default function SubFlowNodePanel({ data, onChange, projectId }: PanelProps<SubFlowNodeData>) {
  const { t } = useTranslation()

  // 获取测试任务列表
  const { tasks, loading: loadingTasks } = useTestTasks(projectId)

  // 更新 targetTaskId
  const handleTargetTaskChange = useCallback(
    (value: string) => {
      onChange({ targetTaskId: value })
    },
    [onChange],
  )

  // 更新 passVariables
  const handlePassVariablesChange = useCallback(
    (checked: boolean) => {
      onChange({ passVariables: checked })
    },
    [onChange],
  )

  // 更新 mergeVariables
  const handleMergeVariablesChange = useCallback(
    (checked: boolean) => {
      onChange({ mergeVariables: checked })
    },
    [onChange],
  )

  // 准备 Select 选项
  const taskOptions = tasks
    .filter((task) => task.id !== undefined)
    .map((task) => ({
      value: task.id,
      label: task.name || t('flow.nodeConfig.subFlow.taskFallback', { id: task.id }),
    }))

  return (
    <div className="space-y-4">
      <Text className="block text-xs" type="secondary">
        {t('flow.nodeConfig.subFlow.title')}
      </Text>

      {/* 目标任务选择 */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          {t('flow.nodeConfig.subFlow.target')}
        </Text>
        <Select
          showSearch
          data-testid="subflow-target-task"
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          loading={loadingTasks}
          notFoundContent={loadingTasks ? <Spin size="small" /> : t('flow.shared.noData')}
          options={taskOptions}
          placeholder={loadingTasks ? t('flow.shared.loading') : t('flow.nodeConfig.subFlow.placeholder')}
          size="small"
          style={{ width: '100%' }}
          value={data.targetTaskId || undefined}
          onChange={handleTargetTaskChange}
        />
      </div>

      {/* 传递变量开关 */}
      <div>
        <Space>
          <Text className="text-xs" type="secondary">
            {t('flow.nodeConfig.subFlow.passVariables')}
          </Text>
          <Switch
            checked={data.passVariables ?? false}
            data-testid="subflow-pass-variables"
            size="small"
            onChange={handlePassVariablesChange}
          />
        </Space>
      </div>

      {/* 合并变量开关 */}
      <div>
        <Space>
          <Text className="text-xs" type="secondary">
            {t('flow.nodeConfig.subFlow.mergeVariables')}
          </Text>
          <Switch
            checked={data.mergeVariables ?? false}
            data-testid="subflow-merge-variables"
            size="small"
            onChange={handleMergeVariablesChange}
          />
        </Space>
      </div>
    </div>
  )
}
