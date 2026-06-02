import { useCallback } from 'react'
import { Button, Select, Input, Space, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
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
        if (i !== index) return assertion
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
        <Text type="secondary" className="text-xs">
          断言列表
        </Text>
        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleAdd}
        >
          添加断言
        </Button>
      </div>

      {assertions.length === 0 ? (
        <Text type="secondary" className="text-xs italic">
          暂无断言
        </Text>
      ) : (
        <div className="space-y-2">
          {assertions.map((assertion, index) => (
            <div
              key={index}
              className="p-2 border border-gray-200 rounded-md space-y-2 bg-gray-50"
            >
              {/* 第一行：类型、路径 */}
              <Space.Compact block>
                <Select
                  value={assertion.type}
                  onChange={(value) => handleUpdate(index, 'type', value)}
                  options={ASSERTION_TYPE_OPTIONS}
                  size="small"
                  style={{ width: '40%' }}
                  placeholder="断言类型"
                />
                {shouldShowPath(assertion.type) && (
                  <Input
                    value={assertion.path || ''}
                    onChange={(e) => handleUpdate(index, 'path', e.target.value)}
                    size="small"
                    placeholder="data.token"
                    style={{ width: '60%' }}
                  />
                )}
                {shouldShowName(assertion.type) && (
                  <Input
                    value={assertion.name || ''}
                    onChange={(e) => handleUpdate(index, 'name', e.target.value)}
                    size="small"
                    placeholder="Content-Type"
                    style={{ width: '60%' }}
                  />
                )}
              </Space.Compact>

              {/* 第二行：操作符、期望值、删除按钮 */}
              <Space.Compact block>
                <Select
                  value={assertion.operator}
                  onChange={(value) => handleUpdate(index, 'operator', value)}
                  options={OPERATOR_OPTIONS}
                  size="small"
                  style={{ width: '35%' }}
                  placeholder="操作符"
                />
                {shouldShowExpected(assertion.operator) && (
                  <Input
                    value={
                      assertion.expected !== undefined
                        ? String(assertion.expected)
                        : ''
                    }
                    onChange={(e) => handleUpdate(index, 'expected', e.target.value)}
                    size="small"
                    placeholder="期望值"
                    style={{ width: '55%' }}
                  />
                )}
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(index)}
                  style={{ width: '10%' }}
                />
              </Space.Compact>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
