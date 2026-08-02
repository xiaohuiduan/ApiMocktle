import { BodyType } from '@/enums'

import { stripJsonComments } from './bodyJsonc'

export interface CurlParam {
  name?: string
  example?: unknown
  enable?: boolean
}

export interface CurlBodyInput {
  type: BodyType
  rawText?: string
  parameters?: CurlParam[]
  /** 仅 Raw 类型：覆盖默认 text/plain 的 Content-Type（如已序列化的 form-data/urlencoded 文本） */
  rawContentType?: string
}

export interface CurlInput {
  method: string
  /** 完整 URL（已含环境 baseUrl + path，不含 query） */
  url: string
  headers?: CurlParam[]
  query?: CurlParam[]
  cookie?: CurlParam[]
  body?: CurlBodyInput
}

export interface CurlOutput {
  windows: string
  linux: string
}

function toText(v: unknown): string {
  return v == null ? '' : String(v)
}

function enabledParams(params: CurlParam[] | undefined): CurlParam[] {
  return (params ?? []).filter((p) => p.name && p.enable !== false)
}

/** 单引号包裹并转义（linux/macOS 风格；与原有实现保持一致，Windows 也输出同一命令） */
function quoteSingle(s: string): string {
  return `'${s.replace(/'/g, '\'\\\'\'')}'`
}

/** 双引号包裹 URL（URL 中不应含引号，这里做基本转义防御） */
function quoteDouble(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`
}

function contentTypeForBody(type: BodyType): string {
  if (type === BodyType.Xml) { return 'application/xml' }

  if (type === BodyType.Raw) { return 'text/plain' }

  return 'application/json'
}

/**
 * 生成 cURL 命令（Windows/Linux 各一份，内容一致）。
 *
 * 规则：
 * - query 参数拼到 URL；
 * - header 输出 -H，cookie 输出 -b；
 * - json/xml/raw：仅当 rawText 有内容才输出 -d 和 Content-Type（空 body 不生成示例数据）；
 * - url-encoded：启用字段拼成 k=v&… 输出 -d；
 * - form-data：每个启用字段输出 -F "k=v"；
 * - none / binary / 空 body：不带任何 body 参数。
 */
export function generateCurl(input: CurlInput): CurlOutput {
  const method = (input.method || 'GET').toUpperCase()
  const headers = enabledParams(input.headers)
  const query = enabledParams(input.query)
  const cookie = enabledParams(input.cookie)

  let url = input.url

  if (query.length > 0) {
    const queryStr = query
      .map((q) => `${encodeURIComponent(q.name!)}=${encodeURIComponent(toText(q.example))}`)
      .join('&')
    url += `${url.includes('?') ? '&' : '?'}${queryStr}`
  }

  const args: string[] = ['curl', '-X', method]

  for (const h of headers) {
    args.push('-H', quoteSingle(`${h.name}: ${toText(h.example)}`))
  }

  if (cookie.length > 0) {
    const cookieStr = cookie
      .map((c) => `${encodeURIComponent(c.name!)}=${encodeURIComponent(toText(c.example))}`)
      .join('; ')
    args.push('-b', quoteSingle(cookieStr))
  }

  const body = input.body
  const bodyType = body?.type

  if (bodyType === BodyType.Json || bodyType === BodyType.Xml || bodyType === BodyType.Raw) {
    // JSON 允许注释，cURL 输出前剥离，避免复制出的命令带注释失效
    const raw = body?.rawText
    const payload = bodyType === BodyType.Json
      ? stripJsonComments(raw ?? '').trim()
      : (raw ?? '').trim()

    if (payload) {
      const contentType = bodyType === BodyType.Raw && body?.rawContentType
        ? body.rawContentType
        : contentTypeForBody(bodyType)
      args.push('-H', quoteSingle(`Content-Type: ${contentType}`))
      args.push('-d', quoteSingle(payload))
    }
  }
  else if (bodyType === BodyType.UrlEncoded) {
    const pairs = enabledParams(body?.parameters)
      .map((p) => `${encodeURIComponent(p.name!)}=${encodeURIComponent(toText(p.example))}`)

    if (pairs.length > 0) {
      args.push('-H', quoteSingle('Content-Type: application/x-www-form-urlencoded'))
      args.push('-d', quoteSingle(pairs.join('&')))
    }
  }
  else if (bodyType === BodyType.FormData) {
    const fields = enabledParams(body?.parameters)

    if (fields.length > 0) {
      for (const f of fields) {
        args.push('-F', quoteSingle(`${f.name}=${toText(f.example)}`))
      }
    }
  }

  args.push(quoteDouble(url))
  const cmd = args.join(' ')

  return { windows: cmd, linux: cmd }
}
