import { useEffect, useMemo, useRef, useState } from 'react'

import {
  Button,
  Input,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd'
import { PlayIcon, TerminalIcon } from 'lucide-react'
import { nanoid } from 'nanoid'

import { PageTabStatus } from '@/components/ApiTab/ApiTab.enum'
import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { buildSchemaExample } from '@/components/JsonSchema/schema-normalizer'
import { MonacoEditor } from '@/components/MonacoEditor'
import { HTTP_METHOD_CONFIG } from '@/configs/static'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useMenuTabHelpers } from '@/contexts/menu-tab-settings'
import { BodyType, MenuItemType } from '@/enums'
import type { ApiDetails, ApiRunResult } from '@/types'

import { ParamsEditableTable } from './components/ParamsEditableTable'
import { ResponseBodyViewer } from './components/ResponseBodyViewer'
import { ParamsAuth } from './params/ParamsAuth'
import { ParamsTab } from './params/ParamsTab'
import { useApiRequestRunner } from './useApiRequestRunner'

function buildBodyExample(apiDetails: ApiDetails, menuRawList?: unknown): string {
  const body = apiDetails.requestBody
  if (!body || body.type === BodyType.None) return ''
  if (body.jsonSchema) {
    const example = buildSchemaExample(body.jsonSchema as never, menuRawList as never)
    return JSON.stringify(example, null, 2)
  }
  if (body.rawText?.trim()) return body.rawText
  return ''
}

function buildBodyFillText(apiDetails: ApiDetails, menuRawList?: unknown): string {
  const body = apiDetails.requestBody
  if (!body || body.type === BodyType.None) return ''
  if (body.jsonSchema) {
    const example = buildSchemaExample(body.jsonSchema as never, menuRawList as never)
    return JSON.stringify(example, null, 2)
  }
  if (body.rawText?.trim()) return body.rawText
  return JSON.stringify({}, null, 2)
}

function getStatusColor(code: number) {
  if (code >= 500) return 'error'
  if (code >= 400) return 'warning'
  if (code >= 300) return 'processing'
  return 'success'
}

function detectLanguage(contentType?: string): string {
  if (!contentType) return 'plaintext'
  const ct = contentType.toLowerCase()
  if (ct.includes('json')) return 'json'
  if (ct.includes('html')) return 'html'
  if (ct.includes('xml')) return 'xml'
  if (ct.includes('javascript')) return 'javascript'
  if (ct.includes('css')) return 'css'
  return 'plaintext'
}

function calcBodySize(body?: string): string {
  if (!body) return ''
  const bytes = new Blob([body]).size
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}KB`
}

const headerTableColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name', width: 200 },
  { title: 'Value', dataIndex: 'value', key: 'value' },
]

const bodyTypeOptions = [
  { n: 'none', t: BodyType.None },
  { n: 'form-data', t: BodyType.FormData },
  { n: 'url-encoded', t: BodyType.UrlEncoded },
  { n: 'json', t: BodyType.Json },
  { n: 'xml', t: BodyType.Xml },
  { n: 'raw', t: BodyType.Raw },
  { n: 'binary', t: BodyType.Binary },
]

const DEFAULT_METHOD = 'GET'

function createEmptyApiDetails(): ApiDetails {
  return {
    id: nanoid(6),
    method: DEFAULT_METHOD as ApiDetails['method'],
    path: '',
    name: '快捷请求',
    status: 'developing' as ApiDetails['status'],
    serverId: '',
    serverUrl: '',
    parameters: {
      query: [],
      header: [],
      path: [],
      cookie: [],
    },
    requestBody: { type: BodyType.None },
    auth: undefined,
    responses: [],
    responseExamples: [],
  }
}

export function QuickRequestRun() {
  const { token } = theme.useToken()
  const { tabData } = useTabContentContext()
  const { messageApi } = useGlobalContext()
  const { menuRawList, addMenuItem, updateMenuItem } = useMenuHelpersContext()
  const { addTabItem } = useMenuTabHelpers()

  const isCreating = tabData.data?.tabStatus === PageTabStatus.Create

  const menuItem = useMemo(() => {
    return menuRawList?.find(({ id }) => id === tabData.key)
  }, [menuRawList, tabData.key])

  const savedData = menuItem?.data as ApiDetails | undefined

  const [workCopy, setWorkCopy] = useState<ApiDetails>(() => {
    if (savedData) return JSON.parse(JSON.stringify(savedData)) as ApiDetails
    return createEmptyApiDetails()
  })

  const [bodyRawText, setBodyRawText] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (savedData && !isCreating) {
      setWorkCopy(JSON.parse(JSON.stringify(savedData)) as ApiDetails)
      setBodyRawText(undefined)
    }
  }, [savedData?.id, isCreating])

  const { run, running, result, error, resetResult } = useApiRequestRunner()

  const methodOptions = useMemo(() =>
    Object.entries(HTTP_METHOD_CONFIG).map(([method, { color }]) => ({
      value: method,
      label: <span style={{ color: `var(${color})`, fontWeight: 700 }}>{method}</span>,
    })), [])

  // Build full URL for running
  const buildRunUrl = () => {
    const path = workCopy.path ?? '/'
    const queryParams = (workCopy.parameters?.query ?? [])
      .filter(p => p.name && p.enable !== false)
      .map(p => `${encodeURIComponent(p.name!)}=${encodeURIComponent(String(p.example ?? ''))}`)
      .join('&')
    return queryParams ? `${path}${path.includes('?') ? '&' : '?'}${queryParams}` : path
  }

  const handleRun = async () => {
    const url = buildRunUrl()

    const headers = (workCopy.parameters?.header ?? [])
      .filter(h => h.name && h.enable !== false)
      .map(h => ({ name: h.name!, value: String(h.example ?? '') }))

    const body = workCopy.requestBody
    let bodyText = ''
    let contentType: string | undefined
    let formDataFiles: Array<{ name: string, path: string }> | undefined

    if (body && body.type !== BodyType.None) {
      if (body.type === BodyType.Json || body.type === BodyType.Xml || body.type === BodyType.Raw) {
        const raw = bodyRawText !== undefined ? bodyRawText : buildBodyExample(workCopy, menuRawList)
        bodyText = raw
        contentType = body.type === BodyType.Xml ? 'application/xml'
          : body.type === BodyType.Raw ? 'text/plain'
          : 'application/json'
      } else if (body.type === BodyType.FormData || body.type === BodyType.UrlEncoded) {
        const allParams = (body.parameters ?? []).map(p => ({
          name: p.name,
          enable: p.enable,
          example: p.example,
          type: p.type,
          filePath: (p as any).filePath,
        }))

        const textParams: Array<{ name: string, example: string }> = []
        const fileParams: Array<{ name: string, path: string }> = []

        for (const p of allParams) {
          if (!p.name || p.enable === false) continue
          if (p.type === 'file') {
            const filePath = p.filePath
            if (filePath) {
              fileParams.push({ name: p.name, path: filePath })
            }
          } else {
            textParams.push({ name: p.name, example: String(p.example ?? '') })
          }
        }

        bodyText = textParams
          .map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.example)}`)
          .join('&')
        contentType = body.type === BodyType.FormData ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
        formDataFiles = fileParams.length > 0 ? fileParams : undefined
      }
    }

    // Apply auth to headers/query
    const auth = workCopy.auth
    if (auth) {
      if (auth.type === 'bearer' && auth.token) {
        headers.push({ name: 'Authorization', value: `Bearer ${auth.token}` })
      } else if (auth.type === 'basic' && auth.username) {
        const basic = btoa(`${auth.username}:${auth.password ?? ''}`)
        headers.push({ name: 'Authorization', value: `Basic ${basic}` })
      } else if (auth.type === 'apiKey' && auth.key && auth.value) {
        if (auth.target === 'header') {
          headers.push({ name: auth.key, value: auth.value })
        }
      }
    }

    await run(url, workCopy.method ?? DEFAULT_METHOD, headers, bodyText, contentType, formDataFiles)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const menuName = workCopy.name || '快捷请求'
      if (isCreating) {
        const menuItemId = nanoid(6)
        addMenuItem({
          id: menuItemId,
          name: menuName,
          type: MenuItemType.HttpRequest,
          data: { ...workCopy, name: menuName },
        })
        addTabItem(
          {
            key: menuItemId,
            label: menuName,
            contentType: MenuItemType.HttpRequest,
          },
          { replaceTab: tabData.key },
        )
      } else {
        await updateMenuItem({
          id: tabData.key,
          name: menuName,
          data: { ...workCopy, name: menuName },
        })
        messageApi.success('保存成功')
      }
    } catch {
      messageApi.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleFillBody = () => {
    const text = buildBodyFillText(workCopy, menuRawList)
    setBodyRawText(text)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* URL 行 */}
      <div className="flex items-center gap-2 px-3 py-2 min-w-0" style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Select
          className="shrink-0"
          style={{ minWidth: 90 }}
          options={methodOptions}
          popupMatchSelectWidth={false}
          value={workCopy.method ?? DEFAULT_METHOD}
          onChange={(method) => {
            setWorkCopy((prev) => ({ ...prev, method }))
          }}
        />

        <div
          className="flex items-center rounded border px-2 min-w-0"
          style={{
            backgroundColor: token.colorFillQuaternary,
            borderColor: token.colorBorderSecondary,
            flex: 1,
          }}
        >
          <Input
            bordered={false}
            className="flex-1 min-w-0"
            placeholder="输入完整 URL，如 https://api.example.com/users"
            value={workCopy.path ?? ''}
            onChange={(e) => {
              setWorkCopy((prev) => ({ ...prev, path: e.target.value }))
            }}
          />
        </div>

        <Space.Compact className="shrink-0">
          <Button
            loading={running}
            type="primary"
            icon={<PlayIcon size={14} />}
            onClick={() => void handleRun()}
          >
            运行
          </Button>
          <Button
            loading={saving}
            onClick={() => void handleSave()}
          >
            保存
          </Button>
        </Space.Compact>
      </div>

      {/* 参数编辑区 */}
      <div className="flex-1 overflow-auto">
        <div className="px-3">
          <ParamsTab
            value={workCopy.parameters}
            onChange={(parameters) => {
              setWorkCopy((prev) => ({ ...prev, parameters }))
            }}
          />
        </div>

        {/* Body 编辑区 */}
        <div className="px-3 pb-3">
          <div className="mb-2 flex items-center justify-between">
            <Typography.Text strong className="text-sm">Body</Typography.Text>
            {((workCopy.requestBody?.type === BodyType.Json
              || workCopy.requestBody?.type === BodyType.Xml
              || workCopy.requestBody?.type === BodyType.Raw)) && (
                <Button size="small" onClick={handleFillBody}>一键填充</Button>
            )}
          </div>
          {(() => {
            const body = workCopy.requestBody || { type: BodyType.None }
            const showEditor = body.type === BodyType.Json
              || body.type === BodyType.Xml
              || body.type === BodyType.Raw

            return (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-1">
                  {bodyTypeOptions.map(({ n, t }) => {
                    const hasContent = t === BodyType.FormData || t === BodyType.UrlEncoded
                      ? (body.parameters ?? []).some(p => p.name && p.enable !== false)
                      : t === BodyType.Json || t === BodyType.Xml
                        ? !!((body.jsonSchema as { properties?: unknown[] })?.properties?.length)
                        : t === BodyType.Raw || t === BodyType.Binary
                          ? !!(body.rawText?.trim())
                          : false
                    return (
                      <Tag.CheckableTag
                        key={t}
                        checked={body.type === t}
                        onChange={(checked) => {
                          if (checked) {
                            setWorkCopy((prev) => ({
                              ...prev,
                              requestBody: { ...(prev.requestBody || { type: BodyType.None }), type: t },
                            }))
                          }
                        }}
                      >
                        {n}
                        {hasContent && <span style={{ color: token.colorSuccess, marginLeft: 1 }}>*</span>}
                      </Tag.CheckableTag>
                    )
                  })}
                </div>

                {showEditor && (
                  <div className="rounded border-solid" style={{ borderWidth: 3, borderColor: 'rgb(245, 245, 245)' }}>
                    <MonacoEditor
                      height="200px"
                      language={
                        body.type === BodyType.Xml ? 'xml'
                          : body.type === BodyType.Raw ? 'plaintext'
                          : 'json'
                      }
                      deserializeOnChange={false}
                      value={bodyRawText !== undefined ? bodyRawText : buildBodyExample(workCopy, menuRawList)}
                      onChange={(val) => {
                        setBodyRawText(typeof val === 'string' ? val : '')
                      }}
                      options={{ readOnly: false }}
                      onMount={(editor, monaco) => {
                        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true })
                        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true })
                      }}
                    />
                  </div>
                )}

                {(body.type === BodyType.FormData || body.type === BodyType.UrlEncoded) && (
                  <div>
                    <Typography.Text type="secondary" className="mb-2 block text-xs">
                      {body.type === BodyType.FormData ? 'form-data' : 'x-www-form-urlencoded'} 参数
                    </Typography.Text>
                    <ParamsEditableTable
                      value={body.parameters}
                      onChange={(parameters) => {
                        setWorkCopy((prev) => ({
                          ...prev,
                          requestBody: { ...(prev.requestBody || { type: BodyType.None }), parameters },
                        }))
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Auth 编辑区 */}
        <div className="px-3 pb-3">
          <Typography.Text strong className="mb-2 block text-sm">Auth</Typography.Text>
          <ParamsAuth
            value={workCopy.auth}
            onChange={(auth) => {
              setWorkCopy((prev) => ({ ...prev, auth }))
            }}
          />
        </div>

        {/* 运行结果 */}
        {(result || error) && (
          <div className="border-t px-3 py-3" style={{ borderColor: token.colorBorderSecondary }}>
            {error && !result
              ? (
                  <>
                    <Typography.Text strong className="mb-2 block">运行结果</Typography.Text>
                    <Typography.Text type="danger">{error}</Typography.Text>
                  </>
                )
              : result
                ? (
                    <>
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <Tag color={getStatusColor(result.status)}>{result.status} {result.statusText}</Tag>
                        <span className="text-xs opacity-50">
                          {result.method?.toUpperCase()} | {result.durationMs}ms
                          {result.body ? ` | ${calcBodySize(result.body)}` : ''}
                        </span>
                      </div>

                      <Tabs
                        size="small"
                        className="mb-3"
                        items={[
                          {
                            key: 'reqContent',
                            label: '请求内容',
                            children: (
                              <div className="flex flex-col gap-2">
                                <div className="rounded bg-gray-50 p-2 text-xs" style={{ fontFamily: 'monospace' }}>
                                  <span className="font-medium opacity-60">URL: </span>
                                  <span className="break-all">{result.url ?? '-'}</span>
                                </div>
                                {result.requestBodyText && (
                                  <MonacoEditor
                                    height={`${Math.min((result.requestBodyText.split('\n').length) * 18, 300)}px`}
                                    language={detectLanguage(result.contentType)}
                                    value={result.requestBodyText}
                                    options={{ readOnly: true, lineNumbers: 'on', minimap: { enabled: false }, scrollBeyondLastLine: false }}
                                  />
                                )}
                                {result.requestBodyParameters && result.requestBodyParameters.length > 0 && (
                                  <Table
                                    size="small"
                                    dataSource={result.requestBodyParameters}
                                    columns={headerTableColumns}
                                    pagination={false}
                                    rowKey="name"
                                  />
                                )}
                                {!result.requestBodyText && (!result.requestBodyParameters || result.requestBodyParameters.length === 0) && (
                                  <Typography.Text type="secondary" className="text-xs">无请求体</Typography.Text>
                                )}
                              </div>
                            ),
                          },
                          {
                            key: 'reqHeaders',
                            label: `请求头${result.requestHeaders?.length ? ` (${result.requestHeaders.length})` : ''}`,
                            children: result.requestHeaders && result.requestHeaders.length > 0
                              ? (
                                  <Table
                                    size="small"
                                    dataSource={result.requestHeaders}
                                    columns={headerTableColumns}
                                    pagination={false}
                                    rowKey="name"
                                  />
                                )
                              : <Typography.Text type="secondary" className="text-xs">无请求头</Typography.Text>,
                          },
                          {
                            key: 'resContent',
                            label: '响应内容',
                            children: result.body != null
                              ? (
                                  <ResponseBodyViewer
                                    body={result.body}
                                    contentType={result.contentType}
                                  />
                                )
                              : <Typography.Text type="secondary" className="text-xs">无响应体</Typography.Text>,
                          },
                          {
                            key: 'resHeaders',
                            label: `响应头${result.headers?.length ? ` (${result.headers.length})` : ''}`,
                            children: result.headers && result.headers.length > 0
                              ? (
                                  <Table
                                    size="small"
                                    dataSource={result.headers}
                                    columns={headerTableColumns}
                                    pagination={false}
                                    rowKey="name"
                                  />
                                )
                              : <Typography.Text type="secondary" className="text-xs">无响应头</Typography.Text>,
                          },
                          {
                            key: 'curl',
                            label: (
                              <span className="flex items-center gap-1">
                                <TerminalIcon size={14} />
                                cURL
                              </span>
                            ),
                            children: (
                              <pre className="m-0 rounded bg-gray-100 p-2 text-xs overflow-auto" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {`curl -X ${workCopy.method ?? DEFAULT_METHOD} "${buildRunUrl()}"`}
                              </pre>
                            ),
                          },
                        ]}
                      />
                    </>
                  )
                : null}
          </div>
        )}
      </div>
    </div>
  )
}
