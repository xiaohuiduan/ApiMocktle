import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Input, Select, Space, Typography } from 'antd'
import { Plus, Trash2 } from 'lucide-react'

import { useFlowStore } from '../../../store/useFlowStore'

import { translateKey } from '@/i18n/translate'

const { Text } = Typography

// ==================== 类型 ====================

export interface VariableAssertion {
  variable: string
  operator: string
  expected?: string
}

// ==================== 操作符选项 ====================

const OPERATOR_OPTIONS = [
  { value: 'equals', labelKey: 'flow.enum.operator.equals' },
  { value: 'not_equals', labelKey: 'flow.enum.operator.notEquals' },
  { value: 'contains', labelKey: 'flow.enum.operator.contains' },
  { value: 'not_contains', labelKey: 'flow.enum.operator.notContains' },
  { value: 'greater_than', labelKey: 'flow.enum.operator.greaterThan' },
  { value: 'less_than', labelKey: 'flow.enum.operator.lessThan' },
  { value: 'exists', labelKey: 'flow.enum.operator.exists' },
  { value: 'not_exists', labelKey: 'flow.enum.operator.notExists' },
]

// ==================== 从流程图提取已知变量名 ====================

function extractVariableNames(nodes: { type: string, data: Record<string, unknown> }[]): string[] {
  const vars = new Set<string>()

  for (const node of nodes) {
    const d = node.data

    // setVariable 节点的 assignments
    if (node.type === 'setVariable' && Array.isArray(d.assignments)) {
      for (const a of d.assignments as { variable: string }[]) {
        if (a.variable) { vars.add(a.variable) }
      }
    }

    if (node.type === 'httpRequest') {
      // extractors
      if (Array.isArray(d.extractors)) {
        for (const e of d.extractors as { variable: string }[]) {
          if (e.variable) { vars.add(e.variable) }
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
  const { t } = useTranslation()
  const nodes = useFlowStore((s) => s.nodes)

  // 从流程图中提取已知变量名
  const knownVars = useMemo(() =>
    extractVariableNames(nodes as { type: string, data: Record<string, unknown> }[]),
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
        <Text className="text-xs" type="secondary">
          {t('flow.nodeConfig.editor.variableAssertionTitle')}
        </Text>
        <Button icon={<Plus size={14} />} size="small" type="dashed" onClick={handleAdd}>
          {t('flow.nodeConfig.editor.add')}
        </Button>
      </div>

      {assertions.length === 0
        ? (
            <Text className="text-xs italic" type="secondary">
              {t('flow.nodeConfig.editor.variableAssertionEmpty')}
            </Text>
          )
        : (
            <div className="space-y-2">
              {assertions.map((a, index) => (
                <div key={index} className="rounded-md border border-[color:var(--ds-node-border-color)] bg-[color:var(--ds-node-bg-elevated)] p-2">
                  <Space.Compact block>
                    <Select
                      allowClear
                      showSearch
                      dropdownRender={(menu) => (
                        <>
                          {menu}
                          {knownVars.length === 0 && (
                            <div style={{ padding: '4px 8px', color: 'var(--ds-node-text-muted)', fontSize: 11 }}>
                              {t('flow.nodeConfig.editor.noKnownVars')}
                            </div>
                          )}
                        </>
                      )}
                      mode={undefined}
                      options={varOptions}
                      placeholder={t('flow.nodeConfig.editor.variablePlaceholder')}
                      size="small"
                      style={{ width: '40%' }}
                      value={a.variable || undefined}
                      onChange={(val) => { handleUpdate(index, 'variable', val) }}
                    />
                    <Select
                      options={OPERATOR_OPTIONS.map((o) => ({ value: o.value, label: translateKey(o.labelKey) }))}
                      size="small"
                      style={{ width: '30%' }}
                      value={a.operator}
                      onChange={(val) => { handleUpdate(index, 'operator', val) }}
                    />
                    {showExpected(a.operator) && (
                      <Input
                        placeholder={t('flow.nodeConfig.editor.expectedPlaceholder')}
                        size="small"
                        style={{ width: '30%' }}
                        value={a.expected ?? ''}
                        onChange={(e) => { handleUpdate(index, 'expected', e.target.value) }}
                      />
                    )}
                    <Button
                      danger
                      icon={<Trash2 size={14} />}
                      size="small"
                      style={{ width: 28, flexShrink: 0 }}
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
