import { useMemo, useState } from 'react'
import { Input, Badge, Tag } from 'antd'
import { Search, CircleDot, Circle, CircleCheck, CircleX, MinusCircle, AlertCircle } from 'lucide-react'
import { useFlowStore } from '../store/useFlowStore'
import { globalFlowInstanceRef } from '../contexts/FlowInstanceContext'
import { FlowNodeType as NT, type FlowNodeType, type NodeExecStatus } from '../types/flow.types'

const { Search: SearchInput } = Input

// ==================== 节点类型中文名 ====================

const NODE_TYPE_LABELS: Record<FlowNodeType, string> = {
  start: '开始',
  end: '结束',
  httpRequest: 'HTTP 请求',
  condition: '条件',
  loop: '循环',
  parallel: '并行',
  wait: '等待',
  setVariable: '变量赋值',
  assert: '断言',
  subFlow: '子流程',
}

const NODE_TYPE_ORDER: FlowNodeType[] = [
  NT.Start, NT.End, NT.HttpRequest, NT.Assert,
  NT.Condition, NT.Loop, NT.Parallel, NT.Wait,
  NT.SetVariable, NT.SubFlow,
]

const STATUS_ICON: Record<NodeExecStatus, typeof Circle> = {
  idle: Circle,
  running: CircleDot,
  passed: CircleCheck,
  failed: CircleX,
  skipped: MinusCircle,
  error: AlertCircle,
}

const STATUS_COLOR: Record<NodeExecStatus, string> = {
  idle: 'var(--ds-node-text-muted, #9ca3af)',
  running: 'var(--ds-highlight-selected, #3b82f6)',
  passed: 'var(--ds-success-color, #22c55e)',
  failed: 'var(--ds-error-color, #ef4444)',
  skipped: 'var(--ds-node-text-muted, #9ca3af)',
  error: 'var(--ds-error-color, #ef4444)',
}

// ==================== 组件 ====================

export default function NodeOutlinePanel() {
  const [search, setSearch] = useState('')
  const nodes = useFlowStore((s) => s.nodes)
  const selectNode = useFlowStore((s) => s.selectNode)

  const handleNodeClick = (nodeId: string) => {
    selectNode(nodeId)
    const instance = globalFlowInstanceRef.current
    if (instance) {
      const node = instance.getNode(nodeId)
      if (node) {
        const x = node.position.x + (node.measured?.width ?? 100) / 2
        const y = node.position.y + (node.measured?.height ?? 50) / 2
        instance.setCenter(x, y, { zoom: 1.5, duration: 300 })
      }
    }
  }

  const groupedNodes = useMemo(() => {
    const searchLower = search.toLowerCase()
    const groups: Array<{ type: FlowNodeType; items: typeof nodes }> = []

    for (const type of NODE_TYPE_ORDER) {
      const items = nodes.filter((n) => {
        if (n.type !== type) return false
        if (searchLower) {
          const label = ((n.data?.label as string) ?? '').toLowerCase()
          return label.includes(searchLower)
        }
        return true
      })
      if (items.length > 0) {
        groups.push({ type, items })
      }
    }

    return groups
  }, [nodes, search])

  const totalFiltered = groupedNodes.reduce((sum, g) => sum + g.items.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 8px 4px' }}>
        <SearchInput
          size="small"
          placeholder="搜索节点..."
          allowClear
          prefix={<Search size={12} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ fontSize: 12 }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
        {groupedNodes.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--ds-node-text-muted, #9ca3af)', fontSize: 12 }}>
            {nodes.length === 0 ? '画布为空' : '无匹配节点'}
          </div>
        ) : (
          groupedNodes.map(({ type, items }) => (
            <div key={type} style={{ marginBottom: 4 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--ds-node-text-secondary, #6b7280)',
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                {NODE_TYPE_LABELS[type]}
                <Badge count={items.length} size="small" style={{ backgroundColor: 'var(--ds-node-text-muted, #9ca3af)' }} />
              </div>
              {items.map((node) => {
                const label = (node.data?.label as string) ?? node.id
                const execStatus = (node.data?.execStatus as NodeExecStatus) || 'idle'
                const StatusIcon = STATUS_ICON[execStatus]
                return (
                  <div
                    key={node.id}
                    onClick={() => handleNodeClick(node.id)}
                    style={{
                      padding: '3px 6px 3px 12px',
                      cursor: 'pointer',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      borderRadius: 4,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--ds-bg-elevated, #f0f0f0)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <StatusIcon size={10} color={STATUS_COLOR[execStatus]} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    {execStatus !== 'idle' && (
                      <Tag
                        color={STATUS_COLOR[execStatus]}
                        style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}
                      >
                        {execStatus}
                      </Tag>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--ds-node-text-muted, #9ca3af)', borderTop: 'var(--ds-divider-color, 1px solid #f0f0f0)' }}>
        共 {nodes.length} 个节点{search && ` · 显示 ${totalFiltered} 个`}
      </div>
    </div>
  )
}
