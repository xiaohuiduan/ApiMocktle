'use client'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Space, theme, Typography } from 'antd'
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
import { localizeRequestError } from '@/i18n/request-error'

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
  const { t } = useTranslation()
  const [showDetail, setShowDetail] = useState(false)

  // 后端只回错误码，文案按当前语言渲染（切语言后无需重新请求即可刷新）。
  // 用 t 作为依赖触发重算——localizeRequestError 内部读 i18n 单例，本身不订阅语言变化。
  const localized = useMemo(() => localizeRequestError(errorInfo), [errorInfo, t])

  return (
    <div
      className="flex flex-col rounded-lg p-4"
      role="alert"
      style={{
        border: `1px solid ${token.colorErrorBorder}`,
        borderLeft: `4px solid ${token.colorError}`,
        backgroundColor: token.colorErrorBg,
      }}
    >
      {/* 标题栏：图标 + 请求失败 */}
      <div className="mb-2 flex items-center gap-2">
        <span style={{ color: token.colorError }}>
          {errorIconMap[errorInfo.errorType] ?? <AlertTriangleIcon size={18} />}
        </span>
        <Typography.Text
          strong
          className="text-sm"
          style={{ color: token.colorError }}
        >
          {t('api.run.requestFailed')}
        </Typography.Text>
      </div>

      {/* 错误消息 */}
      <div className="ml-[26px]">
        <Typography.Text className="block text-base leading-relaxed">
          {localized.message}
        </Typography.Text>
      </div>

      {/* 修复建议 */}
      {localized.suggestion.length > 0 && (
        <div className="ml-[26px] mt-3">
          <Typography.Text className="mb-1 block text-sm font-medium" style={{ color: token.colorTextSecondary }}>
            {t('api.run.suggestions')}
          </Typography.Text>
          <div className="flex flex-col gap-1">
            {localized.suggestion.map((line, i) => (
              <Space key={i} size={8}>
                <span
                  className="inline-block size-1.5 shrink-0 rounded-full"
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
        <div className="ml-[26px] mt-3">
          <button
            className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-sm"
            style={{ color: token.colorTextTertiary }}
            type="button"
            onClick={() => { setShowDetail((v) => !v) }}
          >
            {showDetail ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
            {t('api.run.technicalDetail')}
          </button>
          {showDetail && (
            <pre
              className="mt-2 overflow-auto rounded p-2 text-xs leading-relaxed"
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
        <div className="ml-[26px] mt-4">
          <Button
            icon={<RefreshCwIcon size={14} />}
            size="small"
            onClick={onRetry}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
    </div>
  )
}
