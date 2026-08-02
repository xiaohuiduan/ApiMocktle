import { BodyType } from '@/enums'
import type { ApiDetails } from '@/types'

import { stripJsonComments } from './bodyJsonc'
import { type ResolvedField, type ResolvedVar, resolveTemplateBatch } from './useResolvedVarMap'

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
  /** {{var}} 用户变量替换函数；无环境上下文时传 (s) => s（{{$xxx}} 由内部 IPC 统一解析） */
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
  headers: { name: string, value: string }[]
  bodyText: string
  contentType: string | undefined
  formDataFiles: { name: string, path: string }[] | undefined
  insecureSkipVerify: boolean
  /** 展示区高亮：字段级变量位置映射（基于各字段解析后文本） */
  requestVars: {
    /** base（普通文本，无高亮） */
    urlBase: string
    /** path 解析结果（含 vars，与 resolved 文本对应） */
    urlPath: ResolvedField
    /** 编码后 query 字符串（普通文本） */
    urlQuery: string
    /** 与 headers 数组同序的解析结果；Cookie 序列化项为 null */
    headers: ({ name: string, resolved: string, vars: ResolvedVar[] } | null)[]
    /** json/xml/raw 的解析结果（未剥离注释的原文）；form/urlencoded 为 null */
    body: ResolvedField | null
  }
}

function toText(v: unknown): string {
  return v == null ? '' : String(v)
}

/**
 * 共享的请求构建核心：拼 URL（含 query）、把启用的 cookie 参数序列化为 Cookie header、
 * 拼 body（json/xml/raw/form-data/url-encoded）。RunTab 与 QuickRequestRun 共用，避免重复与回归。
 *
 * 异步：所有字段的 {{$xxx}} 动态变量一次 IPC 批量解析（Rust 单点求值），
 * 再对每字段做 {{var}} 用户变量本地替换。
 */
export async function buildRequest(ctx: BuildRequestContext): Promise<BuildRequestResult> {
  const {
    method, baseUrl, path, query, header, cookie, body,
    buildBodyExample, apiDetails, menuRawList, insecureSkipVerify, resolveVars,
  } = ctx

  // ===== 收集模板字段（与解析结果同序）=====
  const queryList = query.filter((p) => p.name && p.enable !== false)
  const headerList = header.filter((h) => h.name && h.enable !== false)
  const cookieList = cookie.filter((c) => c.name && c.enable !== false)

  const isJsonXmlRaw = body != null
    && body.type !== BodyType.None
    && (body.type === BodyType.Json || body.type === BodyType.Xml || body.type === BodyType.Raw)
  // Json/Xml/Raw 且 rawText 为空时生成示例（示例内容也可能含变量）
  const bodyRaw = isJsonXmlRaw ? (body?.rawText ?? buildBodyExample(apiDetails, menuRawList)) : ''
  const bodyParams = (body?.type === BodyType.FormData || body?.type === BodyType.UrlEncoded)
    ? (body.parameters ?? []).filter((p) => p.name && p.enable !== false && p.type !== 'file')
    : []

  const fields = [
    path ?? '/',
    ...queryList.map((p) => toText(p.example)),
    ...headerList.map((h) => toText(h.example)),
    ...cookieList.map((c) => toText(c.example)),
    bodyRaw,
    ...bodyParams.map((p) => toText(p.example)),
  ]
  const resolvedFields = await resolveTemplateBatch(fields)

  let idx = 0
  /** 取下一个字段的解析结果（ResolvedField 含 vars 高亮映射） */
  const next = (): ResolvedField => resolvedFields[idx++] ?? { resolved: '', vars: [], errors: [] }

  // ===== URL + Query =====
  const base = baseUrl ? baseUrl.replace(/\/$/, '') : ''
  const pathField = next()
  const resolvedPath = resolveVars(pathField.resolved)
  const fullPath = resolvedPath.startsWith('http://') || resolvedPath.startsWith('https://')
    ? resolvedPath
    : base ? `${base}${resolvedPath}` : resolvedPath

  const queryStr = queryList
    .map((p) => `${encodeURIComponent(p.name!)}=${encodeURIComponent(resolveVars(next().resolved))}`)
    .join('&')
  const url = queryStr ? `${fullPath}${fullPath.includes('?') ? '&' : '?'}${queryStr}` : fullPath

  // ===== Header（含 Cookie 序列化）=====
  const headerFields: ({ name: string, resolved: string, vars: ResolvedVar[] } | null)[] = []
  const headers = headerList
    .map((h) => {
      const f = next()

      headerFields.push({ name: h.name!, resolved: f.resolved, vars: f.vars })

      return { name: h.name!, value: resolveVars(f.resolved) }
    })

  const cookiePairs = cookieList
    .map((c) => `${encodeURIComponent(c.name!)}=${encodeURIComponent(resolveVars(next().resolved))}`)

  if (cookiePairs.length > 0) {
    headers.push({ name: 'Cookie', value: cookiePairs.join('; ') })
    headerFields.push(null) // Cookie 序列化后位置不可映射
  }

  // ===== Body =====
  let bodyText = ''
  let contentType: string | undefined
  let formDataFiles: { name: string, path: string }[] | undefined
  let bodyField: ResolvedField | null = null

  if (body && body.type !== BodyType.None) {
    if (body.type === BodyType.Json || body.type === BodyType.Xml || body.type === BodyType.Raw) {
      const raw = next()
      bodyField = raw
      // JSON 允许编辑器内写注释，发送前剥离，保证服务器收到标准 JSON
      bodyText = body.type === BodyType.Json ? stripJsonComments(resolveVars(raw.resolved)) : resolveVars(raw.resolved)
      contentType = body.type === BodyType.Xml
        ? 'application/xml'
        : body.type === BodyType.Raw
          ? 'text/plain'
          : 'application/json'
    }
    else if (body.type === BodyType.FormData || body.type === BodyType.UrlEncoded) {
      const textParams: { name: string, example: string }[] = []
      const fileParams: { name: string, path: string }[] = []

      for (const p of body.parameters ?? []) {
        if (!p.name || p.enable === false) { continue }

        if (p.type === 'file') {
          const filePath = p.filePath

          if (filePath) { fileParams.push({ name: p.name, path: filePath }) }
        }
        else {
          textParams.push({ name: p.name, example: resolveVars(next().resolved) })
        }
      }

      bodyText = textParams
        .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.example)}`)
        .join('&')
      contentType = body.type === BodyType.FormData ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
      formDataFiles = fileParams.length > 0 ? fileParams : undefined
    }
  }

  return {
    url,
    method,
    headers,
    bodyText,
    contentType,
    formDataFiles,
    insecureSkipVerify,
    requestVars: {
      urlBase: base,
      urlPath: pathField,
      urlQuery: queryStr,
      headers: headerFields,
      body: bodyField,
    },
  }
}
