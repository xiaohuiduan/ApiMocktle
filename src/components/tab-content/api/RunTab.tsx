import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProxyConfig } from '@/contexts/proxy-config'

import {
  Button,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import { ClockIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'

import { useParams } from 'react-router'
import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'
import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { useApiSubTabContext } from './Api'
import { buildSchemaExample } from '@/components/JsonSchema/schema-normalizer'
import { MonacoEditor } from '@/components/MonacoEditor'
import { HTTP_METHOD_CONFIG } from '@/configs/static'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useSessionVariablesContext } from '@/contexts/session-variables'
import { BodyType } from '@/enums'
import { getPrimaryEnvironmentUrl } from '@/project-environment-utils'
import type { ApiDetails, ApiRequestBody, ApiRunResult, RunTabInfo } from '@/types'

import { ParamsEditableTable } from './components/ParamsEditableTable'
import { ParamsTab } from './params/ParamsTab'
import { useApiRequestRunner } from './useApiRequestRunner'
import { ResponsePanel } from './components/ResponsePanel'
import { ResultViewer } from './components/ResultViewer'
import { HistoryPanel } from './components/HistoryPanel'
import { ScriptTab, executeScript } from './scripts'
import type { ScriptConsoleEntry, ScriptTestResult } from '@/types'

const STORAGE_PREFIX = 'run_tab_'

function cloneApiDetails(source: ApiDetails): ApiDetails {
  return JSON.parse(JSON.stringify(source)) as ApiDetails
}

function mergeRunTabInfo(docValue: ApiDetails, runTabInfo: RunTabInfo): ApiDetails {
  const base = cloneApiDetails(docValue)
  const hasBodyChanges = runTabInfo.bodyType !== undefined || runTabInfo.bodyParameters !== undefined || runTabInfo.bodyRawText !== undefined
  return {
    ...base,
    serverId: runTabInfo.serverId ?? base.serverId,
    parameters: runTabInfo.parameters ?? base.parameters,
    requestBody: hasBodyChanges
      ? {
          type: runTabInfo.bodyType ?? base.requestBody?.type ?? 'none',
          parameters: runTabInfo.bodyParameters ?? base.requestBody?.parameters,
          rawText: runTabInfo.bodyRawText ?? base.requestBody?.rawText,
        } as ApiRequestBody
      : base.requestBody,
    preScript: runTabInfo.preScript ?? base.preScript,
    postScript: runTabInfo.postScript ?? base.postScript,
  }
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
  const subTabKey = useApiSubTabContext()
  const { messageApi } = useGlobalContext()
  const {
    menuRawList,
    projectEnvironments,
    currentProjectEnvironmentId,
    projectEnvironmentConfig,
  } = useMenuHelpersContext()

  const { sessionVars, setSessionVars } = useSessionVariablesContext()
  const { projectId } = useParams()
  const { sessionId } = useAuth()

  const { menuApiItem, docValue, savedRunTabInfo } = useMemo(() => {
    const item = menuRawList?.find(({ id }) => id === tabData.key)
    return {
      menuApiItem: item,
      docValue: item?.data as ApiDetails | undefined,
      savedRunTabInfo: (item as any)?.runTabInfo as RunTabInfo | undefined,
    }
  }, [menuRawList, tabData.key])

  const storageKey = docValue ? `${STORAGE_PREFIX}${docValue.id}` : ''

  const { run, running, result, error, resetResult, setResult } = useApiRequestRunner()

  const { proxyConfig } = useProxyConfig()
  const proxyInfo = proxyConfig && proxyConfig.proxyType !== 'none'
    ? {
        label: proxyConfig.proxyType === 'socks5' ? 'SOCKS5' : 'HTTP',
        tooltip: `${proxyConfig.host}:${proxyConfig.port}`,
      }
    : null

  // 保存原始文档定义的 ref（用于一键复原）
  const originalDocRef = useRef<ApiDetails | undefined>(undefined)
  if (docValue && (!originalDocRef.current || originalDocRef.current.id !== docValue.id)) {
    originalDocRef.current = cloneApiDetails(docValue)
  }

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
  const [historyOpen, setHistoryOpen] = useState(false)
  const [resetCounter, setResetCounter] = useState(0)

  // 脚本相关状态
  const [preScriptConsole, setPreScriptConsole] = useState<ScriptConsoleEntry[]>([])
  const [preScriptTests, setPreScriptTests] = useState<ScriptTestResult[]>([])
  const [postScriptConsole, setPostScriptConsole] = useState<ScriptConsoleEntry[]>([])
  const [postScriptTests, setPostScriptTests] = useState<ScriptTestResult[]>([])
  const [preScriptRunning, setPreScriptRunning] = useState(false)
  const [postScriptRunning, setPostScriptRunning] = useState(false)

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
      originalDocRef.current = cloneApiDetails(docValue)
      const merged = savedRunTabInfo ? mergeRunTabInfo(docValue, savedRunTabInfo) : cloneApiDetails(docValue)
      setWorkCopy(merged)
      setBodyRawText(undefined)
      resetResult()
      return
    }
    // 首次加载：有本地副本则恢复，否则从文档初始化（合并 runTabInfo）
    if (docVersionRef.current === undefined) {
      docVersionRef.current = menuUpdatedAt
      try {
        const saved = localStorage.getItem(`${STORAGE_PREFIX}${docValue.id}`)
        if (saved) {
          setWorkCopy(JSON.parse(saved) as ApiDetails)
          return
        }
      } catch { /* ignore */ }
      const merged = savedRunTabInfo ? mergeRunTabInfo(docValue, savedRunTabInfo) : cloneApiDetails(docValue)
      setWorkCopy(merged)
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
    if (!originalDocRef.current) return

    const hasSavedRunTab = savedRunTabInfo && Object.keys(savedRunTabInfo).length > 0

    if (!hasSavedRunTab) {
      // 没有保存的运行时信息，直接复原到文档定义
      Modal.confirm({
        title: '一键复原',
        content: '确定要放弃所有临时修改，恢复为文档定义的原始值吗？',
        okText: '确认复原',
        cancelText: '取消',
        onOk: () => doReset('define'),
      })
      return
    }

    const modal = Modal.info({
      title: '一键复原',
      content: '请选择复原来源：',
      footer: (
        <div className="flex justify-end gap-2 mt-4">
          <Button onClick={() => modal.destroy()}>关闭</Button>
          <Button onClick={() => { modal.destroy(); doReset('define') }}>复原到文档定义</Button>
          <Button type="primary" onClick={() => { modal.destroy(); doReset('saved') }}>复原到保存点</Button>
        </div>
      ),
      icon: null,
      closable: true,
      maskClosable: true,
    })
  }

  const doReset = (source: 'define' | 'saved') => {
    if (source === 'saved' && savedRunTabInfo) {
      // 复原到最新保存的运行时信息
      const merged = mergeRunTabInfo(originalDocRef.current!, savedRunTabInfo)
      setWorkCopy(merged)
      messageApi.success('已复原到上次保存点')
    } else {
      // 复原到文档定义
      const fresh = cloneApiDetails(originalDocRef.current!)
      setWorkCopy(fresh)
      messageApi.success('已复原为文档原始值')
    }

    setBodyRawText(undefined)
    resetResult()
    setDisabledInheritedParams({
      query: new Set(),
      header: new Set(),
      cookie: new Set(),
      body: new Set(),
    })
    try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
    setResetCounter(c => c + 1)
  }

  // 从数据库加载最近一次运行结果和请求参数
  const prevLoadedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!tabData.key || !projectId || !sessionId) return
    // 防止重复请求（同一个 tabData.key 只加载一次）
    if (prevLoadedKeyRef.current === tabData.key) return
    prevLoadedKeyRef.current = tabData.key

    const loadLastResult = async () => {
      try {
        const list = await api<Array<{ requestJson: { url: string; method: string; headers: Array<{ name: string; value: string }>; body: string; contentType?: string }; responseJson: ApiRunResult }>>('list_request_history', { sessionId, projectId, menuItemId: tabData.key })
        if (list.length > 0) {
          const last = list[0]
          // 恢复结果展示
          setResult(last.responseJson)

          // 恢复请求参数到 workCopy
          if (workCopy && last.requestJson) {
            const next = { ...workCopy }
            // 恢复请求头、Query 参数、Cookie
            if (next.parameters) {
              // Query 参数从 URL 解析（responseJson.requestQuery 可能为空）
              let queryParams: Array<{ name: string; example: string; enable: boolean }> = []
              try {
                const u = new URL(last.requestJson.url || '')
                u.searchParams.forEach((value, name) => {
                  queryParams.push({ name, example: value, enable: true })
                })
              } catch { /* ignore */ }
              // Cookie 从 Cookie header 解析
              const cookieHeader = last.requestJson.headers.find(h => h.name.toLowerCase() === 'cookie')
              let cookiePairs: Array<{ name: string; example: string; enable: boolean }> = []
              if (cookieHeader?.value) {
                cookiePairs = cookieHeader.value.split(';').filter(Boolean).map(p => {
                  const eqIdx = p.indexOf('=')
                  if (eqIdx > 0) return { name: p.substring(0, eqIdx).trim(), example: decodeURIComponent(p.substring(eqIdx + 1).trim()), enable: true }
                  return { name: p.trim(), example: '', enable: true }
                })
              }
              next.parameters = {
                ...next.parameters,
                header: last.requestJson.headers.filter(h => h.name && h.name.toLowerCase() !== 'cookie').map(h => ({ name: h.name, example: h.value, enable: true }) as any),
                query: queryParams as any,
                cookie: cookiePairs as any,
              }
            }
            // 恢复 Body
            if (last.requestJson.body) {
              setBodyRawText(last.requestJson.body)
              if (next.requestBody && last.requestJson.contentType === 'application/json') {
                next.requestBody = { ...next.requestBody, type: BodyType.Json }
              }
            }
            setWorkCopy(next)
          }
        }
      } catch { /* ignore */ }
    }
    void loadLastResult()
  }, [tabData.key, projectId, sessionId, setResult])

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
    // 会话变量覆盖环境变量（最高优先级）
    for (const [k, v] of Object.entries(sessionVars)) {
      varMap.set(k, v)
    }

    const globalsMap: Record<string, string> = {}
    for (const v of [...(projectEnvironmentConfig?.globalVariables ?? []), ...(projectEnvironmentConfig?.vaultSecrets ?? [])]) {
      if (v.name && v.value != null) globalsMap[v.name] = v.value
    }
    const envMap: Record<string, string> = {}
    for (const v of (currentEnv?.variables ?? [])) {
      if (v.name && v.value != null) envMap[v.name] = v.value
    }
    // 会话变量合并到 envMap
    Object.assign(envMap, sessionVars)

    const resolveVars = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, name) => varMap.get(name) ?? `{{${name}}}`)

    // ====== 前置脚本执行 ======
    if (workCopy.preScript?.trim()) {
      setPreScriptRunning(true)
      setPreScriptConsole([])
      setPreScriptTests([])
      try {
        const preResult = await executeScript(workCopy.preScript, {
          environment: envMap,
          globals: globalsMap,
          variables: Object.fromEntries(varMap),
          request: {
            url: workCopy.path ?? '/',
            method: workCopy.method ?? 'GET',
            headers: (workCopy.parameters?.header ?? [])
              .filter(h => h.name && h.enable !== false)
              .map(h => ({ name: h.name!, value: String(h.example ?? '') })),
            body: bodyRawText ?? '',
          },
        })

        setPreScriptConsole(preResult.consoleEntries)
        setPreScriptTests(preResult.testResults)

        // 应用变量变更到 varMap
        for (const [key, value] of Object.entries(preResult.variableDeltas)) {
          varMap.set(key, value)
        }

        if (!preResult.success) {
          setPreScriptRunning(false)
          messageApi.error(`前置脚本执行失败: ${preResult.error}`)
          return
        }
      } catch (err) {
        setPreScriptRunning(false)
        messageApi.error(`前置脚本执行异常: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
      setPreScriptRunning(false)
    }

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

    const runResult = await run(tabData.key, url, workCopy.method ?? 'GET', headers, bodyText, contentType, formDataFiles, insecureSkipVerify)

    // ====== 后置脚本执行 ======
    if (workCopy.postScript?.trim() && runResult) {
      setPostScriptRunning(true)
      setPostScriptConsole([])
      setPostScriptTests([])
      try {
        const postResult = await executeScript(workCopy.postScript, {
          environment: envMap,
          globals: globalsMap,
          variables: Object.fromEntries(varMap),
          request: { url, method: workCopy.method ?? 'GET', headers, body: bodyText },
          response: {
            status: runResult.status,
            statusText: runResult.statusText,
            headers: runResult.headers ?? [],
            body: runResult.body ?? '',
            responseTime: runResult.durationMs,
          },
        })

        setPostScriptConsole(postResult.consoleEntries)
        setPostScriptTests(postResult.testResults)

        // 将脚本设置的变量存入会话变量（跨请求共享，不永久持久化）
        if (Object.keys(postResult.variableDeltas).length > 0) {
          setSessionVars(postResult.variableDeltas)
        }

        if (!postResult.success) {
          messageApi.error(`后置脚本执行失败: ${postResult.error}`)
        }
      } catch (err) {
        messageApi.error(`后置脚本执行异常: ${err instanceof Error ? err.message : String(err)}`)
      }
      setPostScriptRunning(false)
    }
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
            variant="borderless"
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
          <Tooltip title={insecureSkipVerify ? 'HTTPS 证书验证已关闭，不推荐用于生产环境' : '开启后将验证 HTTPS 证书，关闭可调试自签名证书接口'}>
            <label className="shrink-0 flex items-center gap-1.5 cursor-pointer" style={{ userSelect: 'none' }}>
              <span className="text-xs" style={{ color: insecureSkipVerify ? 'var(--ant-color-warning)' : 'var(--ant-color-success)' }}>
                SSL
              </span>
              <Switch
                size="small"
                checked={!insecureSkipVerify}
                onChange={(v) => setInsecureSkipVerify(!v)}
              />
            </label>
          </Tooltip>
        )}

        <Space className="shrink-0" style={{ marginLeft: 'auto' }}>
          <Button icon={<ClockIcon size={14} />} title="历史记录" onClick={() => setHistoryOpen(true)} />
          <Button
            loading={running}
            type="primary"
            icon={<PlayIcon size={14} />}
            onClick={() => void handleRun()}
          >
            运行
          </Button>
          <Tooltip title="复原为文档原始值（清除所有临时修改：参数、请求头、Body、脚本等）">
            <Button
              icon={<RotateCcwIcon size={14} />}
              onClick={handleReset}
            />
          </Tooltip>
        </Space>
      </div>

      <ResponsePanel
        paramsArea={
          <Tabs
            key={`run-tabs-${resetCounter}`}
            animated={false}
            className="min-w-0 h-full"
            tabBarStyle={{ paddingLeft: 12, marginBottom: 0 }}
            items={[
              {
                key: 'params',
                label: 'Params & Body',
                children: (
                  <>
                    {/* 参数编辑区 */}
                    <div className="px-3 min-w-0 overflow-hidden">
                      <ParamsTab
                        key={`params-tab-${resetCounter}`}
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
                                <div className="rounded border-solid" style={{ borderWidth: 3, borderColor: token.colorBorderSecondary }}>
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
                ),
              },
              {
                key: 'scripts',
                label: 'Scripts',
                children: (
                  <div className="px-3 pb-3">
                    <ScriptTab
                      key={`script-tab-${resetCounter}`}
                      preScript={workCopy.preScript}
                      postScript={workCopy.postScript}
                      onPreScriptChange={(value) => {
                        const next = { ...workCopy, preScript: value }
                        setWorkCopy(next)
                        persist(next)
                      }}
                      onPostScriptChange={(value) => {
                        const next = { ...workCopy, postScript: value }
                        setWorkCopy(next)
                        persist(next)
                      }}
                      preScriptConsole={preScriptConsole}
                      preScriptTests={preScriptTests}
                      postScriptConsole={postScriptConsole}
                      postScriptTests={postScriptTests}
                    />
                  </div>
                ),
              },
            ]}
          />
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
                  <pre className="m-0 rounded p-2 text-xs overflow-auto" style={{ backgroundColor: token.colorFillTertiary, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {curlCommands.windows}
                  </pre>
                </div>
                <div>
                  <Typography.Text strong className="mb-1 block text-xs">Linux / macOS</Typography.Text>
                  <pre className="m-0 rounded p-2 text-xs overflow-auto" style={{ backgroundColor: token.colorFillTertiary, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
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

      <HistoryPanel menuItemId={tabData.key} open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  )
}
