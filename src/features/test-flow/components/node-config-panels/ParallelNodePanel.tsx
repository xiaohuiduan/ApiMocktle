import { useCallback } from 'react'
import { InputNumber, Radio, Typography } from 'antd'
import type { PanelProps } from './shared/panelRegistry'
import type { ParallelNodeData } from '../../types/flow.types'

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
      onChange({ timeoutMs: value || undefined })
    },
    [onChange],
  )

  return (
    <div className="space-y-4">
      <Text type="secondary" className="block text-xs">
        并行配置
      </Text>

      {/* 分支数量 */}
      <div>
        <Text type="secondary" className="block text-xs mb-1">
          并行分支数 (2-6)
        </Text>
        <InputNumber
          value={data.branchCount}
          onChange={handleBranchCountChange}
          min={2}
          max={6}
          size="small"
          style={{ width: '100%' }}
          data-testid="parallel-branch-count"
        />
      </div>

      {/* 等待模式 */}
      <div>
        <Text type="secondary" className="block text-xs mb-1">
          等待模式
        </Text>
        <Radio.Group
          value={data.waitAll}
          onChange={handleWaitAllChange}
          size="small"
          data-testid="parallel-wait-mode"
        >
          <Radio.Button value={true}>等待所有完成</Radio.Button>
          <Radio.Button value={false}>等待第一个完成</Radio.Button>
        </Radio.Group>
      </div>

      {/* 超时时间（可选） */}
      <div>
        <Text type="secondary" className="block text-xs mb-1">
          整体超时时间（毫秒，可选）
        </Text>
        <InputNumber
          value={data.timeoutMs}
          onChange={handleTimeoutChange}
          min={0}
          size="small"
          style={{ width: '100%' }}
          placeholder="不设置超时"
          data-testid="parallel-timeout"
        />
      </div>
    </div>
  )
}
