import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { Collapse, Typography } from 'antd'

import { MonacoEditor } from '@/components/MonacoEditor/MonacoEditor'

import type { AssertNodeData } from '../../types/flow.types'

import type { PanelProps } from './shared/panelRegistry'
import VariableAssertionListEditor, { type VariableAssertion } from './shared/VariableAssertionListEditor'

const { Text } = Typography

// ==================== 组件 ====================

export default function AssertNodePanel({ data, onChange }: PanelProps<AssertNodeData>) {
  const { t } = useTranslation()

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
      label: t('flow.nodeConfig.assert.variableRules'),
      children: (
        <VariableAssertionListEditor
          assertions={(data.assertions as unknown as VariableAssertion[]) || []}
          onChange={handleAssertionsChange}
        />
      ),
    },
    {
      key: 'script',
      label: t('flow.nodeConfig.assert.scriptRules'),
      children: (
        <div>
          <Text className="mb-2 block text-xs" type="secondary">
            {t('flow.nodeConfig.assert.scriptHint')}
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
            {t('flow.nodeConfig.assert.example')}
          </Text>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Text className="block text-xs" type="secondary">
        {t('flow.nodeConfig.assert.title')}
      </Text>
      <Collapse defaultActiveKey={['variableAssertions']} items={collapseItems} size="small" />
    </div>
  )
}
