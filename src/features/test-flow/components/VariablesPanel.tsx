import { Space, Tag } from 'antd'
import type { VariableSource } from '../hooks/useFlowExecution'

// ==================== 样式常量 ====================

const SOURCE_TYPE_LABELS: Record<VariableSource['sourceType'], string> = {
  init: '环境',
  setVariable: '赋值节点',
  postScript: '后置脚本',
  extractor: '提取器',
  loop: '循环',
  system: '系统',
}

const SOURCE_TYPE_COLORS: Record<VariableSource['sourceType'], string> = {
  init: '#8b5cf6',
  setVariable: '#3b82f6',
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
  const entries = Object.entries(sources).sort((a, b) => a[1].timestamp - b[1].timestamp)

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 12 }}>
        运行流程后此处显示变量
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {entries.map(([key, src]) => (
        <div
          key={key}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: '6px 8px',
            borderBottom: '1px solid #f0f0f0',
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <code style={{ fontWeight: 600, color: '#1f2937', fontSize: 11 }}>{key}</code>
            <Tag
              color={SOURCE_TYPE_COLORS[src.sourceType]}
              style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', margin: 0 }}
            >
              {SOURCE_TYPE_LABELS[src.sourceType]}
            </Tag>
          </div>
          <div style={{ fontFamily: 'monospace', color: '#6b7280', fontSize: 11, wordBreak: 'break-all' }}>
            {src.value.length > 100 ? src.value.substring(0, 100) + '...' : src.value}
          </div>
          <div style={{ display: 'flex', gap: 4, color: '#9ca3af', fontSize: 10 }}>
            {src.nodeName && <span>节点: {src.nodeName}</span>}
            {src.source && <span>· {src.source}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
