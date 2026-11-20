'use client'

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import {
  Button,
  Dropdown,
  List,
  message,
  Modal,
  Table,
  Tabs,
  Tag,
  theme,
  Tooltip,
  Typography,
} from 'antd'
import { MoreHorizontalIcon, TerminalIcon } from 'lucide-react'

import { api } from '@/api-client'
import { MonacoEditor } from '@/components/MonacoEditor'
import { useAuth } from '@/contexts/auth'
import { useProxyConfig } from '@/contexts/proxy-config'
import { useStyles } from '@/hooks/useStyle'
import type { ApiRunHeader, ApiRunResult } from '@/types'

import { buildMarkdownReport, downloadText } from '../exportMarkdown'
import { parseQueryPairsFromUrl } from '../historyUtils'
import type { ResolvedVar } from '../useResolvedVarMap'
import { calcBodySize, detectLanguage, getStatusColor, headerTableColumns } from '../utils'

import { ErrorDisplay } from './ErrorDisplay'
import { formatTime } from './HistoryPanel'
import { MarkdownDiffView } from './MarkdownDiffView'
import { ResponseBodyViewer } from './ResponseBodyViewer'
import { renderVarHighlight } from './VarHighlightText'

import { css } from '@emotion/css'

interface ResultViewerProps {
  result?: ApiRunResult
  error?: string
  curlContent?: ReactNode
  onRetry?: () => void
  menuItemId?: string
  /** 最近一次实际发送请求的变量位置映射（有则请求内容/请求头展示高亮） */
  requestVars?: {
    urlBase: string
    urlPath: { resolved: string, vars: ResolvedVar[] }
    urlQuery: string
    headers: ({ name: string, resolved: string, vars: ResolvedVar[] } | null)[]
    body: { resolved: string, vars: ResolvedVar[] } | null
  }
}

interface HistoryPickItem {
  id: string
  statusCode: number
  requestJson: { method: string, url: string }
  responseJson: ApiRunResult
  createdAt: string
}

export function ResultViewer({ result, error, curlContent, onRetry, menuItemId, requestVars }: ResultViewerProps) {
  const { token } = theme.useToken()
  const { t } = useTranslation()
  const { proxyConfig } = useProxyConfig()
  const { projectId } = useParams()
  const { sessionId } = useAuth()
  const proxyTooltip = proxyConfig && proxyConfig.proxyType !== 'none'
    ? `${proxyConfig.host}:${proxyConfig.port}`
    : null
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyList, setHistoryList] = useState<HistoryPickItem[]>([])
  const [compareWith, setCompareWith] = useState<ApiRunResult | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)

  const openHistoryPicker = async () => {
    if (!menuItemId || !sessionId || !projectId) { return }

    try {
      const list = await api<HistoryPickItem[]>('list_request_history', { sessionId, projectId, menuItemId })
      setHistoryList(list)
      setHistoryOpen(true)
    }
    catch {
      message.error(t('api.history.loadFailed'))
    }
  }

  const startCompare = (item: HistoryPickItem) => {
    setCompareWith(item.responseJson)
    setHistoryOpen(false)
    setDiffOpen(true)
  }

  // 格式化按钮状态
  const isJson = result?.contentType?.toLowerCase().includes('json')
  const FORMAT_SIZE_LIMIT = 200 * 1024
  const bodySize = result?.body ? new Blob([result.body]).size : 0
  const isLarge = bodySize > FORMAT_SIZE_LIMIT
  const [showFormatted, setShowFormatted] = useState(isJson && !isLarge)
  const [activeTab, setActiveTab] = useState(result?.body ? 'resContent' : 'reqContent')

  useEffect(() => {
    setShowFormatted(isJson && !isLarge)
  }, [result?.body, result?.contentType, isJson, isLarge])

  // 结果异步到达（运行完成 / 恢复历史结果）时切到响应内容页签；
  // 只跟随 result 引用变化，不干扰用户手动切换。
  const lastResultRef = useRef(result)

  useEffect(() => {
    if (lastResultRef.current === result) { return }

    lastResultRef.current = result
    setActiveTab(result?.body != null ? 'resContent' : 'reqContent')
  }, [result])

  const monacoOptions = useMemo(() => ({
    readOnly: true,
    lineNumbers: 'on' as const,
    minimap: { enabled: false } as const,
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    renderValidationDecorations: 'off' as const,
    showDeprecated: false,
  }), [])

  const { styles } = useStyles(() => ({
    resultContent: css({
      display: 'flex',
      flexDirection: 'column',
      flex: '1 1 0',
      minHeight: 0,
      '& > .ant-tabs-nav': {
        flexShrink: 0,
      },
      '& .ant-tabs-content-holder': {
        flex: '1 1 0',
        minHeight: 0,
        overflow: 'auto',
      },
      '& .ant-tabs-tabpane-active': {
        height: '100%',
      },
    }),
  }))

  // 网络层错误（status === 0）且有结构化错误信息
  if (result?.status === 0 && result.errorInfo) {
    return <ErrorDisplay errorInfo={result.errorInfo} onRetry={onRetry} />
  }

  // 应用层错误（Tauri 调用失败等）
  if (error && !result) {
    return (
      <ErrorDisplay
        errorInfo={{
          errorType: 'unknown',
          errorMessage: error,
          errorDetail: '',
          suggestion: t('api.run.genericSuggestion'),
        }}
      />
    )
  }

  if (!result) { return null }

  const headersCountLabel = (label: string, count?: number) => (
    count
      ? t('api.run.headersCount', { label, count })
      : label
  )

  const tabsItems = [
    {
      key: 'resContent',
      label: t('api.run.tabResponseBody'),
      children: result.body != null
        ? (
            <ResponseBodyViewer
              body={result.body}
              bodyBase64={result.bodyBase64}
              bodySize={result.bodySize}
              contentType={result.contentType}
              fileName={result.url}
              isBinary={result.isBinary}
              showFormatted={showFormatted}
              onToggleFormat={() => { setShowFormatted((v) => !v) }}
            />
          )
        : <Typography.Text className="text-xs" type="secondary">{t('api.run.noResponseBody')}</Typography.Text>,
    },
    {
      key: 'resHeaders',
      label: headersCountLabel(t('api.run.tabResponseHeaders'), result.headers?.length),
      children: result.headers && result.headers.length > 0
        ? (
            <Table
              columns={headerTableColumns}
              dataSource={result.headers}
              pagination={false}
              rowKey="name"
              size="small"
            />
          )
        : <Typography.Text className="text-xs" type="secondary">{t('api.run.noResponseHeaders')}</Typography.Text>,
    },
    {
      key: 'reqContent',
      label: t('api.run.tabRequestBody'),
      children: (
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 rounded p-1 text-xs" style={{ backgroundColor: token.colorFillTertiary, fontFamily: 'monospace' }}>
            <span className="font-medium opacity-60">URL: </span>
            {requestVars
              ? (
                  <span className="break-all">
                    <span className="opacity-80">{requestVars.urlBase}</span>
                    {renderVarHighlight(requestVars.urlPath.resolved, requestVars.urlPath.vars, 'url-path')}
                    {requestVars.urlQuery && <span className="opacity-80">{`?${requestVars.urlQuery}`}</span>}
                  </span>
                )
              : <span className="break-all">{result.url ?? '-'}</span>}
          </div>
          {requestVars?.body && (
            <div className="mt-1 shrink-0 rounded p-1 text-xs" style={{ backgroundColor: token.colorFillTertiary, fontFamily: 'monospace' }}>
              <span className="font-medium opacity-60">Body: </span>
              <span className="whitespace-pre-wrap break-all">{renderVarHighlight(requestVars.body.resolved, requestVars.body.vars, 'req-body')}</span>
            </div>
          )}
          {!requestVars?.body && result.requestBodyText && (
            <div className="mt-1 min-h-0 flex-1">
              <MonacoEditor
                height="100%"
                language={detectLanguage(result.contentType)}
                options={monacoOptions}
                value={result.requestBodyText}
              />
            </div>
          )}
          {result.requestBodyParameters && result.requestBodyParameters.length > 0 && (
            <div className="mt-1 shrink-0">
              <Table
                columns={headerTableColumns}
                dataSource={result.requestBodyParameters}
                pagination={false}
                rowKey="name"
                size="small"
              />
            </div>
          )}
          {!requestVars?.body && !result.requestBodyText && (!result.requestBodyParameters || result.requestBodyParameters.length === 0) && (
            <Typography.Text className="text-xs" type="secondary">{t('api.run.noRequestBody')}</Typography.Text>
          )}
        </div>
      ),
    },
    {
      key: 'reqHeaders',
      // 优先展示实际发出的请求头（后端回显，含自动附加的 Content-Type / cookie jar Cookie）；
      // 无回显时回退到构建快照 requestVars（保留变量高亮）。
      label: headersCountLabel(
        t('api.run.tabRequestHeaders'),
        result.requestHeaders?.length || requestVars?.headers.length,
      ),
      children: result.requestHeaders && result.requestHeaders.length > 0
        ? (
            <Table
              columns={[
                headerTableColumns[0],
                {
                  title: t('common.value'),
                  dataIndex: 'value',
                  key: 'value',
                  render: (value: string, record: ApiRunHeader) => (
                    record.sent === false
                      ? (
                          <Tooltip title={t('api.run.headerNotSent')}>
                            <span className="italic" style={{ color: token.colorTextTertiary }}>{value}</span>
                          </Tooltip>
                        )
                      : value
                  ),
                },
              ]}
              dataSource={result.requestHeaders}
              pagination={false}
              rowKey="name"
              size="small"
            />
          )
        : requestVars && requestVars.headers.length > 0
          ? (
              <Table
                columns={[
                  ...headerTableColumns.slice(0, 1),
                  {
                    title: t('common.value'),
                    dataIndex: 'value',
                    key: 'value',
                    render: (_: unknown, __: unknown, index: number) => {
                      const f = requestVars.headers[index]

                      return f ? renderVarHighlight(f.resolved, f.vars, `req-hdr-${index}`) : null
                    },
                  },
                ]}
                dataSource={requestVars.headers.map((f, i) => ({
                  name: f?.name ?? result.requestHeaders?.[i]?.name ?? '',
                  value: f?.resolved ?? result.requestHeaders?.[i]?.value ?? '',
                }))}
                pagination={false}
                rowKey="name"
                size="small"
              />
            )
          : <Typography.Text className="text-xs" type="secondary">{t('api.run.noRequestHeaders')}</Typography.Text>,
    },
    {
      key: 'curl',
      label: (
        <span className="flex items-center gap-1">
          <TerminalIcon size={14} />
          cURL
        </span>
      ),
      children: curlContent ?? <Typography.Text className="text-xs" type="secondary">{t('api.run.noCurl')}</Typography.Text>,
    },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        activeKey={activeTab}
        className={styles.resultContent}
        items={tabsItems}
        size="small"
        tabBarExtraContent={{
          right: (
            <div className="flex max-w-full items-center gap-3 overflow-hidden text-sm">
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'export',
                      label: t('api.run.exportMarkdown'),
                      onClick: () => {
                        const requestQuery = result.requestQuery && result.requestQuery.length > 0
                          ? result.requestQuery
                          : parseQueryPairsFromUrl(result.url)
                        const md = buildMarkdownReport(
                          { url: result.url, method: result.method, headers: result.requestHeaders, body: result.requestBodyText, contentType: result.contentType, query: requestQuery },
                          { status: result.status, statusText: result.statusText, headers: result.headers, body: result.body, durationMs: result.durationMs, contentType: result.contentType },
                        )
                        downloadText(t('api.run.reportFileName', { status: result.status, ts: Date.now() }), md)
                      },
                    },
                    {
                      key: 'compare',
                      label: t('api.run.compareHistory'),
                      disabled: !menuItemId,
                      onClick: () => void openHistoryPicker(),
                    },
                    ...(activeTab === 'resContent' && isJson
                      ? [
                          {
                            key: 'format',
                            label: showFormatted ? t('api.run.showRaw') : t('api.run.formatJson'),
                            onClick: () => { setShowFormatted((v) => !v) },
                          },
                        ]
                      : []),
                  ],
                }}
              >
                <Button
                  aria-label={t('api.run.moreActions')}
                  icon={<MoreHorizontalIcon size={14} />}
                  size="small"
                  type="text"
                />
              </Dropdown>
              <Tag className="shrink-0" color={getStatusColor(result.status)}>
                {result.status > 0 ? `${result.status} ${result.statusText}` : result.statusText}
              </Tag>
              <span className="truncate text-xs opacity-50">
                {result.method?.toUpperCase()}
                {result.proxyType && result.proxyType !== 'none' && (
                  <Tooltip title={proxyTooltip ? t('api.run.proxyTooltip', { value: proxyTooltip }) : undefined}>
                    <span>
                      {' | '}
                      {t('api.run.proxyLabel', { type: result.proxyType === 'socks5' ? 'SOCKS5' : 'HTTP' })}
                    </span>
                  </Tooltip>
                )}
                {' | '}{result.durationMs}ms
                {result.body ? ` | ${calcBodySize(result.body)}` : result.bodySize != null ? ` | ${result.bodySize}B` : ''}
              </span>
            </div>
          ),
        }}
        onChange={setActiveTab}
      />

      <Modal footer={null} open={historyOpen} title={t('api.history.pickTitle')} width={640} onCancel={() => { setHistoryOpen(false) }}>
        <List
          dataSource={historyList}
          renderItem={(item) => (
            <List.Item actions={[<Tag color={getStatusColor(item.statusCode)}>{item.statusCode || 'ERR'}</Tag>]} className="cursor-pointer" onClick={() => { startCompare(item) }}>
              <List.Item.Meta description={formatTime(item.createdAt)} title={`${item.requestJson.method} ${item.requestJson.url}`} />
            </List.Item>
          )}
          size="small"
        />
      </Modal>

      <Modal footer={null} open={diffOpen} title={t('api.run.diffTitle')} width={900} onCancel={() => { setDiffOpen(false) }}>
        {compareWith && (
          <MarkdownDiffView
            leftText={compareWith.body ?? ''}
            leftTitle={t('api.run.diffLeftTitle')}
            rightText={result.body ?? ''}
            rightTitle={t('api.run.diffRightTitle')}
          />
        )}
      </Modal>
    </div>
  )
}
