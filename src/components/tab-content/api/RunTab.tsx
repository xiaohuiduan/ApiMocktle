import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProxyConfig } from '@/contexts/proxy-config'

import {
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd'
import { ClockIcon, CopyIcon, PlayIcon, RotateCcwIcon, SaveIcon } from 'lucide-react'

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
import { useMenuTabHelpers } from '@/contexts/menu-tab-settings'
import { useSessionVariablesContext } from '@/contexts/session-variables'
import { BodyType, ParamType } from '@/enums'
import { getPrimaryEnvironmentUrl } from '@/project-environment-utils'
import type { ApiDetails, ApiRequestBody, ApiRunResult, RunTabInfo, SavedRequestConfig, Parameter } from '@/types'

import { ParamsEditableTable } from './components/ParamsEditableTable'
import { ParamsTab } from './params/ParamsTab'
import { QueryParamsPanel } from './params/QueryParamsPanel'
import { HeadersParamsPanel } from './params/HeadersParamsPanel'
import { CookieParamsPanel } from './params/CookieParamsPanel'
import { BodyPanel } from './params/BodyPanel'
import { ScriptsPanel } from './params/ScriptsPanel'
import { useApiRequestRunner } from './useApiRequestRunner'
import { buildRequest } from './buildRequest'
import { generateCurl } from './curl'
import { buildJsoncBodyFillText } from './bodyJsonc'
import { useResolvedVarMap, buildVarMaps, makeResolveVars } from './useResolvedVarMap'
import { ResponsePanel } from './components/ResponsePanel'
import { ResultViewer } from './components/ResultViewer'
import { HistoryPanel, type RequestHistoryItem } from './components/HistoryPanel'
import { ScriptTab, executeScript } from './scripts'
import type { ScriptConsoleEntry, ScriptTestResult } from '@/types'
import { parseHistoryParams } from './historyUtils'

const STORAGE_PREFIX = 'run_tab_'

function cloneApiDetails(source: ApiDetails): ApiDetails {
  return JSON.parse(JSON.stringify(source)) as ApiDetails
}

function mergeRunTabInfo(docValue: ApiDetails, runTabInfo: RunTabInfo): ApiDetails {
  const base = cloneApiDetails(docValue)
  const hasBodyChanges = runTabInfo.bodyType !== undefined || runTabInfo.bodyParameters !== undefined || runTabInfo.bodyRawText !== undefined
  return {
    ...base,
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
    updateMenuItem,
  } = useMenuHelpersContext()
  const { setTabItemEditStatus } = useMenuTabHelpers()

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

  // 缓存待解析的历史数据
  const pendingHistoryRef = useRef<{ requestJson: SavedRequestConfig; responseJson: ApiRunResult } | null>(null)

  const [workCopy, setWorkCopy] = useState<ApiDetails | undefined>(() => {
    if (!docValue) return undefined
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return JSON.parse(saved) as ApiDetails
    } catch { /* ignore */ }
    return cloneApiDetails(docValue)
  })

  const [insecureSkipVerify, setInsecureSkipVerify] = useState(false)
  // 请求超时（秒）；undefined 表示跟随全局默认
  const [timeoutSeconds, setTimeoutSeconds] = useState<number | undefined>(() => {
    const ms = savedRunTabInfo?.timeoutMs
    return ms ? Math.round(ms / 1000) : undefined
  })

  // 数据库 runTabInfo 加载后同步超时值
  useEffect(() => {
    if (savedRunTabInfo?.timeoutMs != null) {
      setTimeoutSeconds(Math.round(savedRunTabInfo.timeoutMs / 1000))
    }
  }, [savedRunTabInfo?.timeoutMs])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [resetCounter, setResetCounter] = useState(0)
  const [historyLoaded, setHistoryLoaded] = useState(0)
  const [fillWithComments, setFillWithComments] = useState(true)
  // 各 body 类型的文本缓存：切换类型时保存/恢复，避免内容丢失
  const bodyTextsRef = useRef<Partial<Record<BodyType, string>>>({})

  // 智能默认 tab：根据 HTTP 方法选择
  const getDefaultActiveTab = useCallback(() => {
    const method = workCopy?.method?.toUpperCase()
    if (['POST', 'PUT', 'PATCH'].includes(method ?? '')) {
      return 'body'
    }
    return 'params'
  }, [workCopy?.method])

  const [activeParamsTab, setActiveParamsTab] = useState(getDefaultActiveTab())

  // 当 workCopy.method 变化时，更新默认 tab（仅在切换 API 时）
  useEffect(() => {
    if (workCopy?.id) {
      setActiveParamsTab(getDefaultActiveTab())
    }
  }, [workCopy?.id, getDefaultActiveTab])

  // 脚本相关状态
  const [preScriptConsole, setPreScriptConsole] = useState<ScriptConsoleEntry[]>([])
  const [preScriptTests, setPreScriptTests] = useState<ScriptTestResult[]>([])
  const [postScriptConsole, setPostScriptConsole] = useState<ScriptConsoleEntry[]>([])
  const [postScriptTests, setPostScriptTests] = useState<ScriptTestResult[]>([])
  const [preScriptRunning, setPreScriptRunning] = useState(false)
  const [postScriptRunning, setPostScriptRunning] = useState(false)

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
    return projectEnvironments?.find((e) => e.id === currentProjectEnvironmentId)
      ?? projectEnvironmentConfig?.environments.find((e) => e.id === currentProjectEnvironmentId)
  }, [currentProjectEnvironmentId, projectEnvironments, projectEnvironmentConfig?.environments])

  const envBaseUrl = useMemo(() => {
    if (!currentEnv) return ''
    return getPrimaryEnvironmentUrl(currentEnv)
  }, [currentEnv])

  // 收集所有可用变量用于 {{var}} 自动补全和高亮（统一优先级：global < env < sessionVars）
  const { varMap } = useResolvedVarMap({
    globalVariables: projectEnvironmentConfig?.globalVariables,
    envVariables: currentEnv?.variables,
    sessionVars,
  })

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
    bodyTextsRef.current = {}
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

    resetResult()
    pendingHistoryRef.current = null
    try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
    setTimeoutSeconds(undefined)
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
        const list = await api<Array<{ requestJson: SavedRequestConfig; responseJson: ApiRunResult }>>('list_request_history', { sessionId, projectId, menuItemId: tabData.key })
        if (list.length > 0) {
          const last = list[0]
          // 恢复结果展示
          setResult(last.responseJson)

          // 缓存历史数据，等待 workCopy 可用后解析参数
          pendingHistoryRef.current = last
          setHistoryLoaded(c => c + 1)

          // Body 会在下面的 useEffect 中通过 pendingHistoryRef 恢复
        }
      } catch { /* ignore */ }
    }
    void loadLastResult()
  }, [tabData.key, projectId, sessionId, setResult])

  // 当 workCopy 可用时，恢复历史参数（直接写入 workCopy）
  useEffect(() => {
    if (!workCopy || !pendingHistoryRef.current) return

    const last = pendingHistoryRef.current
    const parsed = parseHistoryParams(
      last.requestJson.headers ?? [],
      last.requestJson.url ?? '',
    )

    const next = {
      ...workCopy,
      parameters: {
        ...workCopy.parameters,
        query: parsed.query,
        header: parsed.header,
        cookie: parsed.cookie,
      },
    }

    // Body type 和 rawText 恢复
    if (last.requestJson.body && workCopy.requestBody) {
      next.requestBody = {
        ...next.requestBody!,
        type: last.requestJson.contentType === 'application/json' ? BodyType.Json : BodyType.Raw,
        rawText: last.requestJson.body,
      }
    }

    setWorkCopy(next)
    persist(next)
    pendingHistoryRef.current = null
  }, [workCopy, historyLoaded])

  // 运行
  const handleRun = async () => {
    if (!workCopy) return

    // 收集环境变量用于 {{var}} 替换
    // 统一构建变量映射（global < env < sessionVars）
    const { varMap, globalsMap, envMap } = buildVarMaps({
      globalVariables: projectEnvironmentConfig?.globalVariables,
      envVariables: currentEnv?.variables,
      sessionVars,
    })
    const resolveVars = makeResolveVars(varMap)


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
            body: workCopy.requestBody?.rawText ?? '',
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

    // 统一通过共享核心构建请求（URL/Query/Header/Cookie/Body），避免与 QuickRequestRun 重复
    const allBodyParams: { name?: string, enable?: boolean, example?: string, type?: string, filePath?: string }[] = [
      ...(projectEnvironmentConfig?.globalParameters?.body ?? []).map((p) => ({ name: p.name, enable: p.enable, example: p.value as string })),
      ...envParams.body.map((p) => ({ name: p.name, enable: p.enable, example: p.value as string })),
      ...(workCopy.requestBody?.parameters ?? []).map((p) => ({
        name: p.name,
        enable: p.enable,
        example: p.example as string,
        type: p.type as string,
        filePath: p.type === ParamType.File && 'filePath' in p ? p.filePath : undefined,
      })),
    ]

    const built = buildRequest({
      method: workCopy.method ?? 'GET',
      baseUrl: envBaseUrl,
      path: workCopy.path,
      query: mergeParams(
        (projectEnvironmentConfig?.globalParameters?.query ?? []).filter(p => p.enable !== false),
        envParams.query.filter(p => p.enable !== false),
        workCopy.parameters?.query ?? [],
      ),
      header: mergeParams(
        (projectEnvironmentConfig?.globalParameters?.header ?? []).filter(p => p.enable !== false),
        envParams.header.filter(p => p.enable !== false),
        workCopy.parameters?.header ?? [],
      ),
      cookie: mergeParams(
        (projectEnvironmentConfig?.globalParameters?.cookie ?? []).filter(p => p.enable !== false),
        envParams.cookie.filter(p => p.enable !== false),
        workCopy.parameters?.cookie ?? [],
      ),
      body: workCopy.requestBody
        ? { type: workCopy.requestBody.type, rawText: workCopy.requestBody.rawText, parameters: allBodyParams }
        : undefined,
      resolveVars,
      buildBodyExample,
      apiDetails: workCopy,
      menuRawList,
      insecureSkipVerify,
    })

    const { url, headers, bodyText } = built

    // 请求级超时（毫秒）；未设置时 Rust 端回落到全局默认
    const timeoutMs = timeoutSeconds ? Math.round(timeoutSeconds * 1000) : undefined

    const runResult = await run(tabData.key, url, workCopy.method ?? 'GET', headers, bodyText, built.contentType, built.formDataFiles, built.insecureSkipVerify, timeoutMs)

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
    const text = fillWithComments
      ? buildJsoncBodyFillText(workCopy, menuRawList)
      : buildBodyFillText(workCopy, menuRawList)
    const next = {
      ...workCopy,
      requestBody: { ...workCopy.requestBody!, rawText: text },
    }
    setWorkCopy(next)
    persist(next)
  }

  const handleSaveToDoc = async () => {
    if (!docValue || !workCopy) return

    const name = menuApiItem?.name ?? docValue.name
    const runTabInfo: RunTabInfo = {
      parameters: workCopy.parameters,
      bodyType: workCopy.requestBody?.type,
      bodyParameters: workCopy.requestBody?.parameters,
      bodyRawText: workCopy.requestBody?.rawText,
      preScript: workCopy.preScript,
      postScript: workCopy.postScript,
      timeoutMs: timeoutSeconds ? Math.round(timeoutSeconds * 1000) : undefined,
    }

    try {
      await updateMenuItem({
        id: tabData.key,
        name,
        data: { ...workCopy, name },
        runTabInfo,
      })
      setTabItemEditStatus({ key: tabData.key }, 'saved')
      messageApi.success('已保存到接口文档')
    }
    catch (err) {
      messageApi.error(err instanceof Error ? err.message : '保存失败')
    }
  }

  const handleApplyHistory = (item: RequestHistoryItem) => {
    if (!workCopy) return

    const parsed = parseHistoryParams(item.requestJson.headers ?? [], item.requestJson.url ?? '')
    const next: ApiDetails = {
      ...workCopy,
      method: (item.requestJson.method ?? workCopy.method) as ApiDetails['method'],
      path: item.requestJson.url?.split('?')[0] ?? workCopy.path,
      parameters: {
        ...workCopy.parameters,
        query: parsed.query,
        header: parsed.header,
        cookie: parsed.cookie,
      },
    }

    if (item.requestJson.body && next.requestBody) {
      next.requestBody = {
        ...next.requestBody,
        type: item.requestJson.contentType === 'application/json' ? BodyType.Json : BodyType.Raw,
        rawText: item.requestJson.body,
      }
    }

    setWorkCopy(next)
    persist(next)
    setHistoryOpen(false)
    messageApi.success('已回填历史请求')
  }


  // 判断是否显示 JSON 输入框
  const showBodyEditor = workCopy?.requestBody
    && (workCopy.requestBody.type === BodyType.Json
      || workCopy.requestBody.type === BodyType.Xml
      || workCopy.requestBody.type === BodyType.Raw
      || workCopy.requestBody.type === BodyType.Binary)

  // 判断各 tab 是否有内容（用于显示绿色 * 标识）
  const hasParamsContent = useMemo(() => {
    return (workCopy?.parameters?.query ?? []).some(p => p.name && p.enable !== false)
  }, [workCopy?.parameters?.query])

  const hasHeadersContent = useMemo(() => {
    return (workCopy?.parameters?.header ?? []).some(p => p.name && p.enable !== false)
  }, [workCopy?.parameters?.header])

  const hasCookieContent = useMemo(() => {
    return (workCopy?.parameters?.cookie ?? []).some(p => p.name && p.enable !== false)
  }, [workCopy?.parameters?.cookie])

  const hasBodyContent = useMemo(() => {
    const body = workCopy?.requestBody
    if (!body || body.type === BodyType.None) return false

    if (body.type === BodyType.FormData || body.type === BodyType.UrlEncoded) {
      return (body.parameters ?? []).some(p => p.name && p.enable !== false)
    }
    if (body.type === BodyType.Json) {
      return !!((body.jsonSchema as { properties?: unknown[] })?.properties?.length)
        || !!(body.rawText?.trim())
    }
    return !!(body.rawText?.trim())
  }, [workCopy?.requestBody])

  const hasScriptsContent = useMemo(() => {
    return !!(workCopy?.preScript?.trim() || workCopy?.postScript?.trim())
  }, [workCopy?.preScript, workCopy?.postScript])

  // Tab Label 组件（带绿色 * 标识）
  const TabLabel = ({ children, hasContent }: { children: React.ReactNode; hasContent: boolean }) => {
    return (
      <span>
        {children}
        {hasContent && <span style={{ color: token.colorSuccess, marginLeft: 4 }}>*</span>}
      </span>
    )
  }

  // cURL
  const curlCommands = useMemo(() => {
    if (!workCopy) return { windows: '', linux: '' }
    const resolvedUrl = envBaseUrl
      ? `${envBaseUrl.replace(/\/$/, '')}${workCopy.path ?? '/'}`
      : workCopy.path ?? '/'
    return generateCurl({
      method: workCopy.method ?? 'GET',
      url: resolvedUrl,
      headers: workCopy.parameters?.header ?? [],
      query: workCopy.parameters?.query ?? [],
      cookie: workCopy.parameters?.cookie ?? [],
      body: workCopy.requestBody
        ? {
            type: workCopy.requestBody.type,
            rawText: workCopy.requestBody.rawText,
            parameters: workCopy.requestBody.parameters ?? [],
          }
        : undefined,
    })
  }, [workCopy, envBaseUrl])

  const methodOptions = useMemo(() =>
    Object.entries(HTTP_METHOD_CONFIG).map(([method, { color }]) => ({
      value: method,
      label: <span style={{ color: `var(${color})`, fontWeight: 700 }}>{method}</span>,
    })), [])

  if (!docValue || !workCopy) return null

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ minWidth: 0, maxWidth: '100%' }}>
      {/* URL 行 */}
      <div className="flex items-center gap-2 px-2 py-1 min-w-0" style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
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

        <Tooltip title="请求超时（秒），留空使用全局默认，0 表示不限时">
          <InputNumber
            className="shrink-0"
            size="small"
            min={0}
            max={3600}
            placeholder="超时"
            addonAfter="秒"
            value={timeoutSeconds}
            onChange={(v) => setTimeoutSeconds(v == null ? undefined : Number(v))}
            style={{ width: 110 }}
          />
        </Tooltip>

        <Space className="shrink-0" style={{ marginLeft: 'auto' }}>
          <Button icon={<ClockIcon size={14} />} title="历史记录" onClick={() => setHistoryOpen(true)} />
          <Button
            icon={<SaveIcon size={14} />}
            title="保存到文档"
            onClick={() => void handleSaveToDoc()}
          />
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
            tabBarStyle={{ paddingLeft: 8, marginBottom: 0 }}
            activeKey={activeParamsTab}
            onChange={setActiveParamsTab}
            items={[
              {
                key: 'params',
                label: <TabLabel hasContent={hasParamsContent}>Params</TabLabel>,
                children: (
                  <div className="px-2 min-w-0 overflow-hidden">
                    <QueryParamsPanel
                      key={`params-tab-${resetCounter}`}
                      value={workCopy.parameters}
                      globalParameters={projectEnvironmentConfig?.globalParameters}
                      envParameters={currentEnv?.parameters}
                      varMap={varMap}
                      onChange={(parameters) => {
                        const next = { ...workCopy, parameters }
                        setWorkCopy(next)
                        persist(next)
                      }}
                    />
                  </div>
                ),
              },
              {
                key: 'headers',
                label: <TabLabel hasContent={hasHeadersContent}>Headers</TabLabel>,
                children: (
                  <div className="px-2 min-w-0 overflow-hidden">
                    <HeadersParamsPanel
                      key={`headers-tab-${resetCounter}`}
                      value={workCopy.parameters}
                      globalParameters={projectEnvironmentConfig?.globalParameters}
                      envParameters={currentEnv?.parameters}
                      varMap={varMap}
                      onChange={(parameters) => {
                        const next = { ...workCopy, parameters }
                        setWorkCopy(next)
                        persist(next)
                      }}
                    />
                  </div>
                ),
              },
              {
                key: 'cookie',
                label: <TabLabel hasContent={hasCookieContent}>Cookie</TabLabel>,
                children: (
                  <div className="px-2 min-w-0 overflow-hidden">
                    <CookieParamsPanel
                      key={`cookie-tab-${resetCounter}`}
                      value={workCopy.parameters}
                      globalParameters={projectEnvironmentConfig?.globalParameters}
                      envParameters={currentEnv?.parameters}
                      varMap={varMap}
                      onChange={(parameters) => {
                        const next = { ...workCopy, parameters }
                        setWorkCopy(next)
                        persist(next)
                      }}
                    />
                  </div>
                ),
              },
              {
                key: 'body',
                label: <TabLabel hasContent={hasBodyContent}>Body</TabLabel>,
                children: (
                  <BodyPanel
                    key={`body-tab-${resetCounter}`}
                    requestBody={workCopy.requestBody}
                    bodyRawText={workCopy.requestBody?.rawText}
                    onBodyTypeChange={(type) => {
                      const oldType = workCopy.requestBody?.type
                      const oldText = workCopy.requestBody?.rawText

                      if (oldType && oldText !== undefined) {
                        bodyTextsRef.current[oldType] = oldText
                      }

                      if (oldType && oldType !== type && oldText?.trim()) {
                        messageApi.info('已保留原 Body 内容，可切换回原类型恢复')
                      }

                      const nextText = type === oldType ? oldText : bodyTextsRef.current[type]
                      const next = {
                        ...workCopy,
                        requestBody: { ...workCopy.requestBody!, type, rawText: nextText },
                      }
                      setWorkCopy(next)
                      persist(next)
                    }}
                    onBodyRawTextChange={(text) => {
                      const next = {
                        ...workCopy,
                        requestBody: { ...workCopy.requestBody!, rawText: text },
                      }
                      setWorkCopy(next)
                      persist(next)
                    }}
                    onBodyParametersChange={(parameters) => {
                      const next = {
                        ...workCopy,
                        requestBody: { ...workCopy.requestBody!, parameters },
                      }
                      setWorkCopy(next)
                      persist(next)
                    }}
                    onFillBody={handleFillBody}
                    fillWithComments={fillWithComments}
                    onFillWithCommentsChange={setFillWithComments}
                    buildBodyExample={() => buildBodyExample(workCopy, menuRawList)}
                    varMap={varMap}
                  />
                ),
              },
              {
                key: 'scripts',
                label: <TabLabel hasContent={hasScriptsContent}>Scripts</TabLabel>,
                children: (
                  <ScriptsPanel
                    key={`scripts-tab-${resetCounter}`}
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
            menuItemId={tabData.key}
            curlContent={
              <div className="flex flex-col gap-3">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <Typography.Text strong className="text-xs">Windows</Typography.Text>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyIcon size={12} />}
                      onClick={() => {
                        void navigator.clipboard.writeText(curlCommands.windows).then(() => message.success('已复制'))
                      }}
                    />
                  </div>
                  <pre className="m-0 rounded p-2 text-xs overflow-auto" style={{ backgroundColor: token.colorFillTertiary, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {curlCommands.windows}
                  </pre>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <Typography.Text strong className="text-xs">Linux / macOS</Typography.Text>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyIcon size={12} />}
                      onClick={() => {
                        void navigator.clipboard.writeText(curlCommands.linux).then(() => message.success('已复制'))
                      }}
                    />
                  </div>
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

      <HistoryPanel
        menuItemId={tabData.key}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onApply={handleApplyHistory}
      />
    </div>
  )
}
