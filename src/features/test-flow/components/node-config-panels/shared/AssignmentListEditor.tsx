import { useCallback } from 'react'
import { Button, Select, Input, Space, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'

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
        if (i !== index) return assignment
        return { ...assignment, [field]: value }
      })
      onChange(newAssignments)
    },
    [assignments, onChange],
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Text type="secondary" className="text-xs">
          变量赋值列表
        </Text>
        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleAdd}
        >
          添加赋值
        </Button>
      </div>

      {assignments.length === 0 ? (
        <Text type="secondary" className="text-xs italic">
          暂无赋值
        </Text>
      ) : (
        <div className="space-y-2">
          {assignments.map((assignment, index) => (
            <div
              key={index}
              className="p-2 border border-[color:var(--ds-node-border-color,#e5e7eb)] rounded-md bg-[color:var(--ds-node-bg-elevated,#f9fafb)]"
            >
              <Space.Compact block>
                <Input
                  value={assignment.variable}
                  onChange={(e) => handleUpdate(index, 'variable', e.target.value)}
                  size="small"
                  placeholder="变量名"
                  style={{ width: '35%' }}
                />
                <Select
                  value={assignment.operator}
                  onChange={(value) => handleUpdate(index, 'operator', value)}
                  options={OPERATOR_OPTIONS}
                  size="small"
                  style={{ width: '15%' }}
                />
                <Input
                  value={assignment.value}
                  onChange={(e) => handleUpdate(index, 'value', e.target.value)}
                  size="small"
                  placeholder="值或 {{表达式}}"
                  style={{ width: '40%' }}
                />
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
