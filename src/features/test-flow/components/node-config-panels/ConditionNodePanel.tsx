import { useCallback } from 'react'
import { Radio, Select, Input, Typography, Button, Space } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { PanelProps } from './shared/panelRegistry'
import type { ConditionNodeData, ConditionBranch } from '../../types/flow.types'

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
  // 更新条件类型
  const handleConditionTypeChange = useCallback(
    (e: any) => {
      onChange({ conditionType: e.target.value })
    },
    [onChange],
  )

  // 更新表达式（onBlur 提交）
  const handleExpressionBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange({ expression: e.target.value })
    },
    [onChange],
  )

  // 更新变量名（onBlur 提交）
  const handleVariableNameBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      onChange({ variableName: e.target.value })
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

  // 更新比较值（onBlur 提交）
  const handleCompareValueBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      onChange({ compareValue: e.target.value })
    },
    [onChange],
  )

  // ==================== 多分支编辑器 ====================

  // 添加新条件分支
  const handleAddCondition = useCallback(() => {
    const conditions = data.conditions || []
    const newId = `cond-${Date.now()}`
    onChange({
      conditions: [...conditions, { id: newId, expression: '', label: `分支 ${conditions.length + 1}` }],
    })
  }, [data.conditions, onChange])

  // 删除条件分支
  const handleRemoveCondition = useCallback(
    (index: number) => {
      const conditions = data.conditions || []
      onChange({
        conditions: conditions.filter((_, i) => i !== index),
      })
    },
    [data.conditions, onChange],
  )

  // 更新条件分支
  const handleConditionChange = useCallback(
    (index: number, field: keyof ConditionBranch, value: string) => {
      const conditions = data.conditions || []
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
      <Text type="secondary" className="block text-xs">
        条件配置
      </Text>

      {/* 条件类型 */}
      <div>
        <Text type="secondary" className="block text-xs mb-1">
          条件类型
        </Text>
        <Radio.Group
          value={data.conditionType}
          onChange={handleConditionTypeChange}
          size="small"
          data-testid="condition-type"
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
          <Text type="secondary" className="block text-xs mb-1">
            JavaScript 表达式
          </Text>
          <Input.TextArea
            defaultValue={data.expression || ''}
            onBlur={handleExpressionBlur}
            placeholder="例如: variables.token && variables.count > 0"
            rows={3}
            size="small"
            data-testid="condition-expression"
          />
        </div>
      )}

      {/* 状态码（conditionType=status_code 时显示） */}
      {data.conditionType === 'status_code' && (
        <div>
          <Text type="secondary" className="block text-xs mb-1">
            预期状态码
          </Text>
          <Input
            defaultValue={data.expression || ''}
            onBlur={handleExpressionBlur}
            placeholder="例如: 200、201、404"
            size="small"
            data-testid="condition-status-code"
          />
        </div>
      )}

      {/* 变量名（conditionType=variable_check 时显示） */}
      {showOperator && (
        <div>
          <Text type="secondary" className="block text-xs mb-1">
            变量名
          </Text>
          <Input
            defaultValue={data.variableName || ''}
            onBlur={handleVariableNameBlur}
            placeholder="例如: token"
            size="small"
            data-testid="condition-variable-name"
          />
        </div>
      )}

      {/* 操作符（conditionType=variable_check 时显示） */}
      {showOperator && (
        <div>
          <Text type="secondary" className="block text-xs mb-1">
            操作符
          </Text>
          <Select
            value={data.operator}
            onChange={handleOperatorChange}
            options={OPERATOR_OPTIONS}
            size="small"
            style={{ width: '100%' }}
            data-testid="condition-operator"
          />
        </div>
      )}

      {/* 比较值（operator != exists 时显示） */}
      {showCompareValue && (
        <div>
          <Text type="secondary" className="block text-xs mb-1">
            比较值
          </Text>
          <Input
            defaultValue={data.compareValue || ''}
            onBlur={handleCompareValueBlur}
            placeholder="期望值"
            size="small"
            data-testid="condition-compare-value"
          />
        </div>
      )}

      {/* ==================== 多分支编辑器 ==================== */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <Text type="secondary" className="text-xs">
            多条件分支（可选）
          </Text>
          {(!data.conditions || data.conditions.length < 8) && (
            <Button
              type="dashed"
              size="small"
              icon={<PlusOutlined />}
              onClick={handleAddCondition}
              data-testid="condition-add-branch"
            >
              添加分支
            </Button>
          )}
        </div>

        {isMultiBranchMode ? (
          <div className="space-y-3">
            {/* 条件分支列表 */}
            {data.conditions!.map((condition, index) => (
              <div
                key={condition.id}
                className="p-3 border border-gray-200 rounded-md space-y-2 bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <Text strong className="text-xs">
                    分支 {index + 1}
                  </Text>
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveCondition(index)}
                    data-testid={`condition-remove-branch-${index}`}
                  />
                </div>

                <Input
                  value={condition.label}
                  onChange={(e) => handleConditionChange(index, 'label', e.target.value)}
                  size="small"
                  placeholder="分支标签（如：状态码200）"
                  data-testid={`condition-branch-label-${index}`}
                />

                <Input.TextArea
                  value={condition.expression}
                  onChange={(e) => handleConditionChange(index, 'expression', e.target.value)}
                  size="small"
                  placeholder="条件表达式（如：variables.status === '200'）"
                  rows={2}
                  data-testid={`condition-branch-expression-${index}`}
                />
              </div>
            ))}

            {/* 默认分支 */}
            <div className="p-3 border border-dashed border-gray-300 rounded-md bg-gray-100">
              <Text type="secondary" className="block text-xs mb-2">
                默认分支（当所有条件都不满足时）
              </Text>
              <Input
                value={data.defaultLabel || 'default'}
                onChange={(e) => handleDefaultLabelChange(e)}
                size="small"
                placeholder="默认分支标签"
                data-testid="condition-default-label"
              />
            </div>
          </div>
        ) : (
          <Text type="secondary" className="text-xs italic">
            添加条件分支以支持多分支判断，否则使用简单的 true/false 双分支
          </Text>
        )}
      </div>
    </div>
  )
}
