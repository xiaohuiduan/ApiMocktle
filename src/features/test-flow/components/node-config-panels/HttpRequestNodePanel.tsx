import { useCallback, useEffect, useRef } from 'react'
import { Select, Collapse, Typography, Spin, Tabs } from 'antd'
import type { PanelProps } from './shared/panelRegistry'
import type { HttpRequestNodeData } from '../../types/flow.types'
import type { TestAssertion, TestExtractor } from '@/types'
import { useApiMenu } from '@/hooks/useApiMenu'
import AssertionListEditor from './shared/AssertionListEditor'
import ExtractorListEditor from './shared/ExtractorListEditor'
import KVEditor, { type KVPair } from './shared/KVEditor'
import { MonacoEditor, type MonacoEditorRef } from '@/components/MonacoEditor/MonacoEditor'
import { serialize } from '@/utils'

const { Text } = Typography

// ==================== requestOverride 结构 ====================
// 后端期望的格式:
// { headers: [{name, value}], queryParams: [{name, value}], pathParams: [{name, value}], body: {type, json} }

interface RequestOverride {
  headers?: KVPair[]
  queryParams?: KVPair[]
  pathParams?: KVPair[]
  body?: { type: string; json?: unknown }
}

function getOverride(override: unknown): RequestOverride {
  if (!override || typeof override !== 'object') return {}
  return override as RequestOverride
}

// ==================== 组件 ====================

export default function HttpRequestNodePanel({ data, onChange, projectId }: PanelProps<HttpRequestNodeData>) {
  const { items: apiMenuItems, loading: loadingMenu } = useApiMenu(projectId)
  const override = getOverride(data.requestOverride)
  const bodyEditorRef = useRef<MonacoEditorRef>(null)
  const lastBodyRef = useRef<unknown>(undefined)

  // Sync body editor when external value changes (e.g. different API selected)
  useEffect(() => {
    const currentBody = override.body?.json
    if (lastBodyRef.current !== currentBody) {
      lastBodyRef.current = currentBody
      const editor = bodyEditorRef.current?.editor
      if (editor) {
        const newVal = currentBody != null ? serialize(currentBody, 2) : ''
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
    (pairs: KVPair[]) => updateOverride({ headers: pairs.length > 0 ? pairs : undefined }),
    [updateOverride],
  )

  const handleQueryChange = useCallback(
    (pairs: KVPair[]) => updateOverride({ queryParams: pairs.length > 0 ? pairs : undefined }),
    [updateOverride],
  )

  const handlePathChange = useCallback(
    (pairs: KVPair[]) => updateOverride({ pathParams: pairs.length > 0 ? pairs : undefined }),
    [updateOverride],
  )

  const handleBodyChange = useCallback(
    (value: unknown) => {
      try {
        const parsed = value ? JSON.parse(String(value)) : undefined
        updateOverride({ body: parsed ? { type: 'json', json: parsed } : undefined })
      } catch {
        // JSON 无效时保留原文
        updateOverride({ body: { type: 'json', json: String(value) } })
      }
    },
    [updateOverride],
  )

  // ====== 脚本和断言 ======

  const handlePreScriptChange = useCallback(
    (value: unknown) => { onChange({ preScript: String(value || '') }) },
    [onChange],
  )

  const handlePostScriptChange = useCallback(
    (value: unknown) => { onChange({ postScript: String(value || '') }) },
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

  // ====== Select 选项 ======

  const menuOptions = apiMenuItems.map((item) => ({
    value: item.id,
    label: `${item.method.toUpperCase()} ${item.path} - ${item.name}`,
  }))

  // ====== 折叠面板配置 ======

  const collapseItems = [
    {
      key: 'requestOverride',
      label: '请求覆盖（可选）',
      children: (
        <Tabs
          size="small"
          defaultActiveKey="query"
          items={[
            {
              key: 'query',
              label: 'Query',
              children: (
                <KVEditor
                  value={override.queryParams || []}
                  onChange={handleQueryChange}
                  namePlaceholder="参数名"
                  valuePlaceholder="参数值（支持 {{变量}}）"
                />
              ),
            },
            {
              key: 'header',
              label: 'Header',
              children: (
                <KVEditor
                  value={override.headers || []}
                  onChange={handleHeadersChange}
                  namePlaceholder="Header 名"
                  valuePlaceholder="Header 值（支持 {{变量}}）"
                />
              ),
            },
            {
              key: 'path',
              label: 'Path',
              children: (
                <div>
                  <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 8 }}>
                    替换路径中的 {'{param}'} 占位符
                  </Text>
                  <KVEditor
                    value={override.pathParams || []}
                    onChange={handlePathChange}
                    namePlaceholder="参数名"
                    valuePlaceholder="参数值"
                  />
                </div>
              ),
            },
            {
              key: 'body',
              label: 'Body',
              children: (
                <div>
                  <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 4 }}>
                    JSON 请求体（支持 {'{{变量}}'} 占位符）
                  </Text>
                  <MonacoEditor
                    ref={bodyEditorRef}
                    defaultValue={override.body?.json || ''}
                    useDefaultValue
                    deserializeOnChange={false}
                    onChange={handleBodyChange}
                    language="json"
                    height="180px"
                    options={{ minimap: { enabled: false }, lineNumbers: 'on' }}
                  />
                </div>
              ),
            },
          ]}
        />
      ),
    },
    {
      key: 'preScript',
      label: '前置脚本（可选）',
      children: (
        <div>
          <Text type="secondary" className="block text-xs mb-2">
            请求发送前执行的 JavaScript 脚本
          </Text>
          <MonacoEditor
            value={data.preScript || ''}
            onChange={handlePreScriptChange}
            language="javascript"
            height="150px"
            options={{ minimap: { enabled: false }, lineNumbers: 'on' }}
          />
        </div>
      ),
    },
    {
      key: 'postScript',
      label: '后置脚本（可选）',
      children: (
        <div>
          <Text type="secondary" className="block text-xs mb-2">
            请求完成后执行。可用: pm.variables.set('key', value)、pm.response.json()、pm.response.status
          </Text>
          <MonacoEditor
            value={data.postScript || ''}
            onChange={handlePostScriptChange}
            language="javascript"
            height="150px"
            options={{ minimap: { enabled: false }, lineNumbers: 'on' }}
          />
        </div>
      ),
    },
    {
      key: 'assertions',
      label: '断言（可选）',
      children: (
        <AssertionListEditor
          assertions={data.assertions || []}
          onChange={handleAssertionsChange}
        />
      ),
    },
    {
      key: 'extractors',
      label: '提取器（可选）',
      children: (
        <ExtractorListEditor
          extractors={data.extractors || []}
          onChange={handleExtractorsChange}
        />
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Text type="secondary" className="block text-xs">
        HTTP 请求配置
      </Text>

      {/* API 菜单选择 */}
      <div>
        <Text type="secondary" className="block text-xs mb-1">
          选择 API 接口
        </Text>
        <Select
          value={data.menuItemId || undefined}
          onChange={handleMenuItemChange}
          options={menuOptions}
          size="small"
          style={{ width: '100%' }}
          showSearch
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
          placeholder={loadingMenu ? '加载中...' : '选择 API 接口'}
          loading={loadingMenu}
          notFoundContent={loadingMenu ? <Spin size="small" /> : '暂无数据'}
          data-testid="http-menu-item-select"
        />
      </div>

      {/* 其他配置项 */}
      <Collapse
        items={collapseItems}
        defaultActiveKey={[]}
        size="small"
      />
    </div>
  )
}
