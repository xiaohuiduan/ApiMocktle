import { useCallback } from 'react'
import { Input, Collapse, Typography } from 'antd'
import type { PanelProps } from './shared/panelRegistry'
import type { AssertNodeData } from '../../types/flow.types'
import type { TestAssertion } from '@/types'
import AssertionListEditor from './shared/AssertionListEditor'
import { MonacoEditor } from '@/components/MonacoEditor/MonacoEditor'

const { Text } = Typography

// ==================== 组件 ====================

export default function AssertNodePanel({ data, onChange }: PanelProps<AssertNodeData>) {
  // 更新断言列表
  const handleAssertionsChange = useCallback(
    (assertions: TestAssertion[]) => {
      onChange({ assertions })
    },
    [onChange],
  )

  // 更新变量表达式（onBlur 提交）
  const handleVariableExpressionBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      onChange({ variableExpression: e.target.value })
    },
    [onChange],
  )

  // 更新脚本（直接提交，因为 MonacoEditor 的 onChange 是离散的）
  const handleScriptChange = useCallback(
    (value: unknown) => {
      onChange({ script: String(value || '') })
    },
    [onChange],
  )

  // 折叠面板配置
  const collapseItems = [
    {
      key: 'assertions',
      label: '断言规则',
      children: (
        <AssertionListEditor
          assertions={data.assertions || []}
          onChange={handleAssertionsChange}
        />
      ),
    },
    {
      key: 'variableExpression',
      label: '表达式断言',
      children: (
        <div>
          <Text type="secondary" className="block text-xs mb-1">
            求值表达式并断言（可选）
          </Text>
          <Input.TextArea
            defaultValue={data.variableExpression || ''}
            onBlur={handleVariableExpressionBlur}
            placeholder="例如: variables.token.length > 0"
            rows={2}
            size="small"
            data-testid="assert-variable-expression"
          />
        </div>
      ),
    },
    {
      key: 'script',
      label: '脚本断言',
      children: (
        <div>
          <Text type="secondary" className="block text-xs mb-2">
            JavaScript 断言代码（使用 pm.test() 风格）
          </Text>
          <MonacoEditor
            value={data.script || ''}
            onChange={handleScriptChange}
            language="javascript"
            height="150px"
            options={{
              minimap: { enabled: false },
              lineNumbers: 'on',
              folding: true,
            }}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Text type="secondary" className="block text-xs">
        断言配置
      </Text>

      <Collapse
        items={collapseItems}
        defaultActiveKey={['assertions']}
        size="small"
      />
    </div>
  )
}
