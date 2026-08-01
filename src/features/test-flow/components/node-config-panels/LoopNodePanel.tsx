import { useCallback } from 'react'

import { Input, InputNumber, Radio, Switch, Typography } from 'antd'

import type { LoopNodeData } from '../../types/flow.types'

import type { PanelProps } from './shared/panelRegistry'
import { useDraft } from './shared/useDraft'

const { Text } = Typography

// ==================== 循环类型选项 ====================

const LOOP_TYPE_OPTIONS = [
  { value: 'count', label: '固定次数' },
  { value: 'while', label: '条件循环' },
  { value: 'for_each', label: '遍历集合' },
]

// ==================== 组件 ====================

export default function LoopNodePanel({ data, onChange }: PanelProps<LoopNodeData>) {
  // 循环次数（受控草稿 + blur 提交，支持 {{variable}} 表达式）
  const { draft: countDraft, setDraft: setCountDraft, commit: commitCount } = useDraft(
    data.count !== undefined ? String(data.count) : '',
    (v) => {
      onChange({ count: v })
    },
  )

  // while 表达式（受控草稿 + blur 提交）
  const { draft: whileDraft, setDraft: setWhileDraft, commit: commitWhile } = useDraft(
    data.whileExpression ?? '',
    (v) => {
      onChange({ whileExpression: v })
    },
  )

  // 集合变量名（受控草稿 + blur 提交）
  const { draft: collectionDraft, setDraft: setCollectionDraft, commit: commitCollection } = useDraft(
    data.collectionVariable ?? '',
    (v) => {
      onChange({ collectionVariable: v })
    },
  )

  // 迭代变量名（受控草稿 + blur 提交）
  const { draft: iteratorDraft, setDraft: setIteratorDraft, commit: commitIterator } = useDraft(
    data.iteratorVariable ?? 'item',
    (v) => {
      onChange({ iteratorVariable: v })
    },
  )

  // 更新循环类型
  const handleLoopTypeChange = useCallback(
    (e: any) => {
      onChange({ loopType: e.target.value })
    },
    [onChange],
  )

  // 更新最大迭代次数
  const handleMaxIterationsChange = useCallback(
    (value: number | null) => {
      onChange({ maxIterations: value ?? 100 })
    },
    [onChange],
  )

  // 更新失败中断策略
  const handleBreakOnFailureChange = useCallback(
    (checked: boolean) => {
      onChange({ breakOnFailure: checked })
    },
    [onChange],
  )

  return (
    <div className="space-y-4">
      <Text className="block text-xs" type="secondary">
        循环配置
      </Text>

      {/* 循环类型 */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          循环类型
        </Text>
        <Radio.Group
          data-testid="loop-type"
          size="small"
          value={data.loopType}
          onChange={handleLoopTypeChange}
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
          <Text className="mb-1 block text-xs" type="secondary">
            循环次数
          </Text>
          <Input
            data-testid="loop-count"
            placeholder="例如: 5 或 {{maxRetries}}"
            size="small"
            value={countDraft}
            onBlur={commitCount}
            onChange={(e) => {
              setCountDraft(e.target.value)
            }}
          />
          <Text className="mt-1 block text-xs" type="secondary">
            支持固定数字或 {'{{变量}}'} 表达式
          </Text>
        </div>
      )}

      {/* while 表达式（loopType=while 时显示） */}
      {data.loopType === 'while' && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            循环条件（为假时停止）
          </Text>
          <Input.TextArea
            data-testid="loop-while-expression"
            placeholder="例如: variables.retryCount < 3"
            rows={2}
            size="small"
            value={whileDraft}
            onBlur={commitWhile}
            onChange={(e) => {
              setWhileDraft(e.target.value)
            }}
          />
        </div>
      )}

      {/* 集合变量（loopType=for_each 时显示） */}
      {data.loopType === 'for_each' && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            集合变量名（存放数组）
          </Text>
          <Input
            data-testid="loop-collection-variable"
            placeholder="例如: items"
            size="small"
            value={collectionDraft}
            onBlur={commitCollection}
            onChange={(e) => {
              setCollectionDraft(e.target.value)
            }}
          />
        </div>
      )}

      {/* 迭代变量名（仅 for_each 时显示） */}
      {data.loopType === 'for_each' && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            迭代变量名（每轮当前元素的变量名）
          </Text>
          <Input
            data-testid="loop-iterator-variable"
            placeholder="默认 item，用 {{item}} 引用当前元素"
            size="small"
            value={iteratorDraft}
            onBlur={commitIterator}
            onChange={(e) => {
              setIteratorDraft(e.target.value)
            }}
          />
        </div>
      )}

      {/* 最大迭代次数（始终显示） */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          最大迭代次数（安全限制）
        </Text>
        <InputNumber
          data-testid="loop-max-iterations"
          max={10000}
          min={1}
          size="small"
          style={{ width: '100%' }}
          value={data.maxIterations ?? 100}
          onChange={handleMaxIterationsChange}
        />
      </div>

      {/* 失败策略 */}
      <div className="flex items-center justify-between">
        <Text className="text-xs" type="secondary">
          循环体失败时中断
        </Text>
        <Switch
          checked={data.breakOnFailure !== false}
          data-testid="loop-break-on-failure"
          size="small"
          onChange={handleBreakOnFailureChange}
        />
      </div>
    </div>
  )
}
