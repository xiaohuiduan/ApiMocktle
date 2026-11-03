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
  /** binary 类型的原始请求体文件路径 */
  filePath?: string
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
  /**
   * Json/Xml/Raw 的 rawText 为空时，是否用 schema 示例兜底。
   * 默认 false：编辑器里空着就发空 Body（所见即所发）。
   * 批量运行等无编辑界面的路径显式开启，保持「按文档定义发送」的旧行为。
   */
  fallbackBodyExample?: boolean
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
  /** binary 类型的原始请求体文件路径，由后端读取字节直接发送 */
  bodyFile?: string
  insecureSkipVerify: boolean
  /** 非致命告警（如 GET/HEAD 携带 Body 被忽略），由调用方提示用户 */
  bodyWarning?: string
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
    buildBodyExample, fallbackBodyExample = false,
    apiDetails, menuRawList, insecureSkipVerify, resolveVars,
  } = ctx

  // ===== 收集模板字段（与解析结果同序）=====
  const queryList = query.filter((p) => p.name && p.enable !== false)
  const headerList = header.filter((h) => h.name && h.enable !== false)
  const cookieList = cookie.filter((c) => c.name && c.enable !== false)

  const isJsonXmlRaw = body != null
    && body.type !== BodyType.None
    && (body.type === BodyType.Json || body.type === BodyType.Xml || body.type === BodyType.Raw)
  // Json/Xml/Raw 的原文：默认按编辑器内容原样发送（空即空，所见即所发）。
  // 仅当 fallbackBodyExample 显式开启且内容为空（含纯空白）时，才用 schema 示例兜底。
  const rawBodyText = body?.rawText
  const hasRawBodyText = rawBodyText != null && rawBodyText.trim() !== ''
  const bodyRaw = isJsonXmlRaw
    ? (hasRawBodyText
        ? rawBodyText
        : (fallbackBodyExample ? buildBodyExample(apiDetails, menuRawList) : ''))
    : ''
  const bodyParams = (body?.type === BodyType.FormData || body?.type === BodyType.UrlEncoded)
    ? (body.parameters ?? []).filter((p) => p.name && p.enable !== false && p.type !== 'file')
    : []

  const fields = [
    path ?? '/',
    ...queryList.map((p) => toText(p.example)),
    ...headerList.map((h) => toText(h.example)),
    ...cookieList.map((c) => toText(c.example)),
    // bodyRaw 仅在 Json/Xml/Raw 时占位（消费侧也只在该分支取它）；form-data/url-encoded 不占位，
    // 否则 bodyParams 取值会整体错位一位，导致最后一个参数的值丢失。
    ...(isJsonXmlRaw ? [bodyRaw] : []),
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
  let bodyFile: string | undefined
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
    else if (body.type === BodyType.Binary) {
      // binary 发送的是本地文件的原始字节，不做任何文本转换
      bodyFile = body.filePath
      contentType = 'application/octet-stream'
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

  // GET/HEAD 不支持携带请求体（后端亦会丢弃），显式剔除并提示，避免「以为发了 body」的调试误导
  const upperMethod = method.toUpperCase()
  const isBodylessMethod = upperMethod === 'GET' || upperMethod === 'HEAD'
  const hasAnyBody = bodyText !== '' || !!formDataFiles || !!bodyFile

  let bodyWarning: string | undefined

  if (isBodylessMethod && hasAnyBody) {
    bodyWarning = 'GET/HEAD 请求不支持携带请求体，已忽略 Body（如需携带请改用 POST，或把参数放进 Query）'
  }
  else if (body?.type === BodyType.Binary && !bodyFile) {
    bodyWarning = 'binary 类型未选择文件，本次不发送请求体'
  }

  if (isBodylessMethod) {
    bodyText = ''
    contentType = undefined
    formDataFiles = undefined
    bodyFile = undefined
  }

  return {
    url,
    method,
    headers,
    bodyText,
    contentType,
    formDataFiles,
    bodyFile,
    insecureSkipVerify,
    bodyWarning,
    requestVars: {
      urlBase: base,
      urlPath: pathField,
      urlQuery: queryStr,
      headers: headerFields,
      body: bodyField,
    },
  }
}
