import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProxyConfig } from '@/contexts/proxy-config'

import {
  Button,
  Input,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import { ClockIcon, PlayIcon, PencilIcon } from 'lucide-react'
import { nanoid } from 'nanoid'

import { PageTabStatus } from '@/components/ApiTab/ApiTab.enum'
import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { buildSchemaExample } from '@/components/JsonSchema/schema-normalizer'
import { HTTP_METHOD_CONFIG } from '@/configs/static'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useSessionVariablesContext } from '@/contexts/session-variables'
import { useMenuTabContext, useMenuTabHelpers } from '@/contexts/menu-tab-settings'
import { useCtrlSave } from '@/hooks/useCtrlSave'
import { BodyType, MenuItemType } from '@/enums'
import type { ApiDetails, RunTabInfo, Parameter } from '@/types'

import { useApiRequestRunner } from './useApiRequestRunner'
import { buildRequest } from './buildRequest'
import { ResponsePanel } from './components/ResponsePanel'
import { ResultViewer } from './components/ResultViewer'
import { HistoryPanel } from './components/HistoryPanel'
import { executeScript } from './scripts'
import { QueryParamsPanel } from './params/QueryParamsPanel'
import { HeadersParamsPanel } from './params/HeadersParamsPanel'
import { CookieParamsPanel } from './params/CookieParamsPanel'
import { BodyPanel } from './params/BodyPanel'
import { ScriptsPanel } from './params/ScriptsPanel'
import type { ScriptConsoleEntry, ScriptTestResult } from '@/types'

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
  const { activeTabKey } = useMenuTabContext()
  const { sessionVars, setSessionVars } = useSessionVariablesContext()

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
  const [historyOpen, setHistoryOpen] = useState(false)
  const [insecureSkipVerify, setInsecureSkipVerify] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  // 脚本相关状态
  const [preScriptConsole, setPreScriptConsole] = useState<ScriptConsoleEntry[]>([])
  const [preScriptTests, setPreScriptTests] = useState<ScriptTestResult[]>([])
  const [postScriptConsole, setPostScriptConsole] = useState<ScriptConsoleEntry[]>([])
  const [postScriptTests, setPostScriptTests] = useState<ScriptTestResult[]>([])

  // 智能默认参数 tab：POST/PUT/PATCH 默认 Body，其余默认 Params（与 RunTab 一致）
  const getDefaultActiveTab = useCallback(() => {
    const method = workCopy?.method?.toUpperCase()
    if (['POST', 'PUT', 'PATCH'].includes(method ?? '')) return 'body'
    return 'params'
  }, [workCopy?.method])

  const [activeParamsTab, setActiveParamsTab] = useState(getDefaultActiveTab())

  // 切换不同快捷请求时重置默认 tab（单请求内不强行覆盖用户手动选择）
  useEffect(() => {
    if (tabData.key) {
      setActiveParamsTab(getDefaultActiveTab())
    }
  }, [tabData.key, getDefaultActiveTab])

  // 各 section 内容指示（有内容时 tab 显示 *，与 RunTab 视觉一致）
  const hasParamsContent = useMemo(
    () => (workCopy?.parameters?.query ?? []).some(p => p.name && p.enable !== false),
    [workCopy?.parameters?.query],
  )
  const hasHeadersContent = useMemo(
    () => (workCopy?.parameters?.header ?? []).some(p => p.name && p.enable !== false),
    [workCopy?.parameters?.header],
  )
  const hasCookieContent = useMemo(
    () => (workCopy?.parameters?.cookie ?? []).some(p => p.name && p.enable !== false),
    [workCopy?.parameters?.cookie],
  )
  const hasBodyContent = useMemo(() => {
    const body = workCopy?.requestBody
    if (!body || body.type === BodyType.None) return false
    if (body.type === BodyType.FormData || body.type === BodyType.UrlEncoded) {
      return (body.parameters ?? []).some(p => p.name && p.enable !== false)
    }
    if (body.type === BodyType.Json || body.type === BodyType.Xml) {
      return !!((body.jsonSchema as { properties?: unknown[] })?.properties?.length)
    }
    if (body.type === BodyType.Raw || body.type === BodyType.Binary) {
      return !!(body.rawText?.trim())
    }
    return false
  }, [workCopy?.requestBody])
  const hasScriptsContent = useMemo(
    () => !!(workCopy?.preScript?.trim() || workCopy?.postScript?.trim()),
    [workCopy?.preScript, workCopy?.postScript],
  )

  // Tab Label 组件（带绿色 * 标识）
  const TabLabel = ({ children, hasContent }: { children: React.ReactNode; hasContent: boolean }) => (
    <span>
      {children}
      {hasContent && <span style={{ color: token.colorSuccess, marginLeft: 4 }}>*</span>}
    </span>
  )

  useEffect(() => {
    if (savedData && !isCreating) {
      setWorkCopy(JSON.parse(JSON.stringify(savedData)) as ApiDetails)
      setBodyRawText(undefined)
    }
  }, [savedData?.id, isCreating])

  const { run, running, result, error, resetResult } = useApiRequestRunner()

  const { proxyConfig } = useProxyConfig()
  const proxyInfo = proxyConfig && proxyConfig.proxyType !== 'none'
    ? {
        label: proxyConfig.proxyType === 'socks5' ? 'SOCKS5' : 'HTTP',
        tooltip: `${proxyConfig.host}:${proxyConfig.port}`,
      }
    : null

  const methodOptions = useMemo(() =>
    Object.entries(HTTP_METHOD_CONFIG).map(([method, { color }]) => ({
      value: method,
      label: <span style={{ color: `var(${color})`, fontWeight: 700 }}>{method}</span>,
    })), [])

  const handleRun = async () => {
    // 统一通过共享核心构建请求（URL/Query/Header/Cookie/Body），cookie 序列化已内置于 buildRequest
    const built = buildRequest({
      method: workCopy.method ?? DEFAULT_METHOD,
      path: workCopy.path,
      query: workCopy.parameters?.query ?? [],
      header: workCopy.parameters?.header ?? [],
      cookie: workCopy.parameters?.cookie ?? [],
      body: workCopy.requestBody
        ? {
            type: workCopy.requestBody.type,
            rawText: bodyRawText ?? workCopy.requestBody.rawText,
            parameters: workCopy.requestBody.parameters ?? [],
          }
        : undefined,
      resolveVars: (s) => s,
      buildBodyExample,
      apiDetails: workCopy,
      menuRawList,
      insecureSkipVerify,
    })
    const { url, headers, bodyText } = built

    // ====== 前置脚本执行 ======
    if (workCopy.preScript?.trim()) {
      setPreScriptConsole([])
      setPreScriptTests([])
      try {
        const preResult = await executeScript(workCopy.preScript, {
          environment: sessionVars,
          globals: {},
          variables: {},
          request: { url, method: workCopy.method ?? DEFAULT_METHOD, headers, body: bodyText },
        })

        setPreScriptConsole(preResult.consoleEntries)
        setPreScriptTests(preResult.testResults)

        // 将脚本设置的变量存入会话变量
        if (Object.keys(preResult.variableDeltas).length > 0) {
          setSessionVars(preResult.variableDeltas)
        }

        // 应用变量变更到 headers
        for (const [key, value] of Object.entries(preResult.variableDeltas)) {
          headers.forEach(h => {
            h.value = h.value.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
          })
        }

        if (!preResult.success) {
          messageApi.error(`前置脚本执行失败: ${preResult.error}`)
          return
        }
      } catch (err) {
        messageApi.error(`前置脚本执行异常: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
    }

    const runResult = await run(isCreating ? undefined : tabData.key, url, workCopy.method ?? DEFAULT_METHOD, headers, bodyText, built.contentType, built.formDataFiles, built.insecureSkipVerify)

    // ====== 后置脚本执行 ======
    if (workCopy.postScript?.trim() && runResult) {
      setPostScriptConsole([])
      setPostScriptTests([])
      try {
        const postResult = await executeScript(workCopy.postScript, {
          environment: sessionVars,
          globals: {},
          variables: {},
          request: { url, method: workCopy.method ?? DEFAULT_METHOD, headers, body: bodyText },
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

        // 将脚本设置的变量存入会话变量
        if (Object.keys(postResult.variableDeltas).length > 0) {
          setSessionVars(postResult.variableDeltas)
        }

        if (!postResult.success) {
          messageApi.error(`后置脚本执行失败: ${postResult.error}`)
        }
      } catch (err) {
        messageApi.error(`后置脚本执行异常: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const menuName = workCopy.name || '快捷请求'
      if (isCreating) {
        const menuItemId = nanoid(6)
        const runTabInfo: RunTabInfo = {
          serverId: workCopy.serverId,
          parameters: workCopy.parameters,
          bodyType: workCopy.requestBody?.type,
          bodyParameters: workCopy.requestBody?.parameters,
          bodyRawText: workCopy.requestBody?.rawText,
          preScript: workCopy.preScript,
          postScript: workCopy.postScript,
        }
        addMenuItem({
          id: menuItemId,
          name: menuName,
          type: MenuItemType.HttpRequest,
          data: { ...workCopy, name: menuName },
          runTabInfo,
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
        const runTabInfo: RunTabInfo = {
          serverId: workCopy.serverId,
          parameters: workCopy.parameters,
          bodyType: workCopy.requestBody?.type,
          bodyParameters: workCopy.requestBody?.parameters,
          bodyRawText: workCopy.requestBody?.rawText,
          preScript: workCopy.preScript,
          postScript: workCopy.postScript,
        }
        await updateMenuItem({
          id: tabData.key,
          name: menuName,
          data: { ...workCopy, name: menuName },
          runTabInfo,
        })
        messageApi.success('保存成功')
      }
    } catch {
      messageApi.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  useCtrlSave(handleSave, activeTabKey === tabData.key)

  const handleFillBody = () => {
    const text = buildBodyFillText(workCopy, menuRawList)
    setBodyRawText(text)
  }

  const handleTitleConfirm = async () => {
    const newName = titleDraft.trim() || '快捷请求'
    setEditingTitle(false)
    setWorkCopy(prev => ({ ...prev, name: newName }))
    if (!isCreating) {
      await updateMenuItem({
        id: tabData.key,
        name: newName,
        data: { ...workCopy, name: newName },
      }).catch(() => {})
    }
  }

  const handleTitleCancel = () => {
    setEditingTitle(false)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ minWidth: 0, maxWidth: '100%' }}>
      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-3 py-1.5 min-w-0" style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        {editingTitle
          ? (
            <>
              <Input
                size="small"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onPressEnter={() => void handleTitleConfirm()}
                className="max-w-[300px]"
                autoFocus
              />
              <Button size="small" type="primary" onClick={() => void handleTitleConfirm()}>确认</Button>
              <Button size="small" onClick={handleTitleCancel}>取消</Button>
            </>
          )
          : (
            <>
              <Typography.Text strong className="text-sm">{workCopy.name || '快捷请求'}</Typography.Text>
              <Button
                type="text"
                size="small"
                icon={<PencilIcon size={14} />}
                onClick={() => { setTitleDraft(workCopy.name || '快捷请求'); setEditingTitle(true) }}
              />
            </>
          )}
      </div>
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
            variant="borderless"
            className="flex-1 min-w-0"
            placeholder="输入完整 URL，如 https://api.example.com/users"
            value={workCopy.path ?? ''}
            onChange={(e) => {
              setWorkCopy((prev) => ({ ...prev, path: e.target.value }))
            }}
          />
        </div>

        {proxyInfo && (
          <Tooltip title={`代理: ${proxyInfo.tooltip}`}>
            <Tag color="blue" className="shrink-0">{proxyInfo.label} 代理</Tag>
          </Tooltip>
        )}

        {/^https:\/\//i.test(workCopy.path ?? '') && (
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

        <Space.Compact className="shrink-0">
          <Button icon={<ClockIcon size={14} />} title="历史记录" disabled={isCreating} onClick={() => setHistoryOpen(true)} />
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
      <ResponsePanel
        paramsArea={
          <Tabs
            animated={false}
            className="min-w-0 h-full"
            tabBarStyle={{ paddingLeft: 12, marginBottom: 0 }}
            activeKey={activeParamsTab}
            onChange={setActiveParamsTab}
            items={[
              {
                key: 'params',
                label: <TabLabel hasContent={hasParamsContent}>Params</TabLabel>,
                children: (
                  <div className="px-2 min-w-0 overflow-hidden">
                    <QueryParamsPanel
                      value={workCopy.parameters}
                      onChange={(parameters) => setWorkCopy((prev) => ({ ...prev, parameters }))}
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
                      value={workCopy.parameters}
                      onChange={(parameters) => setWorkCopy((prev) => ({ ...prev, parameters }))}
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
                      value={workCopy.parameters}
                      onChange={(parameters) => setWorkCopy((prev) => ({ ...prev, parameters }))}
                    />
                  </div>
                ),
              },
              {
                key: 'body',
                label: <TabLabel hasContent={hasBodyContent}>Body</TabLabel>,
                children: (
                  <BodyPanel
                    requestBody={workCopy.requestBody}
                    bodyRawText={bodyRawText}
                    onBodyTypeChange={(type) => setWorkCopy((prev) => ({
                      ...prev,
                      requestBody: { ...(prev.requestBody || { type: BodyType.None }), type },
                    }))}
                    onBodyRawTextChange={(text) => setBodyRawText(text)}
                    onBodyParametersChange={(parameters) => setWorkCopy((prev) => ({
                      ...prev,
                      requestBody: { ...(prev.requestBody || { type: BodyType.None }), parameters: parameters as Parameter[] },
                    }))}
                    onFillBody={handleFillBody}
                    buildBodyExample={() => buildBodyExample(workCopy, menuRawList)}
                  />
                ),
              },
              {
                key: 'scripts',
                label: <TabLabel hasContent={hasScriptsContent}>Scripts</TabLabel>,
                children: (
                  <div className="px-3 pb-3">
                    <ScriptsPanel
                      preScript={workCopy.preScript}
                      postScript={workCopy.postScript}
                      onPreScriptChange={(value) => setWorkCopy((prev) => ({ ...prev, preScript: value }))}
                      onPostScriptChange={(value) => setWorkCopy((prev) => ({ ...prev, postScript: value }))}
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
            menuItemId={isCreating ? undefined : tabData.key}
            curlContent={(() => {
              const qPath = workCopy.path ?? '/'
              const qQuery = (workCopy.parameters?.query ?? [])
                .filter(p => p.name && p.enable !== false)
                .map(p => `${encodeURIComponent(p.name as string)}=${encodeURIComponent(String(p.example ?? ''))}`)
                .join('&')
              const url = qQuery ? `${qPath}${qPath.includes('?') ? '&' : '?'}${qQuery}` : qPath
              const method = workCopy.method ?? DEFAULT_METHOD
              return (
                <div className="flex flex-col gap-3">
                  <div>
                    <Typography.Text strong className="mb-1 block text-xs">Windows</Typography.Text>
                    <pre className="m-0 rounded p-2 text-xs overflow-auto" style={{ backgroundColor: token.colorFillTertiary, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {`curl -X ${method} "${url}"`}
                    </pre>
                  </div>
                  <div>
                    <Typography.Text strong className="mb-1 block text-xs">Linux / macOS</Typography.Text>
                    <pre className="m-0 rounded p-2 text-xs overflow-auto" style={{ backgroundColor: token.colorFillTertiary, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {`curl -X ${method} '${url}'`}
                    </pre>
                  </div>
                </div>
              )
            })()}
          />
        }
        hasResult={!!(result || error)}
        autoSaveId="quick-request-run"
      />

      {!isCreating && <HistoryPanel menuItemId={tabData.key} open={historyOpen} onClose={() => setHistoryOpen(false)} />}
    </div>
  )
}
