'use client'

import { useState } from 'react'

import { Button, Space, Typography, theme } from 'antd'
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  WifiOffIcon,
  XCircleIcon,
} from 'lucide-react'

import type { RequestErrorInfo } from '@/types'

interface ErrorDisplayProps {
  errorInfo: RequestErrorInfo
  onRetry?: () => void
}

const errorIconMap: Record<string, React.ReactNode> = {
  connection_refused: <WifiOffIcon size={28} />,
  connection_failed: <WifiOffIcon size={28} />,
  connection_reset: <WifiOffIcon size={28} />,
  network_unreachable: <WifiOffIcon size={28} />,
  dns_failure: <WifiOffIcon size={28} />,
  timeout: <ClockIcon size={28} />,
  tls_error: <ShieldAlertIcon size={28} />,
  http_error: <XCircleIcon size={28} />,
  redirect_error: <AlertTriangleIcon size={28} />,
  body_error: <XCircleIcon size={28} />,
  unknown: <AlertTriangleIcon size={28} />,
}

export function ErrorDisplay({ errorInfo, onRetry }: ErrorDisplayProps) {
  const { token } = theme.useToken()
  const [showDetail, setShowDetail] = useState(false)

  return (
    <div
      role="alert"
      className="flex flex-col rounded-lg p-4"
      style={{
        border: `1px solid ${token.colorErrorBorder}`,
        borderLeft: `4px solid ${token.colorError}`,
        backgroundColor: token.colorErrorBg,
      }}
    >
      {/* 顶部：图标 + 错误消息 */}
      <div className="flex items-start gap-3">
        <span className="shrink-0 mt-0.5" style={{ color: token.colorError }}>
          {errorIconMap[errorInfo.errorType] || <AlertTriangleIcon size={28} />}
        </span>
        <div className="flex-1 min-w-0">
          <Typography.Text
            strong
            className="block text-base leading-relaxed"
            style={{ color: token.colorError }}
          >
            {errorInfo.errorMessage}
          </Typography.Text>
        </div>
      </div>

      {/* 修复建议 */}
      {errorInfo.suggestion && (
        <div className="mt-3 ml-[44px]">
          <Typography.Text className="block text-sm font-medium mb-1" style={{ color: token.colorTextSecondary }}>
            建议排查方向
          </Typography.Text>
          <div className="flex flex-col gap-1">
            {errorInfo.suggestion.split('\n').filter(Boolean).map((line, i) => (
              <Space key={i} size={8}>
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: token.colorError }}
                />
                <Typography.Text className="text-sm">{line}</Typography.Text>
              </Space>
            ))}
          </div>
        </div>
      )}

      {/* 技术详情（可展开） */}
      {errorInfo.errorDetail && (
        <div className="mt-3 ml-[44px]">
          <button
            type="button"
            onClick={() => setShowDetail(v => !v)}
            className="flex items-center gap-1 text-sm cursor-pointer border-0 bg-transparent p-0"
            style={{ color: token.colorTextTertiary }}
          >
            {showDetail ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
            技术详情
          </button>
          {showDetail && (
            <pre
              className="mt-2 rounded p-2 text-xs overflow-auto leading-relaxed"
              style={{
                backgroundColor: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                color: token.colorTextSecondary,
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 160,
              }}
            >
              {errorInfo.errorDetail}
            </pre>
          )}
        </div>
      )}

      {/* 重试按钮 */}
      {onRetry && (
        <div className="mt-4 ml-[44px]">
          <Button
            size="small"
            icon={<RefreshCwIcon size={14} />}
            onClick={onRetry}
          >
            重试
          </Button>
        </div>
      )}
    </div>
  )
}
