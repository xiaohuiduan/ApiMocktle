import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Input, Select, Space, Typography } from 'antd'
import { Plus, Trash2 } from 'lucide-react'

import { translateKey } from '@/i18n/translate'
import type { TestAssertion } from '@/types'

const { Text } = Typography

// ==================== 断言类型选项 ====================

const ASSERTION_TYPE_OPTIONS = [
  { value: 'status', labelKey: 'flow.enum.assertionType.status' },
  { value: 'json_path', labelKey: 'flow.enum.assertionType.jsonPath' },
  { value: 'header', labelKey: 'flow.enum.assertionType.header' },
  { value: 'response_time', labelKey: 'flow.enum.assertionType.responseTime' },
  { value: 'body_contains', labelKey: 'flow.enum.assertionType.bodyContains' },
]

// ==================== 操作符选项 ====================

const OPERATOR_OPTIONS = [
  { value: 'equals', labelKey: 'flow.enum.operator.equals' },
  { value: 'not_equals', labelKey: 'flow.enum.operator.notEquals' },
  { value: 'exists', labelKey: 'flow.enum.operator.exists' },
  { value: 'not_exists', labelKey: 'flow.enum.operator.notExists' },
  { value: 'contains', labelKey: 'flow.enum.operator.contains' },
  { value: 'not_contains', labelKey: 'flow.enum.operator.notContains' },
  { value: 'greater_than', labelKey: 'flow.enum.operator.greaterThan' },
  { value: 'less_than', labelKey: 'flow.enum.operator.lessThan' },
]

// ==================== 组件 Props ====================

interface AssertionListEditorProps {
  assertions: TestAssertion[]
  onChange: (assertions: TestAssertion[]) => void
}

// ==================== 组件 ====================

export default function AssertionListEditor({ assertions, onChange }: AssertionListEditorProps) {
  const { t } = useTranslation()

  // 添加新断言
  const handleAdd = useCallback(() => {
    const newAssertion: TestAssertion = {
      type: 'status',
      operator: 'equals',
    }
    onChange([...assertions, newAssertion])
  }, [assertions, onChange])

  // 删除断言
  const handleDelete = useCallback(
    (index: number) => {
      const newAssertions = assertions.filter((_, i) => i !== index)
      onChange(newAssertions)
    },
    [assertions, onChange],
  )

  // 更新断言字段
  const handleUpdate = useCallback(
    (index: number, field: keyof TestAssertion, value: any) => {
      const newAssertions = assertions.map((assertion, i) => {
        if (i !== index) { return assertion }

        return { ...assertion, [field]: value }
      })
      onChange(newAssertions)
    },
    [assertions, onChange],
  )

  // 判断是否需要显示 path 字段
  const shouldShowPath = (type: string) => {
    return type === 'json_path'
  }

  // 判断是否需要显示 name 字段
  const shouldShowName = (type: string) => {
    return type === 'header'
  }

  // 判断是否需要显示 expected 字段
  const shouldShowExpected = (operator: string) => {
    return operator !== 'exists' && operator !== 'not_exists'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Text className="text-xs" type="secondary">
          {t('flow.nodeConfig.editor.assertionList')}
        </Text>
        <Button
          icon={<Plus size={14} />}
          size="small"
          type="dashed"
          onClick={handleAdd}
        >
          {t('flow.nodeConfig.editor.assertionAdd')}
        </Button>
      </div>

      {assertions.length === 0
        ? (
            <Text className="text-xs italic" type="secondary">
              {t('flow.nodeConfig.editor.assertionEmpty')}
            </Text>
          )
        : (
            <div className="space-y-2">
              {assertions.map((assertion, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-md border border-[color:var(--ds-node-border-color)] bg-[color:var(--ds-node-bg-elevated)] p-2"
                >
                  {/* 第一行：类型、路径 */}
                  <Space.Compact block>
                    <Select
                      options={ASSERTION_TYPE_OPTIONS.map((o) => ({ value: o.value, label: translateKey(o.labelKey) }))}
                      placeholder={t('flow.nodeConfig.editor.assertionTypePlaceholder')}
                      size="small"
                      style={{ width: '40%' }}
                      value={assertion.type}
                      onChange={(value) => { handleUpdate(index, 'type', value) }}
                    />
                    {shouldShowPath(assertion.type) && (
                      <Input
                        placeholder="data.token"
                        size="small"
                        style={{ width: '60%' }}
                        value={assertion.path ?? ''}
                        onChange={(e) => { handleUpdate(index, 'path', e.target.value) }}
                      />
                    )}
                    {shouldShowName(assertion.type) && (
                      <Input
                        placeholder="Content-Type"
                        size="small"
                        style={{ width: '60%' }}
                        value={assertion.name ?? ''}
                        onChange={(e) => { handleUpdate(index, 'name', e.target.value) }}
                      />
                    )}
                  </Space.Compact>

                  {/* 第二行：操作符、期望值、删除按钮 */}
                  <Space.Compact block>
                    <Select
                      options={OPERATOR_OPTIONS.map((o) => ({ value: o.value, label: translateKey(o.labelKey) }))}
                      placeholder={t('flow.nodeConfig.editor.operatorPlaceholder')}
                      size="small"
                      style={{ width: '35%' }}
                      value={assertion.operator}
                      onChange={(value) => { handleUpdate(index, 'operator', value) }}
                    />
                    {shouldShowExpected(assertion.operator) && (
                      <Input
                        placeholder={t('flow.nodeConfig.editor.expectedPlaceholder')}
                        size="small"
                        style={{ width: '55%' }}
                        value={
                          assertion.expected !== undefined
                            ? String(assertion.expected)
                            : ''
                        }
                        onChange={(e) => { handleUpdate(index, 'expected', e.target.value) }}
                      />
                    )}
                    <Button
                      danger
                      icon={<Trash2 size={14} />}
                      size="small"
                      style={{ width: '10%' }}
                      type="text"
                      onClick={() => { handleDelete(index) }}
                    />
                  </Space.Compact>
                </div>
              ))}
            </div>
          )}
    </div>
  )
}
