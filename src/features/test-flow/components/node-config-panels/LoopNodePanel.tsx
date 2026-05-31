import { useCallback } from 'react'
import { Radio, InputNumber, Input, Typography } from 'antd'
import type { PanelProps } from './shared/panelRegistry'
import type { LoopNodeData } from '../../types/flow.types'

const { Text } = Typography

// ==================== 循环类型选项 ====================

const LOOP_TYPE_OPTIONS = [
  { value: 'count', label: '固定次数' },
  { value: 'while', label: '条件循环' },
  { value: 'for_each', label: '遍历集合' },
]

// ==================== 组件 ====================

export default function LoopNodePanel({ data, onChange }: PanelProps<LoopNodeData>) {
  // 更新循环类型
  const handleLoopTypeChange = useCallback(
    (e: any) => {
      onChange({ loopType: e.target.value })
    },
    [onChange],
  )

  // 更新循环次数（onBlur 提交，支持 {{variable}} 表达式）
  const handleCountBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      onChange({ count: e.target.value })
    },
    [onChange],
  )

  // 更新 while 表达式（onBlur 提交）
  const handleWhileExpressionBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      onChange({ whileExpression: e.target.value })
    },
    [onChange],
  )

  // 更新集合变量名（onBlur 提交）
  const handleCollectionVariableBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      onChange({ collectionVariable: e.target.value })
    },
    [onChange],
  )

  // 更新迭代变量名（onBlur 提交）
  const handleIteratorVariableBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      onChange({ iteratorVariable: e.target.value })
    },
    [onChange],
  )

  // 更新最大迭代次数
  const handleMaxIterationsChange = useCallback(
    (value: number | null) => {
      onChange({ maxIterations: value || 100 })
    },
    [onChange],
  )

  return (
    <div className="space-y-4">
      <Text type="secondary" className="block text-xs">
        循环配置
      </Text>

      {/* 循环类型 */}
      <div>
        <Text type="secondary" className="block text-xs mb-1">
          循环类型
        </Text>
        <Radio.Group
          value={data.loopType}
          onChange={handleLoopTypeChange}
          size="small"
          data-testid="loop-type"
        >
          {LOOP_TYPE_OPTIONS.map((option) => (
            <Radio.Button key={option.value} value={option.value}>
              {option.label}
            </Radio.Button>
          ))}
        </Radio.Group>
      </div>

      {/* 循环次数（loopType=count 时显示） */}
      {data.loopType === 'count' && (
        <div>
          <Text type="secondary" className="block text-xs mb-1">
            循环次数
          </Text>
          <Input
            defaultValue={data.count !== undefined ? String(data.count) : ''}
            onBlur={handleCountBlur}
            placeholder="例如: 5 或 {{maxRetries}}"
            size="small"
            data-testid="loop-count"
          />
          <Text type="secondary" className="block text-xs mt-1">
            支持固定数字或 {'{{变量}}'} 表达式
          </Text>
        </div>
      )}

      {/* while 表达式（loopType=while 时显示） */}
      {data.loopType === 'while' && (
        <div>
          <Text type="secondary" className="block text-xs mb-1">
            循环条件（为假时停止）
          </Text>
          <Input.TextArea
            defaultValue={data.whileExpression || ''}
            onBlur={handleWhileExpressionBlur}
            placeholder="例如: variables.retryCount < 3"
            rows={2}
            size="small"
            data-testid="loop-while-expression"
          />
        </div>
      )}

      {/* 集合变量（loopType=for_each 时显示） */}
      {data.loopType === 'for_each' && (
        <div>
          <Text type="secondary" className="block text-xs mb-1">
            集合变量名（存放数组）
          </Text>
          <Input
            defaultValue={data.collectionVariable || ''}
            onBlur={handleCollectionVariableBlur}
            placeholder="例如: items"
            size="small"
            data-testid="loop-collection-variable"
          />
        </div>
      )}

      {/* 迭代变量名（仅 for_each 时显示） */}
      {data.loopType === 'for_each' && (
        <div>
          <Text type="secondary" className="block text-xs mb-1">
            迭代变量名（每轮当前元素的变量名）
          </Text>
          <Input
            defaultValue={data.iteratorVariable || 'item'}
            onBlur={handleIteratorVariableBlur}
            placeholder="默认 item，用 {{item}} 引用当前元素"
            size="small"
            data-testid="loop-iterator-variable"
          />
        </div>
      )}

      {/* 最大迭代次数（始终显示） */}
      <div>
        <Text type="secondary" className="block text-xs mb-1">
          最大迭代次数（安全限制）
        </Text>
        <InputNumber
          value={data.maxIterations || 100}
          onChange={handleMaxIterationsChange}
          min={1}
          max={10000}
          size="small"
          style={{ width: '100%' }}
          data-testid="loop-max-iterations"
        />
      </div>
    </div>
  )
}
