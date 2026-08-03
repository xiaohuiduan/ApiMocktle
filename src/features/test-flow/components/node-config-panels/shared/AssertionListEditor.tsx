import { useCallback } from 'react'

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Input, Select, Space, Typography } from 'antd'

import type { TestAssertion } from '@/types'

const { Text } = Typography

// ==================== 断言类型选项 ====================

const ASSERTION_TYPE_OPTIONS = [
  { value: 'status', label: '状态码' },
  { value: 'json_path', label: 'JSON 路径' },
  { value: 'header', label: '响应头' },
  { value: 'response_time', label: '响应时间' },
  { value: 'body_contains', label: '响应体包含' },
]

// ==================== 操作符选项 ====================

const OPERATOR_OPTIONS = [
  { value: 'equals', label: '等于' },
  { value: 'not_equals', label: '不等于' },
  { value: 'exists', label: '存在' },
  { value: 'not_exists', label: '不存在' },
  { value: 'contains', label: '包含' },
  { value: 'not_contains', label: '不包含' },
  { value: 'greater_than', label: '大于' },
  { value: 'less_than', label: '小于' },
]

// ==================== 组件 Props ====================

interface AssertionListEditorProps {
  assertions: TestAssertion[]
  onChange: (assertions: TestAssertion[]) => void
}

// ==================== 组件 ====================

export default function AssertionListEditor({ assertions, onChange }: AssertionListEditorProps) {
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
          断言列表
        </Text>
        <Button
          icon={<PlusOutlined />}
          size="small"
          type="dashed"
          onClick={handleAdd}
        >
          添加断言
        </Button>
      </div>

      {assertions.length === 0
        ? (
            <Text className="text-xs italic" type="secondary">
              暂无断言
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
                      options={ASSERTION_TYPE_OPTIONS}
                      placeholder="断言类型"
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
                      options={OPERATOR_OPTIONS}
                      placeholder="操作符"
                      size="small"
                      style={{ width: '35%' }}
                      value={assertion.operator}
                      onChange={(value) => { handleUpdate(index, 'operator', value) }}
                    />
                    {shouldShowExpected(assertion.operator) && (
                      <Input
                        placeholder="期望值"
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
                      icon={<DeleteOutlined />}
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
