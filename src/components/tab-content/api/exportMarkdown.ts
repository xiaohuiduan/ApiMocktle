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

function mdTable(headers: ExportHeader[] | undefined): string {
  if (!headers || headers.length === 0) return '_无_'
  const rows = headers
    .filter(h => h.name)
    .map(h => `| ${h.name} | ${String(h.value ?? '').replace(/\|/g, '\\|')} |`)
    .join('\n')
  return `| 名称 | 值 |\n| --- | --- |\n${rows}`
}

function codeBlock(text: string | undefined, lang = ''): string {
  if (text == null || text === '') return '_无_'
  return `\`\`\`${lang}\n${text}\n\`\`\``
}

/** 生成接口请求/响应的 Markdown 报告 */
export function buildMarkdownReport(request: ExportRequest, response: ExportResponse): string {
  const method = (request.method ?? 'GET').toUpperCase()
  const status = response.status ?? 0
  return `# 接口请求报告

## 概览
- **方法**：${method}
- **URL**：${request.url ?? '-'}
- **状态**：${status} ${response.statusText ?? ''}
- **耗时**：${response.durationMs ?? 0} ms

## 请求头
${mdTable(request.headers)}

${request.query && request.query.length ? `## Query 参数\n${mdTable(request.query)}\n` : ''}
## 请求体
${codeBlock(request.body, guessLang(request.contentType))}

## 响应头
${mdTable(response.headers)}

## 响应体
${codeBlock(response.body ?? undefined, guessLang(response.contentType))}
`
}

function guessLang(contentType?: string): string {
  if (!contentType) return 'json'
  if (contentType.includes('xml')) return 'xml'
  if (contentType.includes('html')) return 'html'
  if (contentType.includes('json')) return 'json'
  if (contentType.includes('text/plain')) return 'text'
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
  } catch {
    // 忽略下载失败
  }
}
