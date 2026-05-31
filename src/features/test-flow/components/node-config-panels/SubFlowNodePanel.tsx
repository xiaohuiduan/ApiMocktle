import { useCallback } from 'react'
import { Select, Switch, Space, Typography, Spin } from 'antd'
import type { PanelProps } from './shared/panelRegistry'
import type { SubFlowNodeData } from '../../types/flow.types'
import { useTestTasks } from '@/hooks/useTestTasks'

const { Text } = Typography

// ==================== 组件 ====================

export default function SubFlowNodePanel({ data, onChange, projectId }: PanelProps<SubFlowNodeData>) {
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
      value: task.id!,
      label: task.name || `任务 ${task.id}`,
    }))

  return (
    <div className="space-y-4">
      <Text type="secondary" className="block text-xs">
        子流程配置
      </Text>

      {/* 目标任务选择 */}
      <div>
        <Text type="secondary" className="block text-xs mb-1">
          选择目标测试任务
        </Text>
        <Select
          value={data.targetTaskId || undefined}
          onChange={handleTargetTaskChange}
          options={taskOptions}
          size="small"
          style={{ width: '100%' }}
          showSearch
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
          placeholder={loadingTasks ? '加载中...' : '选择测试任务'}
          loading={loadingTasks}
          notFoundContent={loadingTasks ? <Spin size="small" /> : '暂无数据'}
          data-testid="subflow-target-task"
        />
      </div>

      {/* 传递变量开关 */}
      <div>
        <Space>
          <Text type="secondary" className="text-xs">
            传递当前变量到子流程
          </Text>
          <Switch
            checked={data.passVariables ?? false}
            onChange={handlePassVariablesChange}
            size="small"
            data-testid="subflow-pass-variables"
          />
        </Space>
      </div>

      {/* 合并变量开关 */}
      <div>
        <Space>
          <Text type="secondary" className="text-xs">
            合并子流程结果变量
          </Text>
          <Switch
            checked={data.mergeVariables ?? false}
            onChange={handleMergeVariablesChange}
            size="small"
            data-testid="subflow-merge-variables"
          />
        </Space>
      </div>
    </div>
  )
}
