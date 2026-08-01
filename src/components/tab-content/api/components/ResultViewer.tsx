'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'

import {
  Button,
  Dropdown,
  List,
  Modal,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd'
import { MoreHorizontalIcon, TerminalIcon } from 'lucide-react'

import { api } from '@/api-client'
import { useProxyConfig } from '@/contexts/proxy-config'
import { useAuth } from '@/contexts/auth'
import { MonacoEditor } from '@/components/MonacoEditor'
import { useStyles } from '@/hooks/useStyle'
import type { ApiRunResult } from '@/types'

import { ResponseBodyViewer } from './ResponseBodyViewer'
import { ErrorDisplay } from './ErrorDisplay'
import { MarkdownDiffView } from './MarkdownDiffView'
import { buildMarkdownReport, downloadText } from '../exportMarkdown'
import { formatTime } from './HistoryPanel'
import { calcBodySize, detectLanguage, getStatusColor, headerTableColumns } from '../utils'

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
  requestJson: { method: string; url: string }
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
    if (!menuItemId || !sessionId || !projectId) return
    try {
      const list = await api<HistoryPickItem[]>('list_request_history', { sessionId, projectId, menuItemId })
      setHistoryList(list)
      setHistoryOpen(true)
    } catch {
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

  const { styles } = useStyles(({ token }) => ({
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

  if (!result) return null

  const tabsItems = [
    {
      key: 'resContent',
      label: '响应内容',
      children: result.body != null
        ? (
            <ResponseBodyViewer
              body={result.body}
              contentType={result.contentType}
              showFormatted={showFormatted}
              onToggleFormat={() => setShowFormatted(v => !v)}
              isBinary={result.isBinary}
              bodyBase64={result.bodyBase64}
              bodySize={result.bodySize}
              fileName={result.url}
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
      key: 'reqContent',
      label: '请求内容',
      children: (
        <div className="flex flex-col h-full min-h-0">
          <div className="rounded p-1 text-xs flex-shrink-0" style={{ backgroundColor: token.colorFillTertiary, fontFamily: 'monospace' }}>
            <span className="font-medium opacity-60">URL: </span>
            <span className="break-all">{result.url ?? '-'}</span>
          </div>
          {result.requestBodyText && (
            <div className="flex-1 min-h-0 mt-1">
              <MonacoEditor
                height="100%"
                language={detectLanguage(result.contentType)}
                value={result.requestBodyText}
                options={monacoOptions}
              />
            </div>
          )}
          {result.requestBodyParameters && result.requestBodyParameters.length > 0 && (
            <div className="flex-shrink-0 mt-1">
              <Table
                size="small"
                dataSource={result.requestBodyParameters}
                columns={headerTableColumns}
                pagination={false}
                rowKey="name"
              />
            </div>
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
      key: 'curl',
      label: (
        <span className="flex items-center gap-1">
          <TerminalIcon size={14} />
          cURL
        </span>
      ),
      children: curlContent ?? <Typography.Text type="secondary" className="text-xs">无 cURL 命令</Typography.Text>,
    },
  ]

  return (
    <div className="flex flex-col h-full min-h-0">
      <Tabs
        size="small"
        className={styles.resultContent}
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabsItems}
        tabBarExtraContent={{
          right: (
            <div className="flex items-center gap-3 text-sm max-w-full overflow-hidden">
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
                      ? [{
                          key: 'format',
                          label: showFormatted ? '查看原始' : '格式化 JSON',
                          onClick: () => setShowFormatted(v => !v),
                        }]
                      : []),
                  ],
                }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<MoreHorizontalIcon size={14} />}
                  aria-label="更多操作"
                />
              </Dropdown>
              <Tag className="flex-shrink-0" color={getStatusColor(result.status)}>
                {result.status > 0 ? `${result.status} ${result.statusText}` : result.statusText}
              </Tag>
              <span className="text-xs opacity-50 truncate">
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
          )
        }}
      />

      <Modal title="选择历史记录对比" open={historyOpen} footer={null} onCancel={() => setHistoryOpen(false)} width={640}>
        <List
          size="small"
          dataSource={historyList}
          renderItem={(item) => (
            <List.Item className="cursor-pointer" onClick={() => startCompare(item)} actions={[<Tag color={getStatusColor(item.statusCode)}>{item.statusCode || 'ERR'}</Tag>]}>
              <List.Item.Meta title={`${item.requestJson.method} ${item.requestJson.url}`} description={formatTime(item.createdAt)} />
            </List.Item>
          )}
        />
      </Modal>

      <Modal title="响应对比（当前 vs 历史）" open={diffOpen} footer={null} onCancel={() => setDiffOpen(false)} width={900}>
        {compareWith && (
          <MarkdownDiffView
            leftText={compareWith.body ?? ''}
            rightText={result.body ?? ''}
            leftTitle="历史响应"
            rightTitle="当前响应"
          />
        )}
      </Modal>
    </div>
  )
}
