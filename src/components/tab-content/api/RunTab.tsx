import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProxyConfig } from '@/contexts/proxy-config'

import {
  Button,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import { PlayIcon, RotateCcwIcon } from 'lucide-react'

import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { buildSchemaExample } from '@/components/JsonSchema/schema-normalizer'
import { MonacoEditor } from '@/components/MonacoEditor'
import { HTTP_METHOD_CONFIG } from '@/configs/static'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { BodyType } from '@/enums'
import { getPrimaryEnvironmentUrl } from '@/project-environment-utils'
import type { ApiDetails } from '@/types'

import { ParamsEditableTable } from './components/ParamsEditableTable'
import { ParamsTab } from './params/ParamsTab'
import { useApiRequestRunner } from './useApiRequestRunner'
import { ResponsePanel } from './components/ResponsePanel'
import { ResultViewer } from './components/ResultViewer'

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

function mergeParams(
  globalValues: { name: string; value?: string; enable?: boolean }[],
  envValues: { name: string; value?: string; enable?: boolean }[],
  localParams: { name?: string; enable?: boolean; example?: unknown }[],
  disabledNames?: Set<string>,
): { name: string; enable?: boolean; example?: unknown }[] {
  const map = new Map<string, { name: string; enable?: boolean; example?: unknown }>()
  for (const g of globalValues) {
    if (g.name && !disabledNames?.has(g.name)) map.set(g.name, { name: g.name, enable: g.enable, example: g.value })
  }
  for (const e of envValues) {
    if (e.name && !disabledNames?.has(e.name)) map.set(e.name, { name: e.name, enable: e.enable, example: e.value })
  }
  for (const l of localParams) {
    if (l.name) map.set(l.name, { name: l.name, enable: l.enable, example: l.example })
  }
  return Array.from(map.values())
}

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
    projectEnvironmentConfig,
  } = useMenuHelpersContext()

  const { menuApiItem, docValue } = useMemo(() => {
    const item = menuRawList?.find(({ id }) => id === tabData.key)
    return { menuApiItem: item, docValue: item?.data as ApiDetails | undefined }
  }, [menuRawList, tabData.key])

  const storageKey = docValue ? `${STORAGE_PREFIX}${docValue.id}` : ''

  const { run, running, result, error, resetResult } = useApiRequestRunner()

  const { proxyConfig } = useProxyConfig()
  const proxyInfo = proxyConfig && proxyConfig.proxyType !== 'none'
    ? {
        label: proxyConfig.proxyType === 'socks5' ? 'SOCKS5' : 'HTTP',
        tooltip: `${proxyConfig.host}:${proxyConfig.port}`,
      }
    : null

  const [workCopy, setWorkCopy] = useState<ApiDetails | undefined>(() => {
    if (!docValue) return undefined
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return JSON.parse(saved) as ApiDetails
    } catch { /* ignore */ }
    return cloneApiDetails(docValue)
  })

  const [bodyRawText, setBodyRawText] = useState<string | undefined>(undefined)
  const [insecureSkipVerify, setInsecureSkipVerify] = useState(false)

  const [disabledInheritedParams, setDisabledInheritedParams] = useState<{
    query: Set<string>
    header: Set<string>
    cookie: Set<string>
    body: Set<string>
  }>({
    query: new Set(),
    header: new Set(),
    cookie: new Set(),
    body: new Set(),
  })

  const handleToggleInheritedParam = useCallback(
    (section: 'query' | 'header' | 'cookie', name: string, enabled: boolean) => {
      setDisabledInheritedParams((prev) => {
        const next = new Set(prev[section])
        if (enabled) next.delete(name)
        else next.add(name)
        return { ...prev, [section]: next }
      })
    },
    [],
  )

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
      ?? projectEnvironmentConfig?.environments.find((e) => e.id === envId)
  }, [workCopy?.serverId, currentProjectEnvironmentId, projectEnvironments, projectEnvironmentConfig?.environments])

  const envBaseUrl = useMemo(() => {
    if (!currentEnv) return ''
    return getPrimaryEnvironmentUrl(currentEnv)
  }, [currentEnv])

  // 收集所有可用变量用于 {{var}} 自动补全和高亮
  const varMap = useMemo(() => {
    const map = new Map<string, string>()
    const envVars = [
      ...(projectEnvironmentConfig?.globalVariables ?? []),
      ...(projectEnvironmentConfig?.vaultSecrets ?? []),
      ...(currentEnv?.variables ?? []),
    ]
    for (const v of envVars) {
      if (v.name && v.value != null) map.set(v.name, v.value)
    }
    return map
  }, [projectEnvironmentConfig?.globalVariables, projectEnvironmentConfig?.vaultSecrets, currentEnv?.variables])

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

    // 收集环境变量用于 {{var}} 替换
    const varMap = new Map<string, string>()
    const envVars = [
      ...(projectEnvironmentConfig?.globalVariables ?? []),
      ...(projectEnvironmentConfig?.vaultSecrets ?? []),
      ...(currentEnv?.variables ?? []),
    ]
    for (const v of envVars) {
      if (v.name && v.value != null) varMap.set(v.name, v.value)
    }

    const resolveVars = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, name) => varMap.get(name) ?? `{{${name}}}`)

    const envParams = currentEnv?.parameters ?? { header: [], cookie: [], query: [], body: [] }

    // 构建完整 URL（含 query 参数）
    const base = envBaseUrl ? envBaseUrl.replace(/\/$/, '') : ''
    const path = resolveVars(workCopy.path ?? '/')
    const fullPath = path.startsWith('http://') || path.startsWith('https://')
      ? path
      : base ? `${base}${path}` : path

    const mergedQuery = mergeParams(
      (projectEnvironmentConfig?.globalParameters?.query ?? []).filter(p => p.enable !== false),
      envParams.query.filter(p => p.enable !== false),
      workCopy.parameters?.query ?? [],
      disabledInheritedParams.query,
    )
    const queryParams = mergedQuery
      .filter(p => p.name && p.enable !== false)
      .map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(resolveVars(String(p.example ?? '')))}`)
      .join('&')
    const url = queryParams ? `${fullPath}${fullPath.includes('?') ? '&' : '?'}${queryParams}` : fullPath

    // 构建 Header
    const mergedHeader = mergeParams(
      (projectEnvironmentConfig?.globalParameters?.header ?? []).filter(p => p.enable !== false),
      envParams.header.filter(p => p.enable !== false),
      workCopy.parameters?.header ?? [],
      disabledInheritedParams.header,
    )
    const headers = mergedHeader
      .filter(h => h.name && h.enable !== false)
      .map(h => ({ name: h.name, value: resolveVars(String(h.example ?? '')) }))

    // 构建 Cookie（序列化为 Cookie header）
    const mergedCookie = mergeParams(
      (projectEnvironmentConfig?.globalParameters?.cookie ?? []).filter(p => p.enable !== false),
      envParams.cookie.filter(p => p.enable !== false),
      workCopy.parameters?.cookie ?? [],
      disabledInheritedParams.cookie,
    )
    const cookiePairs = mergedCookie
      .filter(c => c.name && c.enable !== false)
      .map(c => `${encodeURIComponent(c.name)}=${encodeURIComponent(resolveVars(String(c.example ?? '')))}`)
    if (cookiePairs.length > 0) {
      headers.push({ name: 'Cookie', value: cookiePairs.join('; ') })
    }

    // 构建 Body
    const body = workCopy.requestBody
    let bodyText = ''
    let contentType: string | undefined
    let formDataFiles: Array<{ name: string, path: string }> | undefined

    if (body && body.type !== BodyType.None) {
      if (body.type === BodyType.Json || body.type === BodyType.Xml || body.type === BodyType.Raw) {
        const raw = bodyRawText !== undefined ? bodyRawText : buildBodyExample(workCopy, menuRawList)
        bodyText = resolveVars(raw)
        contentType = body.type === BodyType.Xml ? 'application/xml'
          : body.type === BodyType.Raw ? 'text/plain'
          : 'application/json'
      } else if (body.type === BodyType.FormData || body.type === BodyType.UrlEncoded) {
        const allParams: Array<{ name?: string, enable?: boolean, example?: string | string[], type?: string, filePath?: string }> = [
          ...(projectEnvironmentConfig?.globalParameters?.body ?? []).map(p => ({ name: p.name, enable: p.enable, example: p.value as string })),
          ...envParams.body.map(p => ({ name: p.name, enable: p.enable, example: p.value as string })),
          ...(body.parameters ?? []).map(p => ({ name: p.name, enable: p.enable, example: p.example, type: p.type as string, filePath: (p as any).filePath })),
        ]

        // 分离普通参数和文件参数
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
            textParams.push({ name: p.name, example: resolveVars(String(p.example ?? '')) })
          }
        }

        bodyText = textParams
          .map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.example)}`)
          .join('&')
        contentType = body.type === BodyType.FormData ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
        formDataFiles = fileParams.length > 0 ? fileParams : undefined
      }
    }

    await run(url, workCopy.method ?? 'GET', headers, bodyText, contentType, formDataFiles, insecureSkipVerify)
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
    <div className="flex h-full flex-col overflow-hidden" style={{ minWidth: 0, maxWidth: '100%' }}>
      {/* 环境选择器 + URL 行 */}
      <div className="flex items-center gap-2 px-3 py-2 min-w-0" style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Typography.Text type="secondary" className="text-xs shrink-0">环境：</Typography.Text>
        <Select
          size="small"
          className="min-w-[120px]"
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
            flex: '1 1 0',
            minWidth: 0,
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

        {proxyInfo && (
          <Tooltip title={`代理: ${proxyInfo.tooltip}`}>
            <Tag color="blue" className="shrink-0">{proxyInfo.label} 代理</Tag>
          </Tooltip>
        )}

        {(/^https:\/\//i.test(workCopy.path ?? '') || /^https:\/\//i.test(envBaseUrl)) && (
          <Tooltip title={insecureSkipVerify ? '证书验证已关闭' : '点击跳过 HTTPS 证书验证'}>
            <Tag
              color={insecureSkipVerify ? 'warning' : 'green'}
              className="cursor-pointer shrink-0"
              onClick={() => setInsecureSkipVerify(v => !v)}
              style={{ cursor: 'pointer' }}
            >
              {insecureSkipVerify ? '跳过证书' : 'SSL'}
            </Tag>
          </Tooltip>
        )}

        <Space className="shrink-0" style={{ marginLeft: 'auto' }}>
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
        </Space>
      </div>

      <ResponsePanel
        paramsArea={
          <>
            {/* 参数编辑区 */}
            <div className="px-3 min-w-0 overflow-hidden">
              <ParamsTab
                value={workCopy.parameters}
                globalParameters={projectEnvironmentConfig?.globalParameters}
                envParameters={currentEnv?.parameters}
                varMap={varMap}
                disabledInheritedNames={disabledInheritedParams}
                onToggleInheritedParam={handleToggleInheritedParam}
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
          </>
        }
        resultArea={
          <ResultViewer
            result={result}
            error={error}
            onRetry={handleRun}
            curlContent={
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
            }
          />
        }
        hasResult={!!(result || error)}
        autoSaveId={`run-tab-${docValue.id}`}
      />
    </div>
  )
}
