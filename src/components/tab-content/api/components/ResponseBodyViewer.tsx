import { useMemo, useState } from 'react'

import { Button, Typography, theme } from 'antd'
import { MinusIcon, PlusIcon } from 'lucide-react'

import { MonacoEditor } from '@/components/MonacoEditor'
import { useStyles } from '@/hooks/useStyle'

import { css } from '@emotion/css'

interface ResponseBodyViewerProps {
  body: string
  contentType?: string
  showFormatted?: boolean
  onToggleFormat?: () => void
}

const FORMAT_SIZE_LIMIT = 200 * 1024

function detectLanguage(contentType?: string): string {
  if (!contentType) return 'plaintext'
  const ct = contentType.toLowerCase()
  if (ct.includes('json')) return 'json'
  if (ct.includes('html')) return 'html'
  if (ct.includes('xml')) return 'xml'
  if (ct.includes('javascript')) return 'javascript'
  if (ct.includes('css')) return 'css'
  return 'plaintext'
}

function calcBodySize(body: string): string {
  const bytes = new Blob([body]).size
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}KB`
}

function tryFormatJson(body: string): string | null {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return null
  }
}

export function ResponseBodyViewer({ body, contentType, showFormatted: externalShowFormatted, onToggleFormat }: ResponseBodyViewerProps) {
  const { token } = theme.useToken()
  const isJson = contentType?.toLowerCase().includes('json')
  const bodySize = useMemo(() => new Blob([body]).size, [body])

  const { styles } = useStyles(() => ({
    editorContainer: css({
      display: 'flex',
      flexDirection: 'column',
      flex: '1 1 0',
      minHeight: 0,
    }),
  }))

  const formatted = useMemo(() => {
    if (!isJson) return null
    return tryFormatJson(body)
  }, [body, isJson])

  const isLarge = bodySize > FORMAT_SIZE_LIMIT
  const [internalShowFormatted, setInternalShowFormatted] = useState(isJson && !isLarge)

  // 如果提供了外部控制，使用外部状态；否则使用内部状态
  const showFormatted = externalShowFormatted !== undefined ? externalShowFormatted : internalShowFormatted
  const handleToggle = onToggleFormat || (() => setInternalShowFormatted(v => !v))

  const displayBody = showFormatted && formatted ? formatted : body
  const language = detectLanguage(contentType)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 按钮行已移到 ResultViewer 的 tabBarExtraContent，这里只保留提示信息 */}
      {isJson && isLarge && (
        <div className="mb-1 flex items-center gap-2 flex-shrink-0">
          {!showFormatted && formatted && (
            <Typography.Text style={{ fontSize: token.fontSizeSM, color: token.colorTextTertiary }}>
              响应体 {calcBodySize(body)}，已显示原始数据，
              <a onClick={handleToggle}>强制格式化</a>
            </Typography.Text>
          )}
          {showFormatted && (
            <Typography.Text style={{ fontSize: token.fontSizeSM, color: token.colorTextTertiary }}>
              已强制格式化 {calcBodySize(body)} 的响应体，可能影响性能
            </Typography.Text>
          )}
        </div>
      )}
      <div className={styles.editorContainer}>
        <MonacoEditor
          height="100%"
          language={language}
          value={displayBody}
          options={{ readOnly: true, lineNumbers: 'on', minimap: { enabled: false }, scrollBeyondLastLine: false }}
        />
      </div>
    </div>
  )
}
