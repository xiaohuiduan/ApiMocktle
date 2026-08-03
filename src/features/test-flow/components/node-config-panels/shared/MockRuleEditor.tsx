import { useCallback, useEffect, useState } from 'react'

import { ApiOutlined, DeleteOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { Button, Empty, Input, InputNumber, Select, Space, Switch, Tag, Tooltip, Typography } from 'antd'
import { nanoid } from 'nanoid'

import { MonacoEditor } from '@/components/MonacoEditor/MonacoEditor'

import { useFlowStore } from '../../../store/useFlowStore'
import type { AgentClassInfo, AgentDiscoverResult, MockRule } from '../../../types/mock.types'

const { Text } = Typography

// ==================== Props ====================

interface MockRuleEditorProps {
  rules: MockRule[]
  onChange: (rules: MockRule[]) => void
}

// ==================== 组件 ====================

export default function MockRuleEditor({ rules, onChange }: MockRuleEditorProps) {
  const [discoverResult, setDiscoverResult] = useState<AgentDiscoverResult | null>(null)
  const [agentConnected, setAgentConnected] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // 从全局 store 读取 Agent 地址
  const agentUrl = useFlowStore((s) => s.agentUrl)

  // 检查 Agent 连接状态并加载发现结果
  useEffect(() => {
    if (!agentUrl) {
      setAgentConnected(false)
      setDiscoverResult(null)

      return
    }

    const check = async () => {
      try {
        const statusResult = await invoke<{ ok: boolean, data?: { connected: boolean } }>(
          'check_mock_agent_status', { agentUrl },
        )
        setAgentConnected(statusResult.data?.connected ?? false)

        if (statusResult.data?.connected) {
          const result = await invoke<{ ok: boolean, data?: AgentDiscoverResult }>(
            'discover_mock_targets', { agentUrl },
          )

          if (result.data) {
            setDiscoverResult(result.data)
          }
        }
      }
      catch {
        setAgentConnected(false)
      }
    }

    check()
  }, [agentUrl])

  // 检查 Agent 连接状态并加载发现结果
  useEffect(() => {
    if (!agentUrl) {
      setAgentConnected(false)
      setDiscoverResult(null)

      return
    }

    const check = async () => {
      try {
        const statusResult = await invoke<{ ok: boolean, data?: { connected: boolean } }>(
          'check_mock_agent_status', { agentUrl },
        )
        setAgentConnected(statusResult.data?.connected ?? false)

        if (statusResult.data?.connected) {
          const result = await invoke<{ ok: boolean, data?: AgentDiscoverResult }>(
            'discover_mock_targets', { agentUrl },
          )

          if (result.data) {
            setDiscoverResult(result.data)
          }
        }
      }
      catch {
        setAgentConnected(false)
      }
    }

    check()
  }, [agentUrl])

  // 添加规则
  const addRule = useCallback((partial?: Partial<MockRule>) => {
    const newRule: MockRule = {
      id: nanoid(),
      enabled: true,
      targetType: 'feign',
      className: '',
      methodName: '',
      responseTemplate: {},
      ...partial,
    }
    onChange([...rules, newRule])
    setExpandedId(newRule.id)
  }, [rules, onChange])

  // 更新规则
  const updateRule = useCallback((id: string, partial: Partial<MockRule>) => {
    onChange(rules.map((r) => r.id === id ? { ...r, ...partial } : r))
  }, [rules, onChange])

  // 删除规则
  const removeRule = useCallback((id: string) => {
    onChange(rules.filter((r) => r.id !== id))
  }, [rules, onChange])

  // 从发现列表添加
  const addFromDiscovery = useCallback((cls: AgentClassInfo, methodName: string, paramTypes?: string[], returnType?: string) => {
    addRule({
      targetType: guessTargetType(cls.className),
      className: cls.className,
      methodName,
      paramTypes,
      responseClassName: returnType,
      responseTemplate: generateDefaultTemplate(returnType),
    })
  }, [addRule])

  return (
    <div className="space-y-3">
      {/* Agent 连接状态 */}
      <div className="flex items-center gap-2">
        <Tag color={agentConnected ? 'success' : 'default'} icon={<ApiOutlined />}>
          {agentConnected ? 'Agent 已连接' : agentUrl ? 'Agent 未连接' : '添加规则后可在顶部工具栏选择 Agent 环境'}
        </Tag>
      </div>

      {/* 已配置的规则列表 */}
      {rules.length === 0
        ? (
            <Empty
              description="暂无 Mock 规则"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ margin: '16px 0' }}
            />
          )
        : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <MockRuleItem
                  key={rule.id}
                  expanded={expandedId === rule.id}
                  rule={rule}
                  onChange={(partial) => { updateRule(rule.id, partial) }}
                  onDelete={() => { removeRule(rule.id) }}
                  onToggleExpand={() => { setExpandedId(expandedId === rule.id ? null : rule.id) }}
                />
              ))}
            </div>
          )}

      {/* 添加规则按钮 */}
      <Space>
        <Button
          icon={<PlusOutlined />}
          size="small"
          type="dashed"
          onClick={() => { addRule() }}
        >
          添加规则
        </Button>

        {/* 从 Agent 发现列表添加 */}
        {agentConnected && discoverResult && (
          <AddFromDiscoveryButton
            discoverResult={discoverResult}
            onAdd={addFromDiscovery}
          />
        )}

        {/* 刷新 Agent 发现列表 */}
        {agentUrl && (
          <Button
            icon={<ThunderboltOutlined />}
            size="small"
            onClick={() => {
              void (async () => {
                try {
                  const result = await invoke<{ ok: boolean, data?: AgentDiscoverResult }>(
                    'discover_mock_targets', { agentUrl },
                  )

                  if (result.ok && result.data) { setDiscoverResult(result.data) }
                }
                catch { /* ignore */ }
              })()
            }}
          >
            刷新发现
          </Button>
        )}
      </Space>
    </div>
  )
}

// ==================== 单条规则编辑 ====================

interface MockRuleItemProps {
  rule: MockRule
  expanded: boolean
  onToggleExpand: () => void
  onChange: (partial: Partial<MockRule>) => void
  onDelete: () => void
}

function MockRuleItem({ rule, expanded, onToggleExpand, onChange, onDelete }: MockRuleItemProps) {
  const responseStr = typeof rule.responseTemplate === 'string'
    ? rule.responseTemplate
    : JSON.stringify(rule.responseTemplate, null, 2)

  return (
    <div
      style={{
        border: '1px solid var(--ds-node-border-color)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {/* 头部：类名.方法名 + 开关 + 删除 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: rule.enabled ? 'var(--ds-node-bg-elevated)' : 'var(--ds-node-bg)',
          cursor: 'pointer',
          opacity: rule.enabled ? 1 : 0.6,
        }}
        onClick={onToggleExpand}
      >
        <Switch
          checked={rule.enabled}
          size="small"
          onChange={(checked) => { onChange({ enabled: checked }) }}
          onClick={(_, e) => { e.stopPropagation() }}
        />
        <Tag color={targetTypeColor(rule.targetType)} style={{ margin: 0, fontSize: 11 }}>
          {rule.targetType}
        </Tag>
        <Text
          style={{
            flex: 1,
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {rule.className || '(未设置类名)'}{rule.methodName ? `.${rule.methodName}` : ''}
        </Text>
        <Tooltip title="删除">
          <Button
            danger
            icon={<DeleteOutlined />}
            size="small"
            type="text"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
          />
        </Tooltip>
      </div>

      {/* 展开编辑区 */}
      {expanded && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--ds-divider-color)' }}>
          <div className="space-y-2">
            {/* 目标类型 */}
            <div>
              <Text className="mb-1 block text-xs" type="secondary">目标类型</Text>
              <Select
                options={[
                  { value: 'feign', label: 'Feign Client' },
                  { value: 'mapper', label: 'MyBatis Mapper' },
                  { value: 'custom', label: '自定义方法' },
                ]}
                size="small"
                style={{ width: '100%' }}
                value={rule.targetType}
                onChange={(v) => { onChange({ targetType: v }) }}
              />
            </div>

            {/* 类名 */}
            <div>
              <Text className="mb-1 block text-xs" type="secondary">类名（全限定名）</Text>
              <Input
                placeholder="com.example.feign.OrderClient"
                size="small"
                value={rule.className}
                onChange={(e) => { onChange({ className: e.target.value }) }}
              />
            </div>

            {/* 方法名 */}
            <div>
              <Text className="mb-1 block text-xs" type="secondary">方法名</Text>
              <Input
                placeholder="createOrder"
                size="small"
                value={rule.methodName}
                onChange={(e) => { onChange({ methodName: e.target.value }) }}
              />
            </div>

            {/* 返回数据模板 */}
            <div>
              <Text className="mb-1 block text-xs" type="secondary">
                返回数据模板（JSON，支持 {'{{变量}}'} 插值）
              </Text>
              <MonacoEditor
                deserializeOnChange={false}
                height="120px"
                language="json"
                options={{ minimap: { enabled: false }, lineNumbers: 'on' }}
                value={responseStr}
                onChange={(val) => {
                  const str = String(val ?? '')

                  if (!str.trim()) {
                    onChange({ responseTemplate: {} })

                    return
                  }

                  try {
                    onChange({ responseTemplate: JSON.parse(str) })
                  }
                  catch {
                    // JSON 不完整时保留原文，等用户继续输入
                    onChange({ responseTemplate: str })
                  }
                }}
              />
            </div>

            {/* 高级选项 */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Text className="mb-1 block text-xs" type="secondary">模拟延迟 (ms)</Text>
                <InputNumber
                  min={0}
                  placeholder="0"
                  size="small"
                  style={{ width: '100%' }}
                  value={rule.responseDelay}
                  onChange={(v) => { onChange({ responseDelay: v ?? undefined }) }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Text className="mb-1 block text-xs" type="secondary">最大拦截次数</Text>
                <InputNumber
                  min={1}
                  placeholder="不限"
                  size="small"
                  style={{ width: '100%' }}
                  value={rule.maxTimes}
                  onChange={(v) => { onChange({ maxTimes: v ?? undefined }) }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== 从发现列表添加 ====================

interface AddFromDiscoveryButtonProps {
  discoverResult: AgentDiscoverResult
  onAdd: (cls: AgentClassInfo, methodName: string, paramTypes?: string[], returnType?: string) => void
}

function AddFromDiscoveryButton({ discoverResult, onAdd }: AddFromDiscoveryButtonProps) {
  const allClasses = [...discoverResult.feignClients, ...discoverResult.mappers]

  if (allClasses.length === 0) { return null }

  return (
    <Select
      showSearch
      filterOption={(input, option) =>
        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
      options={allClasses.flatMap((cls) =>
        cls.methods.map((m) => ({
          value: `${cls.className}#${m.name}`,
          label: `${cls.displayName}.${m.name}`,
        })),
      )}
      placeholder="从 Agent 发现列表添加"
      size="small"
      style={{ width: 200 }}
      onChange={(value: string) => {
        const [className, methodName] = value.split('#')
        const cls = allClasses.find((c) => c.className === className)
        const method = cls?.methods.find((m) => m.name === methodName)

        if (cls && method) {
          onAdd(cls, method.name, method.paramTypes.length > 0 ? method.paramTypes : undefined, method.returnType)
        }
      }}
    />
  )
}

// ==================== 工具函数 ====================

function guessTargetType(className: string): 'feign' | 'mapper' | 'custom' {
  const lower = className.toLowerCase()

  if (lower.includes('feign') || lower.includes('client')) { return 'feign' }

  if (lower.includes('mapper') || lower.includes('dao') || lower.includes('repository')) { return 'mapper' }

  return 'custom'
}

function targetTypeColor(type: string): string {
  switch (type) {
    case 'feign': return 'blue'

    case 'mapper': return 'green'

    case 'custom': return 'orange'

    default: return 'default'
  }
}

function generateDefaultTemplate(returnType?: string): unknown {
  if (!returnType) { return {} }

  const short = returnType.split('.').pop() ?? returnType
  const base = short.replace(/<.*/, '')

  if (/^(Result|Response|ApiResult|BaseResponse|CommonResult)$/.test(base)) {
    return { code: 200, message: 'success', data: {} }
  }

  if (/^(List|ArrayList|LinkedList|Set|Collection|Array)$/.test(base)) { return [] }

  if (/^(Map|HashMap|LinkedHashMap)$/.test(base)) { return {} }

  return {}
}
