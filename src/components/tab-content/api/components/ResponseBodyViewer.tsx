import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { Button, message, theme, Typography } from 'antd'
import { DownloadIcon } from 'lucide-react'

import { MonacoEditor } from '@/components/MonacoEditor'
import { useStyles } from '@/hooks/useStyle'

import { ensureExternalLinkOpener } from './monacoExternalLink'

import { css } from '@emotion/css'

interface ResponseBodyViewerProps {
  body: string
  contentType?: string
  showFormatted?: boolean
  onToggleFormat?: () => void
  /** 二进制响应标记；为 true 时内容在 bodyBase64 */
  isBinary?: boolean
  /** 二进制响应体（base64） */
  bodyBase64?: string
  /** 响应体字节数 */
  bodySize?: number
  /** 建议文件名（从请求 URL 推导，用于保存对话框） */
  fileName?: string
}

const FORMAT_SIZE_LIMIT = 200 * 1024

const IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/x-icon', 'image/avif']

function detectLanguage(contentType?: string): string {
  if (!contentType) { return 'plaintext' }

  const ct = contentType.toLowerCase()

  if (ct.includes('json')) { return 'json' }

  if (ct.includes('html')) { return 'html' }

  if (ct.includes('xml')) { return 'xml' }

  if (ct.includes('javascript')) { return 'javascript' }

  if (ct.includes('css')) { return 'css' }

  return 'plaintext'
}

function calcBodySize(body: string): string {
  const bytes = new Blob([body]).size

  if (bytes < 1024) { return `${bytes}B` }

  return `${(bytes / 1024).toFixed(1)}KB`
}

function tryFormatJson(body: string): string | null {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  }
  catch {
    return null
  }
}

/** 从 Content-Type 推导文件扩展名 */
function extFromContentType(contentType?: string): string {
  const ct = contentType?.toLowerCase().split(';')[0]?.trim() ?? ''
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/x-icon': 'ico',
    'image/avif': 'avif',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/gzip': 'gz',
    'application/json': 'json',
    'application/xml': 'xml',
    'application/wasm': 'wasm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
  }

  return map[ct] ?? 'bin'
}

function isImageContentType(contentType?: string): boolean {
  const ct = contentType?.toLowerCase().split(';')[0]?.trim() ?? ''

  return IMAGE_CONTENT_TYPES.includes(ct) || ct.startsWith('image/')
}

export function ResponseBodyViewer({
  body,
  contentType,
  showFormatted: externalShowFormatted,
  onToggleFormat,
  isBinary,
  bodyBase64,
  bodySize,
  fileName,
}: ResponseBodyViewerProps) {
  const { token } = theme.useToken()
  const { t } = useTranslation()
  const isJson = contentType?.toLowerCase().includes('json')
  const bodySizeBytes = bodySize ?? new Blob([body]).size

  const { styles } = useStyles(() => ({
    editorContainer: css({
      display: 'flex',
      flexDirection: 'column',
      flex: '1 1 0',
      minHeight: 0,
    }),
  }))

  const formatted = useMemo(() => {
    if (!isJson) { return null }

    return tryFormatJson(body)
  }, [body, isJson])

  const isLarge = bodySizeBytes > FORMAT_SIZE_LIMIT
  const [internalShowFormatted, setInternalShowFormatted] = useState(isJson && !isLarge)

  // 如果提供了外部控制，使用外部状态；否则使用内部状态
  const showFormatted = externalShowFormatted ?? internalShowFormatted
  const handleToggle = onToggleFormat ?? (() => {
    setInternalShowFormatted((v) => !v)
  })

  // ===== 二进制响应处理 =====
  const isImage = isBinary && isImageContentType(contentType)
  const isSvg = isBinary && contentType?.toLowerCase().includes('svg')
  const imageSrc = isImage && bodyBase64
    ? `data:${contentType?.toLowerCase().split(';')[0]?.trim() ?? 'image/png'};base64,${bodyBase64}`
    : undefined

  const handleSaveBinary = async () => {
    if (!bodyBase64) { return }

    try {
      const ext = extFromContentType(contentType)
      const urlName = fileName?.split('?')[0]?.split('/').pop() ?? ''
      const baseName = urlName.includes('.') ? urlName : `response.${ext}`
      const filePath = await save({
        defaultPath: baseName,
        filters: [{ name: t('api.run.fileFilter'), extensions: [ext] }],
      })

      if (!filePath) { return }

      await invoke('save_response_file', { path: filePath, dataBase64: bodyBase64 })
      message.success(t('api.run.fileSaved'))
    }
    catch (err) {
      message.error(err instanceof Error ? err.message : t('api.run.saveFailed'))
    }
  }

  if (isBinary) {
    const sizeText = t('api.run.binarySize', {
      size: (bodySizeBytes / 1024).toFixed(1),
      bytes: bodySizeBytes,
    })

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
          <Typography.Text style={{ fontSize: token.fontSizeSM }} type="secondary">
            {t('api.run.binaryResponse')} {contentType ? `(${contentType.split(';')[0].trim()})` : ''}{sizeText && ` · ${sizeText}`}
          </Typography.Text>
          <Button icon={<DownloadIcon size={14} />} size="small" onClick={() => void handleSaveBinary()}>
            {t('api.run.saveToLocal')}
          </Button>
        </div>
        <div className={styles.editorContainer}>
          {isImage && imageSrc
            ? (
                <div
                  className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-4"
                  style={{ backgroundColor: token.colorFillQuaternary }}
                >
                  { }
                  <img
                    alt={t('api.run.responseImageAlt')}
                    src={imageSrc}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                </div>
              )
            : (
                <div
                  className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2"
                  style={{ color: token.colorTextTertiary }}
                >
                  {isSvg
                    ? <Typography.Text type="secondary">{t('api.run.svgHint')}</Typography.Text>
                    : <Typography.Text type="secondary">{t('api.run.binaryPreviewHint')}</Typography.Text>}
                </div>
              )}
        </div>
      </div>
    )
  }

  const displayBody = showFormatted && formatted ? formatted : body
  const language = detectLanguage(contentType)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 按钮行已移到 ResultViewer 的 tabBarExtraContent，这里只保留提示信息 */}
      {isJson && isLarge && (
        <div className="mb-1 flex shrink-0 items-center gap-2">
          {!showFormatted && formatted && (
            <Typography.Text style={{ fontSize: token.fontSizeSM, color: token.colorTextTertiary }}>
              {t('api.run.largeBodyRawPrefix')}
              {' '}
              {calcBodySize(body)}
              {t('api.run.largeBodyRawSuffix')}
              <a onClick={handleToggle}>{t('api.run.forceFormat')}</a>
            </Typography.Text>
          )}
          {showFormatted && (
            <Typography.Text style={{ fontSize: token.fontSizeSM, color: token.colorTextTertiary }}>
              {t('api.run.forceFormatted', { size: calcBodySize(body) })}
            </Typography.Text>
          )}
        </div>
      )}
      <div className={styles.editorContainer}>
        <MonacoEditor
          height="100%"
          language={language}
          options={{
            readOnly: true,
            lineNumbers: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            // 响应体中的 URL 支持 Ctrl/Cmd + 点击用系统浏览器打开
            links: true,
          }}
          value={displayBody}
          onMount={(_editor, monaco) => { ensureExternalLinkOpener(monaco) }}
        />
      </div>
    </div>
  )
}
