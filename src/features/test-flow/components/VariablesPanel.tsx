import { useTranslation } from 'react-i18next'

import { Tag } from 'antd'

import type { VariableSource } from '../hooks/useFlowExecution'

import { translateKey } from '@/i18n/translate'

// ==================== 样式常量 ====================

/** 变量来源对应的 i18n key（渲染期取词，勿在模块顶层求值） */
const SOURCE_TYPE_LABEL_KEYS: Record<VariableSource['sourceType'], string> = {
  init: 'flow.enum.variableSource.init',
  setVariable: 'flow.enum.variableSource.setVariable',
  preScript: 'flow.enum.variableSource.preScript',
  postScript: 'flow.enum.variableSource.postScript',
  extractor: 'flow.enum.variableSource.extractor',
  loop: 'flow.enum.variableSource.loop',
  system: 'flow.enum.variableSource.system',
}

const SOURCE_TYPE_COLORS: Record<VariableSource['sourceType'], string> = {
  init: '#8b5cf6',
  setVariable: '#3b82f6',
  preScript: '#ec4899',
  postScript: '#f59e0b',
  extractor: '#10b981',
  loop: '#6366f1',
  system: '#6b7280',
}

// ==================== 组件 ====================

interface VariablesPanelProps {
  sources: Record<string, VariableSource>
}

export default function VariablesPanel({ sources }: VariablesPanelProps) {
  const { t } = useTranslation()
  const entries = Object.entries(sources).sort((a, b) => a[1].timestamp - b[1].timestamp)

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ds-node-text-muted)', fontSize: 12 }}>
        {t('flow.variables.empty')}
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 0', overflowY: 'auto', maxHeight: '100%' }}>
      {entries.map(([key, src]) => (
        <div
          key={key}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: '6px 8px',
            borderBottom: '1px solid var(--ds-divider-color)',
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <code style={{ fontWeight: 600, color: 'var(--ds-node-text-primary)', fontSize: 11 }}>{key}</code>
            <Tag
              color={SOURCE_TYPE_COLORS[src.sourceType]}
              style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', margin: 0 }}
            >
              {translateKey(SOURCE_TYPE_LABEL_KEYS[src.sourceType])}
            </Tag>
          </div>
          <div style={{ fontFamily: 'monospace', color: 'var(--ds-node-text-secondary)', fontSize: 11, wordBreak: 'break-all' }}>
            {src.value.length > 100 ? src.value.substring(0, 100) + '...' : src.value}
          </div>
          <div style={{ display: 'flex', gap: 4, color: 'var(--ds-node-text-muted)', fontSize: 10 }}>
            {src.nodeName && <span>{t('flow.variables.nodeName', { name: src.nodeName })}</span>}
            {src.source && <span>· {src.source}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
