import { useCallback } from 'react'

import { Collapse, Typography } from 'antd'

import { MonacoEditor } from '@/components/MonacoEditor/MonacoEditor'

import type { AssertNodeData } from '../../types/flow.types'

import type { PanelProps } from './shared/panelRegistry'
import VariableAssertionListEditor, { type VariableAssertion } from './shared/VariableAssertionListEditor'

const { Text } = Typography

// ==================== 组件 ====================

export default function AssertNodePanel({ data, onChange }: PanelProps<AssertNodeData>) {
  // 更新变量断言列表
  const handleAssertionsChange = useCallback(
    (assertions: VariableAssertion[]) => {
      onChange({ assertions: assertions as any })
    },
    [onChange],
  )

  // 更新脚本断言
  const handleScriptChange = useCallback(
    (value: unknown) => {
      onChange({ script: String(value ?? '') })
    },
    [onChange],
  )

  const collapseItems = [
    {
      key: 'variableAssertions',
      label: '变量断言规则',
      children: (
        <VariableAssertionListEditor
          assertions={(data.assertions as unknown as VariableAssertion[]) || []}
          onChange={handleAssertionsChange}
        />
      ),
    },
    {
      key: 'script',
      label: '脚本断言（高级）',
      children: (
        <div>
          <Text className="mb-2 block text-xs" type="secondary">
            使用 pm.test() / pm.expect() 编写自定义断言，可访问 variables 对象
          </Text>
          <MonacoEditor
            height="180px"
            language="javascript"
            options={{
              minimap: { enabled: false },
              lineNumbers: 'on',
              folding: true,
            }}
            value={data.script ?? ''}
            onChange={handleScriptChange}
          />
          <Text className="mt-2 block text-xs" style={{ color: 'var(--ds-node-text-muted)' }} type="secondary">
            示例: pm.test('token已获取', () =&gt; {'{'} pm.expect(variables.token).toBeDefined() {'}'})
          </Text>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Text className="block text-xs" type="secondary">
        断言验证（检查变量值）
      </Text>
      <Collapse defaultActiveKey={['variableAssertions']} items={collapseItems} size="small" />
    </div>
  )
}
