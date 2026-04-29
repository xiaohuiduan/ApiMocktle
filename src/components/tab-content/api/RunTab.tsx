import React, { useCallback, useEffect, useMemo, useState } from 'react'

import {
  Button,
  Collapse,
  type CollapseProps,
  Form,
  type FormProps,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd'
import { PlayIcon, RotateCcwIcon, SaveIcon, TerminalIcon } from 'lucide-react'

import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { JsonViewer } from '@/components/JsonViewer'
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
  if (body.rawText?.trim()) return body.rawText
  if (body.jsonSchema) return JSON.stringify(buildSchemaExampleForCurl(body.jsonSchema), null, 2)
  return ''
}

function getStatusColor(code: number) {
  if (code >= 500) return 'error'
  if (code >= 400) return 'warning'
  if (code >= 300) return 'processing'
  return 'success'
}

export function RunTab() {
  const { token } = theme.useToken()
  const { tabData } = useTabContentContext()
  const { messageApi } = useGlobalContext()
  const {
    menuRawList,
    projectEnvironments,
    currentProjectEnvironmentId,
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

  const [bodyRawText, setBodyRawText] = useState('')
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
        setBodyRawText('')
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
      onOk: async () => {
        if (!workCopy) return
        try {
          const projectId = window.location.pathname.split('/').filter(Boolean).at(1)
          if (!projectId) return
          const resp = await fetch(`/api/v1/projects/${projectId}/menu-items/${workCopy.id}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: workCopy.id,
              name: workCopy.name,
              data: workCopy,
            }),
          })
          if (!resp.ok) throw new Error('更新失败')
          messageApi.success('已覆盖到文档')
        } catch (err) {
          messageApi.error((err as Error).message)
        }
      },
    })
  }

  // 运行
  const handleRun = async () => {
    if (!workCopy) return

    // 如果是 JSON/XML body 且有 rawText，更新 requestBody
    const body = workCopy.requestBody
    if (body && (body.type === BodyType.Json || body.type === BodyType.Xml) && bodyRawText.trim()) {
      try {
        JSON.parse(bodyRawText)
        setBodyError(undefined)
      } catch {
        setBodyError('JSON 格式错误')
        return
      }
      workCopy.requestBody = { ...body, rawText: bodyRawText }
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
          {workCopy.requestBody && workCopy.requestBody.type !== BodyType.None
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
                      <Input.TextArea
                        rows={8}
                        placeholder="输入请求体内容..."
                        style={{ fontFamily: 'monospace' }}
                        value={bodyRawText || buildBodyExample(workCopy)}
                        onChange={(e) => {
                          setBodyRawText(e.target.value)
                          setBodyError(undefined)
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
            <Typography.Text strong className="mb-3 block">运行结果</Typography.Text>

            {error && !result
              ? (
                  <Typography.Text type="danger">{error}</Typography.Text>
                )
              : result
                ? (
                    <div>
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <Tag color={getStatusColor(result.status)}>{result.status}</Tag>
                        <span className="text-xs opacity-50">
                          {result.method?.toUpperCase()} | {result.durationMs}ms
                          {result.responseSizeBytes ? ` | ${(result.responseSizeBytes / 1024).toFixed(1)}KB` : ''}
                        </span>
                      </div>

                      <Collapse
                        className="mb-3"
                        ghost
                        items={[
                          {
                            key: 'req',
                            label: `请求 URL: ${result.url ?? '-'}`,
                            children: (
                              <code className="break-all text-xs">{result.url}</code>
                            ),
                          },
                          result.requestHeaders && result.requestHeaders.length > 0 && {
                            key: 'reqHeaders',
                            label: `请求头 (${result.requestHeaders.length})`,
                            children: (
                              <div className="grid gap-1 text-xs" style={{ gridTemplateColumns: '180px 1fr' }}>
                                {result.requestHeaders.map((h, i) => (
                                  <React.Fragment key={i}>
                                    <span className="truncate font-medium opacity-60">{h.name}</span>
                                    <span className="break-all">{h.value}</span>
                                  </React.Fragment>
                                ))}
                              </div>
                            ),
                          },
                          result.requestBody && {
                            key: 'reqBody',
                            label: '请求体',
                            children: (
                              typeof result.requestBody === 'string'
                                ? /^\s*[{\[]/.test(result.requestBody)
                                  ? <JsonViewer value={result.requestBody} />
                                  : <pre className="m-0 whitespace-pre-wrap break-all text-xs">{result.requestBody}</pre>
                                : <pre className="m-0 whitespace-pre-wrap break-all text-xs">{JSON.stringify(result.requestBody, null, 2)}</pre>
                            ),
                          },
                          result.headers && result.headers.length > 0 && {
                            key: 'resHeaders',
                            label: `响应头 (${result.headers.length})`,
                            children: (
                              <div className="grid gap-1 text-xs" style={{ gridTemplateColumns: '180px 1fr' }}>
                                {result.headers.map((h, i) => (
                                  <React.Fragment key={i}>
                                    <span className="truncate font-medium opacity-60">{h.name}</span>
                                    <span className="break-all">{h.value}</span>
                                  </React.Fragment>
                                ))}
                              </div>
                            ),
                          },
                          result.body != null && {
                            key: 'resBody',
                            label: '响应体',
                            children: (
                              typeof result.body === 'string'
                                ? /^\s*[{\[]/.test(result.body)
                                  ? <JsonViewer value={result.body} />
                                  : <pre className="m-0 whitespace-pre-wrap break-all text-xs">{result.body}</pre>
                                : <pre className="m-0 whitespace-pre-wrap break-all text-xs">{JSON.stringify(result.body, null, 2)}</pre>
                            ),
                          },
                        ].filter(Boolean) as CollapseProps['items']}
                        size="small"
                      />

                      {/* cURL */}
                      <Collapse
                        ghost
                        items={[
                          {
                            key: 'curl',
                            label: (
                              <span className="flex items-center gap-1">
                                <TerminalIcon size={14} />
                                cURL 命令
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
                        size="small"
                      />
                    </div>
                  )
                : null}
          </div>
        )}
      </div>
    </div>
  )
}
