import { useCallback } from 'react'

import { Plus, Trash2 } from 'lucide-react'
import { Button, Input, Radio, Select, Typography } from 'antd'

import type { ConditionBranch, ConditionNodeData } from '../../types/flow.types'

import type { PanelProps } from './shared/panelRegistry'
import { useDraft } from './shared/useDraft'

const { Text } = Typography

// ==================== 条件类型选项 ====================

const CONDITION_TYPE_OPTIONS = [
  { value: 'expression', label: '表达式' },
  { value: 'variable_check', label: '变量检查' },
  { value: 'status_code', label: '状态码' },
]

// ==================== 操作符选项 ====================

const OPERATOR_OPTIONS = [
  { value: 'equals', label: '等于' },
  { value: 'not_equals', label: '不等于' },
  { value: 'exists', label: '存在' },
  { value: 'greater_than', label: '大于' },
  { value: 'less_than', label: '小于' },
  { value: 'contains', label: '包含' },
]

// ==================== 组件 ====================

export default function ConditionNodePanel({ data, onChange }: PanelProps<ConditionNodeData>) {
  // 表达式（受控草稿 + blur 提交；status_code 模式共用 data.expression）
  const { draft: expressionDraft, setDraft: setExpressionDraft, commit: commitExpression } = useDraft(
    data.expression ?? '',
    (v) => {
      onChange({ expression: v })
    },
  )

  // 变量名（受控草稿 + blur 提交）
  const { draft: variableNameDraft, setDraft: setVariableNameDraft, commit: commitVariableName } = useDraft(
    data.variableName ?? '',
    (v) => {
      onChange({ variableName: v })
    },
  )

  // 比较值（受控草稿 + blur 提交）
  const { draft: compareValueDraft, setDraft: setCompareValueDraft, commit: commitCompareValue } = useDraft(
    data.compareValue ?? '',
    (v) => {
      onChange({ compareValue: v })
    },
  )

  // 更新条件类型
  const handleConditionTypeChange = useCallback(
    (e: any) => {
      onChange({ conditionType: e.target.value })
    },
    [onChange],
  )

  // 更新操作符
  const handleOperatorChange = useCallback(
    (value: string) => {
      onChange({ operator: value as ConditionNodeData['operator'] })
    },
    [onChange],
  )

  // ==================== 多分支编辑器 ====================

  // 添加新条件分支
  const handleAddCondition = useCallback(() => {
    const conditions = data.conditions ?? []
    const newId = `cond-${Date.now()}`
    onChange({
      conditions: [...conditions, { id: newId, expression: '', label: `分支 ${conditions.length + 1}` }],
    })
  }, [data.conditions, onChange])

  // 删除条件分支
  const handleRemoveCondition = useCallback(
    (index: number) => {
      const conditions = data.conditions ?? []
      onChange({
        conditions: conditions.filter((_, i) => i !== index),
      })
    },
    [data.conditions, onChange],
  )

  // 更新条件分支
  const handleConditionChange = useCallback(
    (index: number, field: keyof ConditionBranch, value: string) => {
      const conditions = data.conditions ?? []
      onChange({
        conditions: conditions.map((c, i) => i === index ? { ...c, [field]: value } : c),
      })
    },
    [data.conditions, onChange],
  )

  // 更新默认分支标签
  const handleDefaultLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ defaultLabel: e.target.value })
    },
    [onChange],
  )

  // 判断是否处于多分支模式
  const isMultiBranchMode = data.conditions && data.conditions.length > 0

  // 判断是否需要显示操作符和比较值
  const showOperator = data.conditionType === 'variable_check'
  const showCompareValue = showOperator && data.operator !== 'exists'

  return (
    <div className="space-y-4">
      <Text className="block text-xs" type="secondary">
        条件配置
      </Text>

      {/* 条件类型 */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          条件类型
        </Text>
        <Radio.Group
          data-testid="condition-type"
          size="small"
          value={data.conditionType}
          onChange={handleConditionTypeChange}
        >
          {CONDITION_TYPE_OPTIONS.map((option) => (
            <Radio.Button key={option.value} value={option.value}>
              {option.label}
            </Radio.Button>
          ))}
        </Radio.Group>
      </div>

      {/* 表达式（conditionType=expression 时显示） */}
      {data.conditionType === 'expression' && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            JavaScript 表达式
          </Text>
          <Input.TextArea
            data-testid="condition-expression"
            placeholder="例如: variables.token && variables.count > 0"
            rows={3}
            size="small"
            value={expressionDraft}
            onBlur={commitExpression}
            onChange={(e) => {
              setExpressionDraft(e.target.value)
            }}
          />
        </div>
      )}

      {/* 状态码（conditionType=status_code 时显示） */}
      {data.conditionType === 'status_code' && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            预期状态码
          </Text>
          <Input
            data-testid="condition-status-code"
            placeholder="例如: 200、201、404"
            size="small"
            value={expressionDraft}
            onBlur={commitExpression}
            onChange={(e) => {
              setExpressionDraft(e.target.value)
            }}
          />
        </div>
      )}

      {/* 变量名（conditionType=variable_check 时显示） */}
      {showOperator && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            变量名
          </Text>
          <Input
            data-testid="condition-variable-name"
            placeholder="例如: token"
            size="small"
            value={variableNameDraft}
            onBlur={commitVariableName}
            onChange={(e) => {
              setVariableNameDraft(e.target.value)
            }}
          />
        </div>
      )}

      {/* 操作符（conditionType=variable_check 时显示） */}
      {showOperator && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            操作符
          </Text>
          <Select
            data-testid="condition-operator"
            options={OPERATOR_OPTIONS}
            size="small"
            style={{ width: '100%' }}
            value={data.operator}
            onChange={handleOperatorChange}
          />
        </div>
      )}

      {/* 比较值（operator != exists 时显示） */}
      {showCompareValue && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            比较值
          </Text>
          <Input
            data-testid="condition-compare-value"
            placeholder="期望值"
            size="small"
            value={compareValueDraft}
            onBlur={commitCompareValue}
            onChange={(e) => {
              setCompareValueDraft(e.target.value)
            }}
          />
        </div>
      )}

      {/* ==================== 多分支编辑器 ==================== */}
      <div className="mt-4 border-t border-gray-200 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <Text className="text-xs" type="secondary">
            多条件分支（可选）
          </Text>
          {(!data.conditions || data.conditions.length < 8) && (
            <Button
              data-testid="condition-add-branch"
              icon={<Plus size={14} />}
              size="small"
              type="dashed"
              onClick={handleAddCondition}
            >
              添加分支
            </Button>
          )}
        </div>

        {isMultiBranchMode
          ? (
              <div className="space-y-3">
                {/* 条件分支列表 */}
                {data.conditions!.map((condition, index) => (
                  <div
                    key={condition.id}
                    className="space-y-2 rounded-md border border-[color:var(--ds-node-border-color)] bg-[color:var(--ds-node-bg-elevated)] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <Text strong className="text-xs">
                        分支 {index + 1}
                      </Text>
                      <Button
                        danger
                        data-testid={`condition-remove-branch-${index}`}
                        icon={<Trash2 size={14} />}
                        size="small"
                        type="text"
                        onClick={() => { handleRemoveCondition(index) }}
                      />
                    </div>

                    <Input
                      data-testid={`condition-branch-label-${index}`}
                      placeholder="分支标签（如：状态码200）"
                      size="small"
                      value={condition.label}
                      onChange={(e) => { handleConditionChange(index, 'label', e.target.value) }}
                    />

                    <Input.TextArea
                      data-testid={`condition-branch-expression-${index}`}
                      placeholder="条件表达式（如：variables.status === '200'）"
                      rows={2}
                      size="small"
                      value={condition.expression}
                      onChange={(e) => { handleConditionChange(index, 'expression', e.target.value) }}
                    />
                  </div>
                ))}

                {/* 默认分支 */}
                <div className="rounded-md border border-dashed border-[color:var(--ds-node-border-color)] bg-[color:var(--ds-node-bg)] p-3">
                  <Text className="mb-2 block text-xs" type="secondary">
                    默认分支（当所有条件都不满足时）
                  </Text>
                  <Input
                    data-testid="condition-default-label"
                    placeholder="默认分支标签"
                    size="small"
                    value={data.defaultLabel ?? 'default'}
                    onChange={(e) => { handleDefaultLabelChange(e) }}
                  />
                </div>
              </div>
            )
          : (
              <Text className="text-xs italic" type="secondary">
                添加条件分支以支持多分支判断，否则使用简单的 true/false 双分支
              </Text>
            )}
      </div>
    </div>
  )
}
