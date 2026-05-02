import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  Button,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd'
import { PlayIcon, RotateCcwIcon, TerminalIcon } from 'lucide-react'

import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { buildSchemaExample } from '@/components/JsonSchema/schema-normalizer'
import { MonacoEditor } from '@/components/MonacoEditor'
import { HTTP_METHOD_CONFIG } from '@/configs/static'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { BodyType } from '@/enums'
import { getPrimaryEnvironmentUrl } from '@/project-environment-utils'
import type { ApiDetails, ApiRunResult } from '@/types'

import { ParamsEditableTable } from './components/ParamsEditableTable'
import { ParamsTab } from './params/ParamsTab'
import { useApiRequestRunner } from './useApiRequestRunner'

const STORAGE_PREFIX = 'run_tab_'

function cloneApiDetails(source: ApiDetails): ApiDetails {
  return JSON.parse(JSON.stringify(source)) as ApiDetails
}

function generateCurl(apiDetails: ApiDetails, fullUrl: string): { windows: string, linux: string } {
  const method = (apiDetails.method ?? 'GET').toUpperCase()
  const headers: string[] = []
  const queryParams: string[] = []

  apiDetails.parameters?.header?.forEach((h) => {
    if (h.name && h.enable !== false) {
      headers.push(`-H "${h.name}: ${String(h.example ?? '')}"`)
    }
  })

  apiDetails.parameters?.query?.forEach((q) => {
    if (q.name && q.enable !== false) {
      queryParams.push(`${encodeURIComponent(q.name)}=${encodeURIComponent(String(q.example ?? ''))}`)
    }
  })

  let targetUrl = fullUrl
  if (queryParams.length > 0) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + queryParams.join('&')
  }

  const headerStr = headers.length > 0 ? ` ${headers.join(' ')}` : ''

  let bodyFlag = ''
  let bodyContent = ''
  if (apiDetails.requestBody && apiDetails.requestBody.type !== BodyType.None) {
    if (apiDetails.requestBody.type === BodyType.Json) {
      bodyFlag = ' -H "Content-Type: application/json"'
      bodyContent = apiDetails.requestBody.rawText?.trim()
        ? ` -d '${apiDetails.requestBody.rawText.replace(/'/g, "'\\''")}'`
        : apiDetails.requestBody.jsonSchema
          ? ` -d '${JSON.stringify(buildSchemaExample(apiDetails.requestBody.jsonSchema as never))}'`
          : ''
    } else if (apiDetails.requestBody.rawText?.trim()) {
      bodyContent = ` -d '${apiDetails.requestBody.rawText.replace(/'/g, "'\\''")}'`
    }
  }

  const cmdLinux = `curl -X ${method}${headerStr}${bodyFlag}${bodyContent} "${targetUrl}"`
  const cmdWindows = `curl -X ${method}${headerStr}${bodyFlag}${bodyContent} "${targetUrl}"`

  return { linux: cmdLinux, windows: cmdWindows }
}

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

export function RunTab() {
  const { token } = theme.useToken()
  const { tabData } = useTabContentContext()
  const { messageApi } = useGlobalContext()
  const {
    menuRawList,
    projectEnvironments,
    currentProjectEnvironmentId,
  } = useMenuHelpersContext()

  const { menuApiItem, docValue } = useMemo(() => {
    const item = menuRawList?.find(({ id }) => id === tabData.key)
    return { menuApiItem: item, docValue: item?.data as ApiDetails | undefined }
  }, [menuRawList, tabData.key])

  const storageKey = docValue ? `${STORAGE_PREFIX}${docValue.id}` : ''

  const { run, running, result, error, resetResult } = useApiRequestRunner()

  const [workCopy, setWorkCopy] = useState<ApiDetails | undefined>(() => {
    if (!docValue) return undefined
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return JSON.parse(saved) as ApiDetails
    } catch { /* ignore */ }
    return cloneApiDetails(docValue)
  })

  const [bodyRawText, setBodyRawText] = useState<string | undefined>(undefined)

  // 用数据库表列的 updatedAt 追踪文档版本（data_json 内部 updatedAt 不会随保存变化）
  const docVersionRef = useRef((menuApiItem as { updatedAt?: string } | undefined)?.updatedAt)

  useEffect(() => {
    if (!docValue) return
    const menuUpdatedAt = (menuApiItem as { updatedAt?: string } | undefined)?.updatedAt
    // 文档有更新时，重新从文档初始化 workCopy
    if (menuUpdatedAt && menuUpdatedAt !== docVersionRef.current) {
      docVersionRef.current = menuUpdatedAt
      setWorkCopy(cloneApiDetails(docValue))
      setBodyRawText(undefined)
      resetResult()
      return
    }
    // 首次加载：有本地副本则恢复，否则从文档初始化
    if (docVersionRef.current === undefined) {
      docVersionRef.current = menuUpdatedAt
      try {
        const saved = localStorage.getItem(`${STORAGE_PREFIX}${docValue.id}`)
        if (saved) {
          setWorkCopy(JSON.parse(saved) as ApiDetails)
          return
        }
      } catch { /* ignore */ }
      setWorkCopy(cloneApiDetails(docValue))
      resetResult()
    }
  }, [(menuApiItem as { updatedAt?: string } | undefined)?.updatedAt])

  const persist = useCallback((copy: ApiDetails) => {
    if (!copy?.id) return
    try { localStorage.setItem(`${STORAGE_PREFIX}${copy.id}`, JSON.stringify(copy)) } catch { /* ignore */ }
  }, [])

  // 当前环境
  const currentEnv = useMemo(() => {
    const envId = workCopy?.serverId || currentProjectEnvironmentId
    return projectEnvironments?.find((e) => e.id === envId)
  }, [workCopy?.serverId, currentProjectEnvironmentId, projectEnvironments])

  const envBaseUrl = useMemo(() => {
    if (!currentEnv) return ''
    return getPrimaryEnvironmentUrl(currentEnv)
  }, [currentEnv])

  // 一键复原
  const handleReset = () => {
    Modal.confirm({
      title: '一键复原',
      content: '确定要放弃所有临时修改，恢复为文档定义的原始值吗？',
      onOk: () => {
        if (!docValue) return
        const fresh = cloneApiDetails(docValue)
        setWorkCopy(fresh)
        setBodyRawText(undefined)
        resetResult()
        try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
        messageApi.success('已复原')
      },
    })
  }

  // 运行
  const handleRun = async () => {
    if (!workCopy) return

    // 构建完整 URL（含 query 参数）
    const base = envBaseUrl ? envBaseUrl.replace(/\/$/, '') : ''
    const path = workCopy.path ?? '/'
    const fullPath = path.startsWith('http://') || path.startsWith('https://')
      ? path
      : base ? `${base}${path}` : path

    const queryParams = (workCopy.parameters?.query ?? [])
      .filter(p => p.name && p.enable !== false)
      .map(p => `${encodeURIComponent(p.name!)}=${encodeURIComponent(String(p.example ?? ''))}`)
      .join('&')
    const url = queryParams ? `${fullPath}${fullPath.includes('?') ? '&' : '?'}${queryParams}` : fullPath

    // 构建 Header
    const headers = (workCopy.parameters?.header ?? [])
      .filter(h => h.name && h.enable !== false)
      .map(h => ({ name: h.name!, value: String(h.example ?? '') }))

    // 构建 Body
    const body = workCopy.requestBody
    let bodyText = ''
    let contentType: string | undefined
    if (body && body.type !== BodyType.None) {
      if (body.type === BodyType.Json || body.type === BodyType.Xml || body.type === BodyType.Raw) {
        bodyText = bodyRawText !== undefined ? bodyRawText : buildBodyExample(workCopy, menuRawList)
        contentType = body.type === BodyType.Xml ? 'application/xml'
          : body.type === BodyType.Raw ? 'text/plain'
          : 'application/json'
      } else if (body.type === BodyType.FormData || body.type === BodyType.UrlEncoded) {
        const params = (body.parameters ?? [])
          .filter(p => p.name && p.enable !== false)
        bodyText = params.map(p =>
          `${encodeURIComponent(p.name!)}=${encodeURIComponent(String(p.example ?? ''))}`
        ).join('&')
        contentType = body.type === BodyType.FormData ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
      }
    }

    await run(url, workCopy.method ?? 'GET', headers, bodyText, contentType)
  }

  // 一键填充 Body
  const handleFillBody = () => {
    if (!workCopy) return
    const text = buildBodyFillText(workCopy, menuRawList)
    setBodyRawText(text)
  }

  // 判断是否显示 JSON 输入框
  const showBodyEditor = workCopy?.requestBody
    && (workCopy.requestBody.type === BodyType.Json
      || workCopy.requestBody.type === BodyType.Xml
      || workCopy.requestBody.type === BodyType.Raw)

  // cURL
  const curlCommands = useMemo(() => {
    if (!workCopy) return { windows: '', linux: '' }
    const resolvedUrl = envBaseUrl
      ? `${envBaseUrl.replace(/\/$/, '')}${workCopy.path ?? '/'}`
      : workCopy.path ?? '/'
    return generateCurl(workCopy, resolvedUrl)
  }, [workCopy, envBaseUrl])

  const methodOptions = useMemo(() =>
    Object.entries(HTTP_METHOD_CONFIG).map(([method, { color }]) => ({
      value: method,
      label: <span style={{ color: `var(${color})`, fontWeight: 700 }}>{method}</span>,
    })), [])

  if (!docValue || !workCopy) return null

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 环境选择器 */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Typography.Text type="secondary" className="text-xs shrink-0">环境：</Typography.Text>
        <Select
          size="small"
          className="min-w-[160px]"
          value={workCopy.serverId || currentProjectEnvironmentId || undefined}
          options={projectEnvironments?.map((env) => ({
            value: env.id,
            label: (
              <span>
                {env.name}
                <span className="ml-2 text-xs opacity-50">{getPrimaryEnvironmentUrl(env)}</span>
              </span>
            ),
          }))}
          onChange={(envId) => {
            const next = { ...workCopy, serverId: envId }
            setWorkCopy(next)
            persist(next)
          }}
        />
      </div>

      {/* URL 行 */}
      <div className="flex items-center gap-2 px-3 py-2 min-w-0" style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Select
          className="shrink-0"
          style={{ minWidth: 90 }}
          options={methodOptions}
          popupMatchSelectWidth={false}
          value={workCopy.method ?? 'GET'}
          onChange={(method) => {
            const next = { ...workCopy, method }
            setWorkCopy(next)
            persist(next)
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
          {envBaseUrl && !/^https?:\/\//i.test(workCopy.path ?? '')
            ? (
                <span
                  className="mr-0 shrink-0 text-xs select-none"
                  style={{ color: token.colorTextQuaternary }}
                >
                  {envBaseUrl.replace(/\/$/, '')}
                </span>
              )
            : null}
          <Input
            bordered={false}
            className="flex-1 min-w-0"
            style={{ paddingLeft: envBaseUrl ? 0 : 8 }}
            value={workCopy.path ?? ''}
            onChange={(e) => {
              const next = { ...workCopy, path: e.target.value }
              setWorkCopy(next)
              persist(next)
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
            icon={<RotateCcwIcon size={14} />}
            onClick={handleReset}
            title="一键复原"
          />
        </Space.Compact>
      </div>

      {/* 参数编辑区 */}
      <div className="flex-1 overflow-auto">
        <div className="px-3">
          <ParamsTab
            value={workCopy.parameters}
            onChange={(parameters) => {
              const next = { ...workCopy, parameters }
              setWorkCopy(next)
              persist(next)
            }}
          />
        </div>

        {/* Body 编辑区 */}
        <div className="px-3 pb-3">
          <div className="mb-2 flex items-center justify-between">
            <Typography.Text strong className="text-sm">Body</Typography.Text>
            {showBodyEditor && (
              <Button size="small" onClick={handleFillBody}>一键填充</Button>
            )}
          </div>
          {workCopy.requestBody
            ? (
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-1">
                    {bodyTypeOptions.map(({ n, t }) => {
                      const b = workCopy.requestBody
                      const hasContent = b
                        ? t === BodyType.FormData || t === BodyType.UrlEncoded
                          ? (b.parameters ?? []).some(p => p.name && p.enable !== false)
                          : t === BodyType.Json || t === BodyType.Xml
                            ? !!((b.jsonSchema as { properties?: unknown[] })?.properties?.length)
                            : t === BodyType.Raw || t === BodyType.Binary
                              ? !!(b.rawText?.trim())
                              : false
                        : false
                      return (
                        <Tag.CheckableTag
                          key={t}
                          checked={workCopy.requestBody!.type === t}
                          onChange={(checked) => {
                            if (checked) {
                              const next = {
                                ...workCopy,
                                requestBody: { ...workCopy.requestBody!, type: t },
                              }
                              setWorkCopy(next)
                              persist(next)
                            }
                          }}
                        >
                          {n}
                          {hasContent && <span style={{ color: token.colorSuccess, marginLeft: 1 }}>*</span>}
                        </Tag.CheckableTag>
                      )
                    })}
                  </div>

                  {showBodyEditor && (
                    <div className="rounded border-solid" style={{ borderWidth: 3, borderColor: 'rgb(245, 245, 245)' }}>
                      <MonacoEditor
                        height="200px"
                        language={
                          workCopy.requestBody!.type === BodyType.Xml ? 'xml'
                            : workCopy.requestBody!.type === BodyType.Raw ? 'plaintext'
                            : 'json'
                        }
                        value={bodyRawText !== undefined ? bodyRawText : buildBodyExample(workCopy, menuRawList)}
                        onChange={(val) => {
                          const text = typeof val === 'string' ? val : (val != null ? JSON.stringify(val, null, 2) : '')
                          setBodyRawText(text)
                        }}
                        options={{ readOnly: false }}
                        onMount={(editor, monaco) => {
                          monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true })
                          monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true })
                          setTimeout(() => {
                            editor.getAction('editor.action.formatDocument')?.run()
                          }, 100)
                        }}
                      />
                    </div>
                  )}

                  {(workCopy.requestBody.type === BodyType.FormData
                    || workCopy.requestBody.type === BodyType.UrlEncoded) && (
                    <div>
                      <Typography.Text type="secondary" className="mb-2 block text-xs">
                        {workCopy.requestBody.type === BodyType.FormData ? 'form-data' : 'x-www-form-urlencoded'} 参数
                      </Typography.Text>
                      <ParamsEditableTable
                        value={workCopy.requestBody.parameters}
                        onChange={(parameters) => {
                          const next = {
                            ...workCopy,
                            requestBody: { ...workCopy.requestBody!, parameters },
                          }
                          setWorkCopy(next)
                          persist(next)
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            : (
                <Typography.Text type="secondary">无</Typography.Text>
              )}
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
                                  <MonacoEditor
                                    height={`${Math.min((result.body.split('\n').length) * 18, 400)}px`}
                                    language={detectLanguage(result.contentType)}
                                    value={result.body}
                                    options={{ readOnly: true, lineNumbers: 'on', minimap: { enabled: false }, scrollBeyondLastLine: false }}
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
                              <div className="flex flex-col gap-3">
                                <div>
                                  <Typography.Text strong className="mb-1 block text-xs">Windows</Typography.Text>
                                  <pre className="m-0 rounded bg-gray-100 p-2 text-xs overflow-auto" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                    {curlCommands.windows}
                                  </pre>
                                </div>
                                <div>
                                  <Typography.Text strong className="mb-1 block text-xs">Linux / macOS</Typography.Text>
                                  <pre className="m-0 rounded bg-gray-100 p-2 text-xs overflow-auto" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                    {curlCommands.linux}
                                  </pre>
                                </div>
                              </div>
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
