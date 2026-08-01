import { useCallback } from 'react'

import { InputNumber, Radio, Typography } from 'antd'

import type { ParallelNodeData } from '../../types/flow.types'

import type { PanelProps } from './shared/panelRegistry'

const { Text } = Typography

// ==================== 组件 ====================

export default function ParallelNodePanel({ data, onChange }: PanelProps<ParallelNodeData>) {
  // 更新分支数量
  const handleBranchCountChange = useCallback(
    (value: number | null) => {
      if (value !== null) {
        onChange({ branchCount: value })
      }
    },
    [onChange],
  )

  // 更新等待模式
  const handleWaitAllChange = useCallback(
    (e: any) => {
      onChange({ waitAll: e.target.value })
    },
    [onChange],
  )

  // 更新超时时间
  const handleTimeoutChange = useCallback(
    (value: number | null) => {
      onChange({ timeoutMs: value ?? undefined })
    },
    [onChange],
  )

  return (
    <div className="space-y-4">
      <Text className="block text-xs" type="secondary">
        并行配置
      </Text>

      {/* 分支数量 */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          并行分支数 (2-6)
        </Text>
        <InputNumber
          data-testid="parallel-branch-count"
          max={6}
          min={2}
          size="small"
          style={{ width: '100%' }}
          value={data.branchCount}
          onChange={handleBranchCountChange}
        />
      </div>

      {/* 等待模式 */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          等待模式
        </Text>
        <Radio.Group
          data-testid="parallel-wait-mode"
          size="small"
          value={data.waitAll}
          onChange={handleWaitAllChange}
        >
          <Radio.Button value={true}>等待所有完成</Radio.Button>
          <Radio.Button value={false}>等待第一个完成</Radio.Button>
        </Radio.Group>
      </div>

      {/* 超时时间（可选） */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          整体超时时间（毫秒，可选）
        </Text>
        <InputNumber
          data-testid="parallel-timeout"
          min={0}
          placeholder="不设置超时"
          size="small"
          style={{ width: '100%' }}
          value={data.timeoutMs}
          onChange={handleTimeoutChange}
        />
      </div>
    </div>
  )
}
