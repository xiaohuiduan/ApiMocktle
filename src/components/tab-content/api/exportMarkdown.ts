import { t } from '@/i18n'

export interface ExportHeader {
  name?: string
  value?: string
}

export interface ExportRequest {
  url?: string
  method?: string
  headers?: ExportHeader[]
  body?: string
  contentType?: string
  query?: ExportHeader[]
}

export interface ExportResponse {
  status?: number
  statusText?: string
  headers?: ExportHeader[]
  body?: string | null
  durationMs?: number
  contentType?: string
}

function tableBlock(headers: ExportHeader[] | undefined): string {
  if (!headers || headers.length === 0) { return t('api.run.report.none') }

  const rows = headers
    .filter((h) => h.name)
    .map((h) => `| ${h.name} | ${String(h.value ?? '').replace(/\|/g, '\\|')} |`)
    .join('\n')

  return `${t('api.run.report.tableHeader')}\n${rows}`
}

function codeBlock(text: string | undefined, lang = ''): string {
  if (text == null || text === '') { return t('api.run.report.none') }

  return `\`\`\`${lang}\n${text}\n\`\`\``
}

/**
 * 生成接口请求/响应的 Markdown 报告。
 *
 * 文案在**函数体内**取词（而非模块顶层），因此导出时会使用导出那一刻的语言。
 */
export function buildMarkdownReport(request: ExportRequest, response: ExportResponse): string {
  const method = (request.method ?? 'GET').toUpperCase()
  const status = response.status ?? 0

  return `${t('api.run.report.title')}

${t('api.run.report.overview')}
${t('api.run.report.method', { method })}
${t('api.run.report.url', { url: request.url ?? '-' })}
${t('api.run.report.status', { status, statusText: response.statusText ?? '' })}
${t('api.run.report.duration', { ms: response.durationMs ?? 0 })}

${t('api.run.report.requestHeaders')}
${tableBlock(request.headers)}

${request.query?.length ? `${t('api.run.report.query')}\n${tableBlock(request.query)}\n` : ''}${t('api.run.report.requestBody')}
${codeBlock(request.body, guessLang(request.contentType))}

${t('api.run.report.responseHeaders')}
${tableBlock(response.headers)}

${t('api.run.report.responseBody')}
${codeBlock(response.body ?? undefined, guessLang(response.contentType))}
`
}

function guessLang(contentType?: string): string {
  if (!contentType) { return 'json' }

  if (contentType.includes('xml')) { return 'xml' }

  if (contentType.includes('html')) { return 'html' }

  if (contentType.includes('json')) { return 'json' }

  if (contentType.includes('text/plain')) { return 'text' }

  return 'json'
}

/** 通过 Blob 下载文本（无现成 util 时的最小实现） */
export function downloadText(filename: string, text: string): void {
  try {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  catch {
    // 忽略下载失败
  }
}
