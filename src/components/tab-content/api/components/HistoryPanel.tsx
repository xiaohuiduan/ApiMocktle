'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'

import { Button, Drawer, List, Spin, Table, Tag, Typography, theme } from 'antd'

import { api } from '@/api-client'
import { MonacoEditor } from '@/components/MonacoEditor'
import { useAuth } from '@/contexts/auth'
import type { ApiRunResult } from '@/types'

import { ResponseBodyViewer } from './ResponseBodyViewer'
import { calcBodySize, detectLanguage, getStatusColor, headerTableColumns } from '../utils'

interface RequestHistoryItem {
  id: string
  menuItemId: string
  requestJson: { url: string, method: string, headers: Array<{ name: string, value: string }>, body: string, contentType?: string }
  responseJson: ApiRunResult
  statusCode: number
  durationMs: number
  createdAt: string
}

interface HistoryPanelProps {
  menuItemId: string
  open: boolean
  onClose: () => void
}

export function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

export function HistoryPanel({ menuItemId, open, onClose }: HistoryPanelProps) {
  const { token } = theme.useToken()
  const { projectId } = useParams()
  const { sessionId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<RequestHistoryItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedItem = useMemo(() => items.find(i => i.id === selectedId), [items, selectedId])

  const loadHistory = useCallback(async () => {
    if (!sessionId || !projectId) return
    setLoading(true)
    try {
      const list = await api<RequestHistoryItem[]>('list_request_history', { sessionId, projectId, menuItemId })
      setItems(list)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [sessionId, projectId, menuItemId])

  useEffect(() => {
    if (open) {
      void loadHistory()
      setSelectedId(null)
    }
  }, [open, loadHistory])

  const monacoOptions = useMemo(() => ({
    readOnly: true,
    lineNumbers: 'on' as const,
    minimap: { enabled: false } as const,
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    renderValidationDecorations: 'off' as const,
    showDeprecated: false,
  }), [])

  const result = selectedItem?.responseJson
  const reqJson = selectedItem?.requestJson as { url?: string, method?: string, headers?: Array<{ name: string, value: string }>, body?: string, contentType?: string } | undefined

  // 优先用 responseJson 中的，回退到 requestJson
  const effectiveRequestBodyText = result?.requestBodyText ?? (reqJson?.body ? reqJson.body : undefined)
  const effectiveContentType = result?.contentType ?? reqJson?.contentType
  const effectiveRequestHeaders = (result?.requestHeaders && result.requestHeaders.length > 0)
    ? result.requestHeaders
    : (reqJson?.headers && reqJson.headers.length > 0) ? reqJson.headers : undefined
  const effectiveRequestQuery = (result?.requestQuery && result.requestQuery.length > 0)
    ? result.requestQuery
    : (() => {
        try {
          if (!result?.url) return undefined
          const params: Array<{ name: string, value: string }> = []
          new URL(result.url).searchParams.forEach((value, name) => params.push({ name, value }))
          return params.length > 0 ? params : undefined
        } catch { return undefined }
      })()

  return (
    <Drawer
      title="历史记录"
      placement="right"
      width="80%"
      open={open}
      onClose={onClose}
      styles={{ body: { padding: 0, display: 'flex', overflow: 'hidden' } }}
    >
      {/* 左侧列表 */}
      <div className="flex shrink-0 flex-col" style={{ width: 220, borderRight: `1px solid ${token.colorBorderSecondary}` }}>
        <div className="flex items-center justify-between px-3 py-2">
          <Typography.Text strong className="text-xs">共 {items.length} 条</Typography.Text>
          <Button size="small" type="link" onClick={() => void loadHistory()}>刷新</Button>
        </div>
        <div className="flex-1 overflow-auto">
          <Spin spinning={loading}>
            {items.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <Typography.Text type="secondary" className="text-xs">暂无历史记录</Typography.Text>
              </div>
            ) : (
              <List
                size="small"
                dataSource={items}
                renderItem={(item) => (
                  <div
                    className="cursor-pointer px-3 py-2 transition-colors"
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      backgroundColor: selectedId === item.id ? token.colorPrimaryBg : undefined,
                      borderLeft: selectedId === item.id ? `2px solid ${token.colorPrimary}` : '2px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedId !== item.id) e.currentTarget.style.backgroundColor = token.colorFillTertiary
                    }}
                    onMouseLeave={(e) => {
                      if (selectedId !== item.id) e.currentTarget.style.backgroundColor = ''
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <Tag color={getStatusColor(item.statusCode)} className="!m-0" style={{ fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>
                        {item.statusCode || 'ERR'}
                      </Tag>
                      <Typography.Text className="text-xs font-medium">{item.requestJson.method}</Typography.Text>
                      <Typography.Text type="secondary" className="text-[11px]">{item.durationMs}ms</Typography.Text>
                    </div>
                    <Typography.Text type="secondary" className="mt-0.5 block truncate text-[11px]" title={item.requestJson.url}>
                      {item.requestJson.url}
                    </Typography.Text>
                    <Typography.Text type="secondary" className="block text-[10px]">{formatTime(item.createdAt)}</Typography.Text>
                  </div>
                )}
              />
            )}
          </Spin>
        </div>
      </div>

      {/* 右侧详情 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selectedItem ? (
          <div className="flex flex-1 items-center justify-center">
            <Typography.Text type="secondary">点击左侧记录查看详情</Typography.Text>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-auto p-4">
            {/* 请求摘要 */}
            <div className="mb-4 flex items-center gap-2">
              <Tag color={getStatusColor(result?.status ?? 0)}>{result?.status ?? 'ERR'} {result?.statusText ?? ''}</Tag>
              <Typography.Text strong>{result?.method?.toUpperCase()}</Typography.Text>
              <Typography.Text type="secondary" className="text-xs">{result?.durationMs}ms{result?.body ? ` | ${calcBodySize(result.body)}` : ''}</Typography.Text>
            </div>

            {/* 请求区 */}
            <Typography.Text strong className="mb-2 block text-sm">请求</Typography.Text>
            <div className="mb-4 rounded p-2 text-xs" style={{ backgroundColor: token.colorFillTertiary, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              <span className="font-medium opacity-60">URL: </span>{result?.url ?? '-'}
            </div>

            {effectiveRequestHeaders && (
              <div className="mb-3">
                <Typography.Text type="secondary" className="mb-1 block text-xs">请求头 ({effectiveRequestHeaders.length})</Typography.Text>
                <Table size="small" dataSource={effectiveRequestHeaders} columns={headerTableColumns} pagination={false} rowKey="name" />
              </div>
            )}

            {effectiveRequestQuery && (
              <div className="mb-3">
                <Typography.Text type="secondary" className="mb-1 block text-xs">Query 参数 ({effectiveRequestQuery.length})</Typography.Text>
                <Table size="small" dataSource={effectiveRequestQuery} columns={headerTableColumns} pagination={false} rowKey="name" />
              </div>
            )}

            {effectiveRequestBodyText && (
              <div className="mb-3" style={{ height: 200 }}>
                <Typography.Text type="secondary" className="mb-1 block text-xs">请求体</Typography.Text>
                <MonacoEditor height="100%" language={detectLanguage(effectiveContentType)} value={effectiveRequestBodyText} options={monacoOptions} />
              </div>
            )}

            {result?.requestBodyParameters && result.requestBodyParameters.length > 0 && (
              <div className="mb-3">
                <Typography.Text type="secondary" className="mb-1 block text-xs">请求体参数 ({result.requestBodyParameters.length})</Typography.Text>
                <Table size="small" dataSource={result.requestBodyParameters} columns={headerTableColumns} pagination={false} rowKey="name" />
              </div>
            )}

            {/* 响应区 */}
            <Typography.Text strong className="mb-2 mt-2 block text-sm">响应</Typography.Text>

            {result?.headers && result.headers.length > 0 && (
              <div className="mb-3">
                <Typography.Text type="secondary" className="mb-1 block text-xs">响应头 ({result.headers.length})</Typography.Text>
                <Table size="small" dataSource={result.headers} columns={headerTableColumns} pagination={false} rowKey="name" />
              </div>
            )}

            {result?.body != null ? (
              <div className="flex-1" style={{ minHeight: 300 }}>
                <ResponseBodyViewer body={result.body} contentType={result.contentType} />
              </div>
            ) : (
              <Typography.Text type="secondary" className="text-xs">无响应体</Typography.Text>
            )}
          </div>
        )}
      </div>
    </Drawer>
  )
}
