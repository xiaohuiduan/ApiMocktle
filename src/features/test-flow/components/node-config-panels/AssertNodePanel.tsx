import { useCallback } from 'react'
import { Collapse, Typography } from 'antd'
import type { PanelProps } from './shared/panelRegistry'
import type { AssertNodeData } from '../../types/flow.types'
import VariableAssertionListEditor, { type VariableAssertion } from './shared/VariableAssertionListEditor'
import { MonacoEditor } from '@/components/MonacoEditor/MonacoEditor'

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
      onChange({ script: String(value || '') })
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
          <Text type="secondary" className="block text-xs mb-2">
            使用 pm.test() / pm.expect() 编写自定义断言，可访问 variables 对象
          </Text>
          <MonacoEditor
            value={data.script || ''}
            onChange={handleScriptChange}
            language="javascript"
            height="180px"
            options={{
              minimap: { enabled: false },
              lineNumbers: 'on',
              folding: true,
            }}
          />
          <Text type="secondary" className="block text-xs mt-2" style={{ color: '#94a3b8' }}>
            示例: pm.test('token已获取', () =&gt; {'{'} pm.expect(variables.token).toBeDefined() {'}'})
          </Text>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Text type="secondary" className="block text-xs">
        断言验证（检查变量值）
      </Text>
      <Collapse items={collapseItems} defaultActiveKey={['variableAssertions']} size="small" />
    </div>
  )
}
