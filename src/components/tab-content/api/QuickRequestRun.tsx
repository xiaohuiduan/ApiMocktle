import { useEffect, useMemo, useState } from 'react'
import { useProxyConfig } from '@/contexts/proxy-config'

import {
  Button,
  Input,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import { PlayIcon } from 'lucide-react'
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
import type { ApiDetails } from '@/types'

import { ParamsEditableTable } from './components/ParamsEditableTable'
import { ParamsTab } from './params/ParamsTab'
import { useApiRequestRunner } from './useApiRequestRunner'
import { ResponsePanel } from './components/ResponsePanel'
import { ResultViewer } from './components/ResultViewer'

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
  const [insecureSkipVerify, setInsecureSkipVerify] = useState(false)

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

    await run(url, workCopy.method ?? DEFAULT_METHOD, headers, bodyText, contentType, formDataFiles, insecureSkipVerify)
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
    <div className="flex h-full flex-col overflow-hidden" style={{ minWidth: 0, maxWidth: '100%' }}>
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

        {proxyInfo && (
          <Tooltip title={`代理: ${proxyInfo.tooltip}`}>
            <Tag color="blue" className="shrink-0">{proxyInfo.label} 代理</Tag>
          </Tooltip>
        )}

        {/^https:\/\//i.test(workCopy.path ?? '') && (
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
      <ResponsePanel
        paramsArea={
          <>
            {/* 参数编辑区 */}
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

          </>
        }
        resultArea={
          <ResultViewer
            result={result}
            error={error}
            onRetry={handleRun}
            curlContent={(() => {
              const url = buildRunUrl()
              const method = workCopy.method ?? DEFAULT_METHOD
              return (
                <div className="flex flex-col gap-3">
                  <div>
                    <Typography.Text strong className="mb-1 block text-xs">Windows</Typography.Text>
                    <pre className="m-0 rounded bg-gray-100 p-2 text-xs overflow-auto" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {`curl -X ${method} "${url}"`}
                    </pre>
                  </div>
                  <div>
                    <Typography.Text strong className="mb-1 block text-xs">Linux / macOS</Typography.Text>
                    <pre className="m-0 rounded bg-gray-100 p-2 text-xs overflow-auto" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
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
    </div>
  )
}
