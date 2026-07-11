import { BodyType } from '@/enums'
import type { ApiDetails } from '@/types'

export interface BuildRequestParam {
  name?: string
  enable?: boolean
  example?: unknown
  value?: string
  type?: string
  filePath?: string
}

export interface BuildRequestBodyInput {
  type: BodyType
  rawText?: string
  parameters?: BuildRequestParam[]
}

export interface BuildRequestContext {
  method: string
  /** 环境 base url（可选）；有则拼到 path 前 */
  baseUrl?: string
  path?: string
  /** 已合并（global + env + local）的 query/header/cookie 参数 */
  query: BuildRequestParam[]
  header: BuildRequestParam[]
  cookie: BuildRequestParam[]
  body?: BuildRequestBodyInput
  /** {{var}} 替换函数；无环境上下文时传 (s) => s */
  resolveVars: (val: string) => string
  /** Json/Xml/Raw 且 rawText 为空时生成示例 */
  buildBodyExample: (apiDetails: ApiDetails, menuRawList?: unknown) => string
  apiDetails: ApiDetails
  menuRawList?: unknown
  insecureSkipVerify: boolean
}

export interface BuildRequestResult {
  url: string
  method: string
  headers: Array<{ name: string; value: string }>
  bodyText: string
  contentType: string | undefined
  formDataFiles: Array<{ name: string; path: string }> | undefined
  insecureSkipVerify: boolean
}

function toText(v: unknown): string {
  return v == null ? '' : String(v)
}

/**
 * 共享的请求构建核心：拼 URL（含 query）、把启用的 cookie 参数序列化为 Cookie header、
 * 拼 body（json/xml/raw/form-data/url-encoded）。RunTab 与 QuickRequestRun 共用，避免重复与回归。
 */
export function buildRequest(ctx: BuildRequestContext): BuildRequestResult {
  const {
    method, baseUrl, path, query, header, cookie, body,
    buildBodyExample, apiDetails, menuRawList, insecureSkipVerify, resolveVars,
  } = ctx

  // ===== URL + Query =====
  const base = baseUrl ? baseUrl.replace(/\/$/, '') : ''
  const resolvedPath = resolveVars(path ?? '/')
  const fullPath = resolvedPath.startsWith('http://') || resolvedPath.startsWith('https://')
    ? resolvedPath
    : base ? `${base}${resolvedPath}` : resolvedPath

  const queryStr = query
    .filter(p => p.name && p.enable !== false)
    .map(p => `${encodeURIComponent(p.name as string)}=${encodeURIComponent(resolveVars(toText(p.example)))}`)
    .join('&')
  const url = queryStr ? `${fullPath}${fullPath.includes('?') ? '&' : '?'}${queryStr}` : fullPath

  // ===== Header（含 Cookie 序列化）=====
  const headers = header
    .filter(h => h.name && h.enable !== false)
    .map(h => ({ name: h.name as string, value: resolveVars(toText(h.example)) }))

  const cookiePairs = cookie
    .filter(c => c.name && c.enable !== false)
    .map(c => `${encodeURIComponent(c.name as string)}=${encodeURIComponent(resolveVars(toText(c.example)))}`)
  if (cookiePairs.length > 0) {
    headers.push({ name: 'Cookie', value: cookiePairs.join('; ') })
  }

  // ===== Body =====
  let bodyText = ''
  let contentType: string | undefined
  let formDataFiles: Array<{ name: string; path: string }> | undefined

  if (body && body.type !== BodyType.None) {
    if (body.type === BodyType.Json || body.type === BodyType.Xml || body.type === BodyType.Raw) {
      const raw = body.rawText ?? buildBodyExample(apiDetails, menuRawList)
      bodyText = resolveVars(raw)
      contentType = body.type === BodyType.Xml ? 'application/xml'
        : body.type === BodyType.Raw ? 'text/plain'
        : 'application/json'
    } else if (body.type === BodyType.FormData || body.type === BodyType.UrlEncoded) {
      const textParams: Array<{ name: string; example: string }> = []
      const fileParams: Array<{ name: string; path: string }> = []

      for (const p of body.parameters ?? []) {
        if (!p.name || p.enable === false) continue
        if (p.type === 'file') {
          const filePath = p.filePath
          if (filePath) fileParams.push({ name: p.name, path: filePath })
        } else {
          textParams.push({ name: p.name, example: resolveVars(toText(p.example)) })
        }
      }

      bodyText = textParams
        .map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.example)}`)
        .join('&')
      contentType = body.type === BodyType.FormData ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
      formDataFiles = fileParams.length > 0 ? fileParams : undefined
    }
  }

  return { url, method, headers, bodyText, contentType, formDataFiles, insecureSkipVerify }
}
