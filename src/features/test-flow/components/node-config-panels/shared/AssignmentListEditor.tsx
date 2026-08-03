import { useCallback } from 'react'

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Input, Select, Space, Typography } from 'antd'

const { Text } = Typography

// ==================== 赋值运算符选项 ====================

const OPERATOR_OPTIONS = [
  { value: '=', label: '=' },
  { value: '+=', label: '+=' },
  { value: '-=', label: '-=' },
]

// ==================== 赋值项类型 ====================

interface Assignment {
  variable: string
  operator: '=' | '+=' | '-='
  value: string
}

// ==================== 组件 Props ====================

interface AssignmentListEditorProps {
  assignments: Assignment[]
  onChange: (assignments: Assignment[]) => void
}

// ==================== 组件 ====================

export default function AssignmentListEditor({ assignments, onChange }: AssignmentListEditorProps) {
  // 添加新赋值
  const handleAdd = useCallback(() => {
    const newAssignment: Assignment = {
      variable: '',
      operator: '=',
      value: '',
    }
    onChange([...assignments, newAssignment])
  }, [assignments, onChange])

  // 删除赋值
  const handleDelete = useCallback(
    (index: number) => {
      const newAssignments = assignments.filter((_, i) => i !== index)
      onChange(newAssignments)
    },
    [assignments, onChange],
  )

  // 更新赋值字段
  const handleUpdate = useCallback(
    (index: number, field: keyof Assignment, value: any) => {
      const newAssignments = assignments.map((assignment, i) => {
        if (i !== index) { return assignment }

        return { ...assignment, [field]: value }
      })
      onChange(newAssignments)
    },
    [assignments, onChange],
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Text className="text-xs" type="secondary">
          变量赋值列表
        </Text>
        <Button
          icon={<PlusOutlined />}
          size="small"
          type="dashed"
          onClick={handleAdd}
        >
          添加赋值
        </Button>
      </div>

      {assignments.length === 0
        ? (
            <Text className="text-xs italic" type="secondary">
              暂无赋值
            </Text>
          )
        : (
            <div className="space-y-2">
              {assignments.map((assignment, index) => (
                <div
                  key={index}
                  className="rounded-md border border-[color:var(--ds-node-border-color)] bg-[color:var(--ds-node-bg-elevated)] p-2"
                >
                  <Space.Compact block>
                    <Input
                      placeholder="变量名"
                      size="small"
                      style={{ width: '35%' }}
                      value={assignment.variable}
                      onChange={(e) => { handleUpdate(index, 'variable', e.target.value) }}
                    />
                    <Select
                      options={OPERATOR_OPTIONS}
                      size="small"
                      style={{ width: '15%' }}
                      value={assignment.operator}
                      onChange={(value) => { handleUpdate(index, 'operator', value) }}
                    />
                    <Input
                      placeholder="值或 {{表达式}}"
                      size="small"
                      style={{ width: '40%' }}
                      value={assignment.value}
                      onChange={(e) => { handleUpdate(index, 'value', e.target.value) }}
                    />
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
