'use client'

import { ReactNode, useMemo } from 'react'

import {
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { TerminalIcon } from 'lucide-react'

import { useProxyConfig } from '@/contexts/proxy-config'
import { MonacoEditor } from '@/components/MonacoEditor'
import { useStyles } from '@/hooks/useStyle'
import type { ApiRunResult } from '@/types'

import { ResponseBodyViewer } from './ResponseBodyViewer'
import { ErrorDisplay } from './ErrorDisplay'
import { calcBodySize, detectLanguage, getStatusColor, headerTableColumns } from '../utils'

import { css } from '@emotion/css'

interface ResultViewerProps {
  result?: ApiRunResult
  error?: string
  curlContent?: ReactNode
  onRetry?: () => void
}

export function ResultViewer({ result, error, curlContent, onRetry }: ResultViewerProps) {
  const { proxyConfig } = useProxyConfig()
  const proxyTooltip = proxyConfig && proxyConfig.proxyType !== 'none'
    ? `${proxyConfig.host}:${proxyConfig.port}`
    : null

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
      key: 'reqContent',
      label: '请求内容',
      children: (
        <div className="flex flex-col h-full min-h-0">
          <div className="rounded bg-gray-50 p-2 text-xs flex-shrink-0" style={{ fontFamily: 'monospace' }}>
            <span className="font-medium opacity-60">URL: </span>
            <span className="break-all">{result.url ?? '-'}</span>
          </div>
          {result.requestBodyText && (
            <div className="flex-1 min-h-0 mt-2">
              <MonacoEditor
                height="100%"
                language={detectLanguage(result.contentType)}
                value={result.requestBodyText}
                options={monacoOptions}
              />
            </div>
          )}
          {result.requestBodyParameters && result.requestBodyParameters.length > 0 && (
            <div className="flex-shrink-0 mt-2">
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
      key: 'resContent',
      label: '响应内容',
      children: result.body != null
        ? (
            <ResponseBodyViewer
              body={result.body}
              contentType={result.contentType}
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
      children: curlContent ?? <Typography.Text type="secondary" className="text-xs">无 cURL 命令</Typography.Text>,
    },
  ]

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mb-2 flex flex-wrap items-center gap-3 flex-shrink-0">
        <Tag color={getStatusColor(result.status)}>{result.status > 0 ? `${result.status} ${result.statusText}` : result.statusText}</Tag>
        {result.proxyType && result.proxyType !== 'none' && (
          <Tooltip title={proxyTooltip ? `代理: ${proxyTooltip}` : undefined}>
            <Tag color="blue">{result.proxyType === 'socks5' ? 'SOCKS5' : 'HTTP'} 代理</Tag>
          </Tooltip>
        )}
        <span className="text-xs opacity-50">
          {result.method?.toUpperCase()} | {result.durationMs}ms
          {result.body ? ` | ${calcBodySize(result.body)}` : ''}
        </span>
      </div>

      <Tabs size="small" className={styles.resultContent} items={tabsItems} />
    </div>
  )
}
