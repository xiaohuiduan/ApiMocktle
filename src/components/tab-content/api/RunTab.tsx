import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  Button,
  Form,
  type FormProps,
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
import { PlayIcon, RotateCcwIcon, SaveIcon, TerminalIcon } from 'lucide-react'

import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { MonacoEditor } from '@/components/MonacoEditor'
import { HTTP_METHOD_CONFIG } from '@/configs/static'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { BodyType } from '@/enums'
import { getPrimaryEnvironmentUrl } from '@/project-environment-utils'
import type { ApiDetails, ApiRunResult } from '@/types'

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
          ? ` -d '${JSON.stringify(buildSchemaExampleForCurl(apiDetails.requestBody.jsonSchema))}'`
          : ''
    } else if (apiDetails.requestBody.rawText?.trim()) {
      bodyContent = ` -d '${apiDetails.requestBody.rawText.replace(/'/g, "'\\''")}'`
    }
  }

  const cmdLinux = `curl -X ${method}${headerStr}${bodyFlag}${bodyContent} "${targetUrl}"`
  const cmdWindows = `curl -X ${method}${headerStr}${bodyFlag}${bodyContent} "${targetUrl}"`

  return { linux: cmdLinux, windows: cmdWindows }
}

function buildSchemaExampleForCurl(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return {}
  const s = schema as Record<string, unknown>
  if (s.type === 'object' && Array.isArray(s.properties)) {
    const out: Record<string, unknown> = {}
    ;(s.properties as Array<Record<string, unknown>>).forEach((p, i) => {
      const name = (p.name ?? `field_${i + 1}`) as string
      out[name] = buildSchemaExampleForCurl(p)
    })
    return out
  }
  if (s.type === 'array' && s.items) return [buildSchemaExampleForCurl(s.items)]
  if (s.type === 'string') return 'string'
  if (s.type === 'integer' || s.type === 'number') return 0
  if (s.type === 'boolean') return true
  return ''
}

function buildBodyExample(apiDetails: ApiDetails): string {
  const body = apiDetails.requestBody
  if (!body || body.type === BodyType.None) return ''
  // Prefer generating example from schema (avoids showing raw schema definition as body)
  if (body.jsonSchema) return JSON.stringify(buildSchemaExampleForCurl(body.jsonSchema), null, 2)
  if (body.rawText?.trim()) return body.rawText
  return ''
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

export function RunTab() {
  const { token } = theme.useToken()
  const { tabData } = useTabContentContext()
  const { messageApi } = useGlobalContext()
  const {
    menuRawList,
    projectEnvironments,
    currentProjectEnvironmentId,
    updateMenuItem,
  } = useMenuHelpersContext()

  const docValue = useMemo(() => {
    return menuRawList?.find(({ id }) => id === tabData.key)?.data as ApiDetails | undefined
  }, [menuRawList, tabData.key])

  const storageKey = docValue ? `${STORAGE_PREFIX}${docValue.id}` : ''

  const { run, running, result, error, resetResult } = useApiRequestRunner(docValue?.id)

  // 初始化工作副本：localStorage > 文档定义
  const [workCopy, setWorkCopy] = useState<ApiDetails | undefined>(() => {
    if (!docValue) return undefined
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return JSON.parse(saved) as ApiDetails
    } catch { /* ignore */ }
    return cloneApiDetails(docValue)
  })

  const [bodyRawText, setBodyRawText] = useState<string | undefined>(undefined)
  const [bodyError, setBodyError] = useState<string>()

  // docValue 变化时重新初始化
  useEffect(() => {
    if (!docValue) return
    try {
      const saved = localStorage.getItem(`${STORAGE_PREFIX}${docValue.id}`)
      if (saved) {
        setWorkCopy(JSON.parse(saved) as ApiDetails)
      } else {
        setWorkCopy(cloneApiDetails(docValue))
      }
    } catch {
      setWorkCopy(cloneApiDetails(docValue))
    }
    resetResult()
  }, [docValue?.id])

  // 持久化到 localStorage
  const persist = useCallback((copy: ApiDetails) => {
    if (!copy?.id) return
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${copy.id}`, JSON.stringify(copy))
    } catch { /* ignore */ }
  }, [])

  const handleValuesChange: FormProps['onValuesChange'] = (_changed, all) => {
    const next = { ...workCopy, ...all } as ApiDetails
    setWorkCopy(next)
    persist(next)
  }

  // 当前环境信息
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
        setBodyError(undefined)
        resetResult()
        try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
        messageApi.success('已复原')
      },
    })
  }

  // 覆盖到文档
  const handleOverwrite = () => {
    Modal.confirm({
      title: '覆盖到文档',
      content: '确定要用当前运行 Tab 中的参数覆盖文档定义吗？此操作不可撤销。',
      onOk: () => {
        if (!workCopy) return
        updateMenuItem({
          id: tabData.key,
          name: workCopy.name,
          data: workCopy,
        })
        messageApi.success('已覆盖到文档')
      },
    })
  }

  // 运行
  const handleRun = async () => {
    if (!workCopy) return

    // 如果是 JSON/XML body，同步编辑器内容到 requestBody
    const body = workCopy.requestBody
    const currentBodyText = bodyRawText !== undefined ? bodyRawText : buildBodyExample(workCopy)
    if (body && (body.type === BodyType.Json || body.type === BodyType.Xml)) {
      if (currentBodyText.trim()) {
        try {
          JSON.parse(currentBodyText)
          setBodyError(undefined)
        } catch {
          setBodyError('JSON 格式错误')
          return
        }
      }
      workCopy.requestBody = { ...body, rawText: currentBodyText }
    }

    await run(workCopy)
  }

  const handleFillBody = () => {
    if (!workCopy) return
    const example = buildBodyExample(workCopy)
    if (example) {
      setBodyRawText(example)
      setBodyError(undefined)
    }
  }

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

  const showBodyTextarea = workCopy.requestBody
    && (workCopy.requestBody.type === BodyType.Json
      || workCopy.requestBody.type === BodyType.Xml
      || workCopy.requestBody.type === BodyType.Raw)

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
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Select
          className="min-w-[100px]"
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
          className="flex items-center rounded border px-2"
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
            className="flex-1"
            style={{ paddingLeft: envBaseUrl ? 0 : 8 }}
            value={workCopy.path ?? ''}
            onChange={(e) => {
              const next = { ...workCopy, path: e.target.value }
              setWorkCopy(next)
              persist(next)
            }}
          />
        </div>

        <Space.Compact>
          <Button
            loading={running}
            type="primary"
            icon={<PlayIcon size={14} />}
            onClick={() => void handleRun()}
          >
            运行
          </Button>
          <Button
            icon={<SaveIcon size={14} />}
            onClick={handleOverwrite}
            title="覆盖到文档"
          >
            覆盖
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

        {/* Body 区域 */}
        <div className="px-3 pb-3">
          <Typography.Text strong className="mb-2 block text-sm">Body</Typography.Text>
          {workCopy.requestBody
            ? (
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-1">
                    {[
                      { n: 'none', t: BodyType.None },
                      { n: 'form-data', t: BodyType.FormData },
                      { n: 'url-encoded', t: BodyType.UrlEncoded },
                      { n: 'json', t: BodyType.Json },
                      { n: 'xml', t: BodyType.Xml },
                      { n: 'raw', t: BodyType.Raw },
                      { n: 'binary', t: BodyType.Binary },
                    ].map(({ n, t }) => (
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
                      </Tag.CheckableTag>
                    ))}
                  </div>

                  {showBodyTextarea && (
                    <div>
                      <MonacoEditor
                        height="200px"
                        language="json"
                        value={bodyRawText !== undefined ? bodyRawText : buildBodyExample(workCopy)}
                        onChange={(val) => {
                          const text = typeof val === 'string' ? val : (val != null ? JSON.stringify(val, null, 2) : '')
                          setBodyRawText(text)
                          setBodyError(undefined)
                        }}
                        onMount={(editor, monaco) => {
                          // Disable JS/TS diagnostics to prevent spurious errors on JSON content
                          monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true })
                          monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true })
                          setTimeout(() => {
                            editor.getAction('editor.action.formatDocument')?.run()
                          }, 100)
                        }}
                      />
                      {bodyError && (
                        <Typography.Text className="mt-1 text-xs" type="danger">{bodyError}</Typography.Text>
                      )}
                      <div className="mt-1 flex gap-2">
                        <Button size="small" onClick={handleFillBody}>一键填充</Button>
                      </div>
                    </div>
                  )}

                  {(workCopy.requestBody.type === BodyType.FormData
                    || workCopy.requestBody.type === BodyType.UrlEncoded) && (
                    <Typography.Text type="secondary" className="text-xs">
                      参数在 Body tab 中编辑
                    </Typography.Text>
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
