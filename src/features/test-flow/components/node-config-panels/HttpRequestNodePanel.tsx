import { useCallback, useEffect, useRef, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'
import { Collapse, Select, Spin, Tabs, Typography } from 'antd'

import { MonacoEditor, type MonacoEditorRef } from '@/components/MonacoEditor/MonacoEditor'
import { useAuth } from '@/contexts/auth'
import { useApiMenu } from '@/hooks/useApiMenu'
import type { TestAssertion, TestExtractor } from '@/types'
import { serialize } from '@/utils'

import type { HttpRequestNodeData } from '../../types/flow.types'
import type { MockRule } from '../../types/mock.types'

import AssertionListEditor from './shared/AssertionListEditor'
import ExtractorListEditor from './shared/ExtractorListEditor'
import KVEditor, { type KVPair } from './shared/KVEditor'
import MockRuleEditor from './shared/MockRuleEditor'
import type { PanelProps } from './shared/panelRegistry'

const { Text } = Typography

/** 标签后有数据时显示绿色 * */
function LabelWithBadge({ label, hasData }: { label: string, hasData: boolean }) {
  return (
    <span>
      {label}
      {hasData && <span style={{ color: 'var(--ds-success-color)', marginLeft: 3, fontSize: 14, lineHeight: 1 }}>*</span>}
    </span>
  )
}

// ==================== requestOverride 结构 ====================
// 后端期望的格式:
// { headers: [{name, value}], queryParams: [{name, value}], pathParams: [{name, value}], body: {type, json} }

interface RequestOverride {
  headers?: KVPair[]
  queryParams?: KVPair[]
  pathParams?: KVPair[]
  body?: { type: string, json?: unknown }
}

function getOverride(override: unknown): RequestOverride {
  if (!override || typeof override !== 'object') { return {} }

  return override as RequestOverride
}

// ==================== 组件 ====================

export default function HttpRequestNodePanel({ data, onChange, projectId }: PanelProps<HttpRequestNodeData>) {
  const { sessionId } = useAuth()
  const { items: apiMenuItems, loading: loadingMenu } = useApiMenu(projectId)
  const override = getOverride(data.requestOverride)
  const bodyEditorRef = useRef<MonacoEditorRef>(null)
  const lastBodyRef = useRef<unknown>(undefined)

  // 加载项目环境（用于 Mock Agent 发现）
  const [, setEnvironments] = useState<{ name: string, agentUrl?: string }[]>([])
  useEffect(() => {
    if (!sessionId || !projectId) { return }

    const fetchEnvs = async () => {
      try {
        const result = await invoke<{ ok: boolean, data?: { environments: { name: string, agentUrl?: string }[] } }>(
          'get_project_environments',
          { sessionId, projectId },
        )

        if (result.ok && result.data) {
          setEnvironments(result.data.environments || [])
        }
      }
      catch { /* ignore */ }
    }

    fetchEnvs()
  }, [sessionId, projectId])

  // Sync body editor when external value changes (e.g. different API selected)
  useEffect(() => {
    const currentBody = override.body?.json

    if (lastBodyRef.current !== currentBody) {
      lastBodyRef.current = currentBody
      const editor = bodyEditorRef.current?.editor

      if (editor) {
        // 字符串类型直接显示原文，避免 serialize 再包装成 JSON 字符串
        const newVal = currentBody != null
          ? (typeof currentBody === 'string' ? currentBody : serialize(currentBody, 2))
          : ''

        if (editor.getValue() !== newVal) {
          editor.setValue(newVal)
        }
      }
    }
  })

  // 更新 menuItemId
  const handleMenuItemChange = useCallback(
    (value: string) => {
      onChange({ menuItemId: value })
    },
    [onChange],
  )

  // ====== requestOverride 各部分更新 ======

  const updateOverride = useCallback(
    (partial: Partial<RequestOverride>) => {
      const current = getOverride(data.requestOverride)
      const next = { ...current, ...partial }
      // 如果全部为空则清除
      const isEmpty = !next.headers?.length && !next.queryParams?.length && !next.pathParams?.length && !next.body
      onChange({ requestOverride: isEmpty ? undefined : next })
    },
    [data.requestOverride, onChange],
  )

  const handleHeadersChange = useCallback(
    (pairs: KVPair[]) => { updateOverride({ headers: pairs.length > 0 ? pairs : undefined }) },
    [updateOverride],
  )

  const handleQueryChange = useCallback(
    (pairs: KVPair[]) => { updateOverride({ queryParams: pairs.length > 0 ? pairs : undefined }) },
    [updateOverride],
  )

  const handlePathChange = useCallback(
    (pairs: KVPair[]) => { updateOverride({ pathParams: pairs.length > 0 ? pairs : undefined }) },
    [updateOverride],
  )

  const handleBodyChange = useCallback(
    (value: unknown) => {
      try {
        const parsed = value ? JSON.parse(String(value)) : undefined
        updateOverride({ body: parsed ? { type: 'json', json: parsed } : undefined })
      }
      catch {
        // JSON 无效时保留原文
        updateOverride({ body: { type: 'json', json: String(value) } })
      }
    },
    [updateOverride],
  )

  // ====== 脚本和断言 ======

  const handlePreScriptChange = useCallback(
    (value: unknown) => { onChange({ preScript: String(value ?? '') }) },
    [onChange],
  )

  const handlePostScriptChange = useCallback(
    (value: unknown) => { onChange({ postScript: String(value ?? '') }) },
    [onChange],
  )

  const handleAssertionsChange = useCallback(
    (assertions: TestAssertion[]) => { onChange({ assertions }) },
    [onChange],
  )

  const handleExtractorsChange = useCallback(
    (extractors: TestExtractor[]) => { onChange({ extractors }) },
    [onChange],
  )

  const handleMockRulesChange = useCallback(
    (rules: MockRule[]) => { onChange({ mockRules: rules }) },
    [onChange],
  )

  // ====== Select 选项 ======

  const menuOptions = apiMenuItems.map((item) => ({
    value: item.id,
    label: `${item.method.toUpperCase()} ${item.path} - ${item.name}`,
  }))

  // ====== 折叠面板配置 ======

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- falsy 链语义（长度 0 也回退到 body）
  const hasOverride = !!(override.headers?.length || override.queryParams?.length || override.pathParams?.length || override.body)

  const collapseItems = [
    {
      key: 'requestOverride',
      label: <LabelWithBadge hasData={hasOverride} label="请求覆盖（可选）" />,
      children: (
        <Tabs
          defaultActiveKey="query"
          items={[
            {
              key: 'query',
              label: <LabelWithBadge hasData={(override.queryParams?.length ?? 0) > 0} label="Query" />,
              children: (
                <KVEditor
                  namePlaceholder="参数名"
                  value={override.queryParams ?? []}
                  valuePlaceholder="参数值（支持 {{变量}}）"
                  onChange={handleQueryChange}
                />
              ),
            },
            {
              key: 'header',
              label: <LabelWithBadge hasData={(override.headers?.length ?? 0) > 0} label="Header" />,
              children: (
                <KVEditor
                  namePlaceholder="Header 名"
                  value={override.headers ?? []}
                  valuePlaceholder="Header 值（支持 {{变量}}）"
                  onChange={handleHeadersChange}
                />
              ),
            },
            {
              key: 'path',
              label: <LabelWithBadge hasData={(override.pathParams?.length ?? 0) > 0} label="Path" />,
              children: (
                <div>
                  <Text style={{ display: 'block', fontSize: 11, marginBottom: 8 }} type="secondary">
                    替换路径中的 {'{param}'} 占位符
                  </Text>
                  <KVEditor
                    namePlaceholder="参数名"
                    value={override.pathParams ?? []}
                    valuePlaceholder="参数值"
                    onChange={handlePathChange}
                  />
                </div>
              ),
            },
            {
              key: 'body',
              label: <LabelWithBadge hasData={!!override.body} label="Body" />,
              children: (
                <div>
                  <Text style={{ display: 'block', fontSize: 11, marginBottom: 4 }} type="secondary">
                    JSON 请求体（支持 {'{{变量}}'} 占位符）
                  </Text>
                  <MonacoEditor
                    ref={bodyEditorRef}
                    useDefaultValue
                    defaultValue={override.body?.json ?? ''}
                    deserializeOnChange={false}
                    height="180px"
                    language="json"
                    options={{ minimap: { enabled: false }, lineNumbers: 'on' }}
                    onChange={handleBodyChange}
                  />
                </div>
              ),
            },
          ]}
          size="small"
        />
      ),
    },
    {
      key: 'preScript',
      label: <LabelWithBadge hasData={!!data.preScript} label="前置脚本（可选）" />,
      children: (
        <div>
          <Text className="mb-2 block text-xs" type="secondary">
            请求发送前执行的 JavaScript 脚本
          </Text>
          <MonacoEditor
            height="150px"
            language="javascript"
            options={{ minimap: { enabled: false }, lineNumbers: 'on' }}
            value={data.preScript ?? ''}
            onChange={handlePreScriptChange}
          />
        </div>
      ),
    },
    {
      key: 'postScript',
      label: <LabelWithBadge hasData={!!data.postScript} label="后置脚本（可选）" />,
      children: (
        <div>
          <Text className="mb-2 block text-xs" type="secondary">
            请求完成后执行。可用: pm.variables.set('key', value)、pm.response.json()、pm.response.status
          </Text>
          <MonacoEditor
            height="150px"
            language="javascript"
            options={{ minimap: { enabled: false }, lineNumbers: 'on' }}
            value={data.postScript ?? ''}
            onChange={handlePostScriptChange}
          />
        </div>
      ),
    },
    {
      key: 'assertions',
      label: <LabelWithBadge hasData={(data.assertions?.length ?? 0) > 0} label="断言（可选）" />,
      children: (
        <AssertionListEditor
          assertions={data.assertions ?? []}
          onChange={handleAssertionsChange}
        />
      ),
    },
    {
      key: 'extractors',
      label: <LabelWithBadge hasData={(data.extractors?.length ?? 0) > 0} label="提取器（可选）" />,
      children: (
        <ExtractorListEditor
          extractors={data.extractors ?? []}
          onChange={handleExtractorsChange}
        />
      ),
    },
    {
      key: 'mockRules',
      label: <LabelWithBadge hasData={(data.mockRules?.length ?? 0) > 0} label={`Mock 依赖（可选）${data.mockRules?.length ? ` · ${data.mockRules.length} 条` : ''}`} />,
      children: (
        <div>
          <Text className="mb-2 block text-xs" type="secondary">
            拦截此请求触发的 Feign/Mapper 调用，返回模拟数据
          </Text>
          <MockRuleEditor
            rules={data.mockRules ?? []}
            onChange={handleMockRulesChange}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Text className="block text-xs" type="secondary">
        HTTP 请求配置
      </Text>

      {/* API 菜单选择 */}
      <div>
        <Text className="mb-1 block text-xs" type="secondary">
          选择 API 接口
        </Text>
        <Select
          showSearch
          data-testid="http-menu-item-select"
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          loading={loadingMenu}
          notFoundContent={loadingMenu ? <Spin size="small" /> : '暂无数据'}
          options={menuOptions}
          placeholder={loadingMenu ? '加载中...' : '选择 API 接口'}
          size="small"
          style={{ width: '100%' }}
          value={data.menuItemId || undefined}
          onChange={handleMenuItemChange}
        />
      </div>

      {/* 其他配置项 */}
      <Collapse
        defaultActiveKey={[]}
        items={collapseItems}
        size="small"
      />
    </div>
  )
}
