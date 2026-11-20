import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Input, Radio, Select, Typography } from 'antd'
import { Plus, Trash2 } from 'lucide-react'

import type { ConditionBranch, ConditionNodeData } from '../../types/flow.types'

import type { PanelProps } from './shared/panelRegistry'
import { useDraft } from './shared/useDraft'

import { translateKey } from '@/i18n/translate'

const { Text } = Typography

// ==================== 条件类型选项 ====================

/** 条件类型选项（label 为 i18n key，渲染期取词） */
const CONDITION_TYPE_OPTIONS = [
  { value: 'expression', labelKey: 'flow.enum.conditionType.expression' },
  { value: 'variable_check', labelKey: 'flow.enum.conditionType.variableCheck' },
  { value: 'status_code', labelKey: 'flow.enum.conditionType.statusCode' },
]

// ==================== 操作符选项 ====================

const OPERATOR_OPTIONS = [
  { value: 'equals', labelKey: 'flow.enum.operator.equals' },
  { value: 'not_equals', labelKey: 'flow.enum.operator.notEquals' },
  { value: 'exists', labelKey: 'flow.enum.operator.exists' },
  { value: 'greater_than', labelKey: 'flow.enum.operator.greaterThan' },
  { value: 'less_than', labelKey: 'flow.enum.operator.lessThan' },
  { value: 'contains', labelKey: 'flow.enum.operator.contains' },
]

// ==================== 组件 ====================

export default function ConditionNodePanel({ data, onChange }: PanelProps<ConditionNodeData>) {
  const { t } = useTranslation()

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
      conditions: [...conditions, { id: newId, expression: '', label: t('flow.nodeConfig.condition.branch', { index: conditions.length + 1 }) }],
    })
  }, [data.conditions, onChange, t])

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
        {t('flow.nodeConfig.condition.title')}
      </Text>

      {/* 条件类型 */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          {t('flow.nodeConfig.condition.conditionType')}
        </Text>
        <Radio.Group
          data-testid="condition-type"
          size="small"
          value={data.conditionType}
          onChange={handleConditionTypeChange}
        >
          {CONDITION_TYPE_OPTIONS.map((option) => (
            <Radio.Button key={option.value} value={option.value}>
              {translateKey(option.labelKey)}
            </Radio.Button>
          ))}
        </Radio.Group>
      </div>

      {/* 表达式（conditionType=expression 时显示） */}
      {data.conditionType === 'expression' && (
        <div>
          <Text className="mb-1 block text-xs" type="secondary">
            {t('flow.nodeConfig.condition.expression')}
          </Text>
          <Input.TextArea
            data-testid="condition-expression"
            placeholder={t('flow.nodeConfig.condition.expressionPlaceholder')}
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
            {t('flow.nodeConfig.condition.statusCode')}
          </Text>
          <Input
            data-testid="condition-status-code"
            placeholder={t('flow.nodeConfig.condition.statusCodePlaceholder')}
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
            {t('flow.nodeConfig.condition.variableName')}
          </Text>
          <Input
            data-testid="condition-variable-name"
            placeholder={t('flow.nodeConfig.condition.variableNamePlaceholder')}
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
            {t('flow.nodeConfig.condition.operator')}
          </Text>
          <Select
            data-testid="condition-operator"
            options={OPERATOR_OPTIONS.map((o) => ({ value: o.value, label: translateKey(o.labelKey) }))}
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
            {t('flow.nodeConfig.condition.compareValue')}
          </Text>
          <Input
            data-testid="condition-compare-value"
            placeholder={t('flow.nodeConfig.condition.compareValuePlaceholder')}
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
            {t('flow.nodeConfig.condition.multiBranch')}
          </Text>
          {(!data.conditions || data.conditions.length < 8) && (
            <Button
              data-testid="condition-add-branch"
              icon={<Plus size={14} />}
              size="small"
              type="dashed"
              onClick={handleAddCondition}
            >
              {t('flow.nodeConfig.condition.addBranch')}
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
                        {t('flow.nodeConfig.condition.branch', { index: index + 1 })}
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
                      placeholder={t('flow.nodeConfig.condition.branchLabelPlaceholder')}
                      size="small"
                      value={condition.label}
                      onChange={(e) => { handleConditionChange(index, 'label', e.target.value) }}
                    />

                    <Input.TextArea
                      data-testid={`condition-branch-expression-${index}`}
                      placeholder={t('flow.nodeConfig.condition.branchExpressionPlaceholder')}
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
                    {t('flow.nodeConfig.condition.defaultBranch')}
                  </Text>
                  <Input
                    data-testid="condition-default-label"
                    placeholder={t('flow.nodeConfig.condition.defaultBranchPlaceholder')}
                    size="small"
                    value={data.defaultLabel ?? 'default'}
                    onChange={(e) => { handleDefaultLabelChange(e) }}
                  />
                </div>
              </div>
            )
          : (
              <Text className="text-xs italic" type="secondary">
                {t('flow.nodeConfig.condition.noBranchHint')}
              </Text>
            )}
      </div>
    </div>
  )
}
