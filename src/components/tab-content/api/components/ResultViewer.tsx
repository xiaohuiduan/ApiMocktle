'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
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
import type { ApiRunResult } from '@/types'

import { buildMarkdownReport, downloadText } from '../exportMarkdown'
import { calcBodySize, detectLanguage, getStatusColor, headerTableColumns } from '../utils'

import { ErrorDisplay } from './ErrorDisplay'
import { formatTime } from './HistoryPanel'
import { MarkdownDiffView } from './MarkdownDiffView'
import { ResponseBodyViewer } from './ResponseBodyViewer'

import { css } from '@emotion/css'

interface ResultViewerProps {
  result?: ApiRunResult
  error?: string
  curlContent?: ReactNode
  onRetry?: () => void
  menuItemId?: string
}

interface HistoryPickItem {
  id: string
  statusCode: number
  requestJson: { method: string, url: string }
  responseJson: ApiRunResult
  createdAt: string
}

export function ResultViewer({ result, error, curlContent, onRetry, menuItemId }: ResultViewerProps) {
  const { token } = theme.useToken()
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
      message.error('获取历史记录失败')
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
          suggestion: '请检查操作是否正确，如果问题持续请尝试重新登录',
        }}
      />
    )
  }

  if (!result) { return null }

  const tabsItems = [
    {
      key: 'resContent',
      label: '响应内容',
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
        : <Typography.Text className="text-xs" type="secondary">无响应体</Typography.Text>,
    },
    {
      key: 'resHeaders',
      label: `响应头${result.headers?.length ? ` (${result.headers.length})` : ''}`,
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
        : <Typography.Text className="text-xs" type="secondary">无响应头</Typography.Text>,
    },
    {
      key: 'reqContent',
      label: '请求内容',
      children: (
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 rounded p-1 text-xs" style={{ backgroundColor: token.colorFillTertiary, fontFamily: 'monospace' }}>
            <span className="font-medium opacity-60">URL: </span>
            <span className="break-all">{result.url ?? '-'}</span>
          </div>
          {result.requestBodyText && (
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
          {!result.requestBodyText && (!result.requestBodyParameters || result.requestBodyParameters.length === 0) && (
            <Typography.Text className="text-xs" type="secondary">无请求体</Typography.Text>
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
              columns={headerTableColumns}
              dataSource={result.requestHeaders}
              pagination={false}
              rowKey="name"
              size="small"
            />
          )
        : <Typography.Text className="text-xs" type="secondary">无请求头</Typography.Text>,
    },
    {
      key: 'curl',
      label: (
        <span className="flex items-center gap-1">
          <TerminalIcon size={14} />
          cURL
        </span>
      ),
      children: curlContent ?? <Typography.Text className="text-xs" type="secondary">无 cURL 命令</Typography.Text>,
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
                      label: '导出 Markdown',
                      onClick: () => {
                        const md = buildMarkdownReport(
                          { url: result.url, method: result.method, headers: result.requestHeaders, body: result.requestBodyText, contentType: result.contentType, query: result.requestQuery },
                          { status: result.status, statusText: result.statusText, headers: result.headers, body: result.body, durationMs: result.durationMs, contentType: result.contentType },
                        )
                        downloadText(`接口报告-${result.status}-${Date.now()}.md`, md)
                      },
                    },
                    {
                      key: 'compare',
                      label: '对比历史',
                      disabled: !menuItemId,
                      onClick: () => void openHistoryPicker(),
                    },
                    ...(activeTab === 'resContent' && isJson
                      ? [
                          {
                            key: 'format',
                            label: showFormatted ? '查看原始' : '格式化 JSON',
                            onClick: () => { setShowFormatted((v) => !v) },
                          },
                        ]
                      : []),
                  ],
                }}
              >
                <Button
                  aria-label="更多操作"
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
                  <Tooltip title={proxyTooltip ? `代理: ${proxyTooltip}` : undefined}>
                    <span> | {result.proxyType === 'socks5' ? 'SOCKS5' : 'HTTP'} 代理</span>
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

      <Modal footer={null} open={historyOpen} title="选择历史记录对比" width={640} onCancel={() => { setHistoryOpen(false) }}>
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

      <Modal footer={null} open={diffOpen} title="响应对比（当前 vs 历史）" width={900} onCancel={() => { setDiffOpen(false) }}>
        {compareWith && (
          <MarkdownDiffView
            leftText={compareWith.body ?? ''}
            leftTitle="历史响应"
            rightText={result.body ?? ''}
            rightTitle="当前响应"
          />
        )}
      </Modal>
    </div>
  )
}
