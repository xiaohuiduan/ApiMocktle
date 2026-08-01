import { useCallback, useMemo } from 'react'
import { Button, Select, Input, Space, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useFlowStore } from '../../../store/useFlowStore'
import type { FlowNodeType } from '../../../types/flow.types'

const { Text } = Typography

// ==================== 类型 ====================

export interface VariableAssertion {
  variable: string
  operator: string
  expected?: string
}

// ==================== 操作符选项 ====================

const OPERATOR_OPTIONS = [
  { value: 'equals', label: '等于' },
  { value: 'not_equals', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'not_contains', label: '不包含' },
  { value: 'greater_than', label: '大于' },
  { value: 'less_than', label: '小于' },
  { value: 'exists', label: '存在' },
  { value: 'not_exists', label: '不存在' },
]

// ==================== 从流程图提取已知变量名 ====================

function extractVariableNames(nodes: Array<{ type: string; data: Record<string, unknown> }>): string[] {
  const vars = new Set<string>()

  for (const node of nodes) {
    const d = node.data

    // setVariable 节点的 assignments
    if (node.type === 'setVariable' && Array.isArray(d.assignments)) {
      for (const a of d.assignments as Array<{ variable: string }>) {
        if (a.variable) vars.add(a.variable)
      }
    }

    if (node.type === 'httpRequest') {
      // extractors
      if (Array.isArray(d.extractors)) {
        for (const e of d.extractors as Array<{ variable: string }>) {
          if (e.variable) vars.add(e.variable)
        }
      }
      // postScript 中的 pm.variables.set('name', ...)
      const postScript = d.postScript as string | undefined
      if (postScript) {
        const matches = postScript.matchAll(/pm\.variables\.set\s*\(\s*['"](\w+)['"]/g)
        for (const m of matches) {
          vars.add(m[1])
        }
      }
    }
  }

  // 内置变量
  vars.add('__last_status__')
  vars.add('__last_duration__')
  vars.add('__loop_index__')

  return Array.from(vars).sort()
}

// ==================== 组件 Props ====================

interface VariableAssertionListEditorProps {
  assertions: VariableAssertion[]
  onChange: (assertions: VariableAssertion[]) => void
}

// ==================== 组件 ====================

export default function VariableAssertionListEditor({ assertions, onChange }: VariableAssertionListEditorProps) {
  const nodes = useFlowStore((s) => s.nodes)

  // 从流程图中提取已知变量名
  const knownVars = useMemo(() =>
    extractVariableNames(nodes as Array<{ type: string; data: Record<string, unknown> }>),
    [nodes],
  )

  const varOptions = useMemo(() =>
    knownVars.map((v) => ({ value: v, label: v })),
    [knownVars],
  )

  const handleAdd = useCallback(() => {
    onChange([...assertions, { variable: '', operator: 'exists' }])
  }, [assertions, onChange])

  const handleDelete = useCallback(
    (index: number) => {
      onChange(assertions.filter((_, i) => i !== index))
    },
    [assertions, onChange],
  )

  const handleUpdate = useCallback(
    (index: number, field: keyof VariableAssertion, value: string) => {
      onChange(assertions.map((a, i) => (i === index ? { ...a, [field]: value } : a)))
    },
    [assertions, onChange],
  )

  const showExpected = (op: string) => op !== 'exists' && op !== 'not_exists'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Text type="secondary" className="text-xs">
          变量断言规则（运行时检查变量值）
        </Text>
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAdd}>
          添加
        </Button>
      </div>

      {assertions.length === 0 ? (
        <Text type="secondary" className="text-xs italic">
          暂无断言规则
        </Text>
      ) : (
        <div className="space-y-2">
          {assertions.map((a, index) => (
            <div key={index} className="p-2 border border-[color:var(--ds-node-border-color,#e5e7eb)] rounded-md bg-[color:var(--ds-node-bg-elevated,#f9fafb)]">
              <Space.Compact block>
                <Select
                  value={a.variable || undefined}
                  onChange={(val) => handleUpdate(index, 'variable', val)}
                  options={varOptions}
                  size="small"
                  style={{ width: '40%' }}
                  placeholder="变量名"
                  showSearch
                  allowClear
                  mode={undefined}
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      {knownVars.length === 0 && (
                        <div style={{ padding: '4px 8px', color: 'var(--ds-node-text-muted, #9ca3af)', fontSize: 11 }}>
                          暂无已知变量，请手动输入
                        </div>
                      )}
                    </>
                  )}
                />
                <Select
                  value={a.operator}
                  onChange={(val) => handleUpdate(index, 'operator', val)}
                  options={OPERATOR_OPTIONS}
                  size="small"
                  style={{ width: '30%' }}
                />
                {showExpected(a.operator) && (
                  <Input
                    value={a.expected || ''}
                    onChange={(e) => handleUpdate(index, 'expected', e.target.value)}
                    size="small"
                    placeholder="期望值"
                    style={{ width: '30%' }}
                  />
                )}
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(index)}
                  style={{ width: 28, flexShrink: 0 }}
                />
              </Space.Compact>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
