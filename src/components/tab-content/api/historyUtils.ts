import { nanoid } from 'nanoid'

import { ParamType } from '@/enums'
import type { ApiEnvironment, Parameter } from '@/types'

const ABSOLUTE_URL = /^[a-z][\w+.-]*:\/\//i

export function parseQueryFromUrl(url: string): Parameter[] {
  const raw = (url ?? '').trim()

  if (!raw) { return [] }

  try {
    // 未选环境时 buildRequest 只产出相对路径（/path?x=1），必须给个虚拟基准，
    // 否则 new URL 直接抛错、query 被静默丢弃（回填会把参数面板清空）。
    // 只读 searchParams，虚拟基准的 origin 不会混进结果。
    const parsed = ABSOLUTE_URL.test(raw) ? new URL(raw) : new URL(raw, 'http://relative.invalid')
    const params: Parameter[] = []
    parsed.searchParams.forEach((value, name) => {
      params.push({
        id: nanoid(6),
        name,
        example: value,
        enable: true,
        type: ParamType.String,
      } as Parameter)
    })

    return params
  }
  catch {
    return []
  }
}

/**
 * 从 URL 取 query 的「name/value 对」形态，供历史详情、错误历史等只读展示使用。
 * 与 parseQueryFromUrl 共用一套解析，避免各处再写 `new URL(url).searchParams`
 * 而在相对路径上静默失败。
 */
export function parseQueryPairsFromUrl(url: string): { name: string, value: string }[] {
  return parseQueryFromUrl(url).map((param) => ({
    name: param.name ?? '',
    value: typeof param.example === 'string' ? param.example : '',
  }))
}

export function parseHistoryParams(
  headers: { name: string, value: string }[],
  url: string,
): { query: Parameter[], header: Parameter[], cookie: Parameter[] } {
  const query = parseQueryFromUrl(url)
  const header: Parameter[] = []
  const cookie: Parameter[] = []

  for (const h of headers) {
    if (h.name.toLowerCase() === 'cookie') {
      h.value.split(';').forEach((pair) => {
        const eqIdx = pair.indexOf('=')

        if (eqIdx > 0) {
          cookie.push({
            id: nanoid(6),
            name: pair.slice(0, eqIdx).trim(),
            example: pair.slice(eqIdx + 1).trim(),
            enable: true,
            type: ParamType.String,
          } as Parameter)
        }
      })
    }
    else {
      header.push({
        id: nanoid(6),
        name: h.name,
        example: h.value,
        enable: true,
        type: ParamType.String,
      } as Parameter)
    }
  }

  return { query, header, cookie }
}

/** 收集多个环境列表里的全部 baseUrl（环境自身 url + baseUrls[].url），用于前缀匹配 */
export function collectEnvironmentBaseUrls(
  ...envLists: (ApiEnvironment[] | undefined)[]
): string[] {
  const urls: string[] = []

  for (const envs of envLists) {
    for (const env of envs ?? []) {
      if (env.url) { urls.push(env.url) }

      for (const base of env.baseUrls ?? []) {
        if (base.url) { urls.push(base.url) }
      }
    }
  }

  return urls
}

function stripQueryAndHash(value: string): string {
  return value.split('#')[0].split('?')[0]
}

/**
 * 把历史记录里的请求 URL 还原成可回填的 `path`。
 *
 * 历史落库的是 `buildRequest` 生成的完整 URL（已拼好环境 baseUrl），直接写进
 * `workCopy.path` 会让 `buildRequest` 认为这是绝对地址而跳过 baseUrl 拼接
 * （见 buildRequest.ts 中 `fullPath` 的判断），表现为「切换环境不生效」。
 *
 * 规则：
 * 1. 相对路径：去掉 query / hash 后原样返回；
 * 2. 绝对 URL 命中 baseUrls：按最长前缀剥离（忽略尾部 `/` 与大小写），剩余部分以 `/` 开头；
 * 3. 绝对 URL 未命中任何 baseUrl：保留 `origin + pathname`（协议 + host + port + 路径），
 *    只丢弃 query / hash —— 否则会把请求地址的 host 抹掉，回填后请求被发到当前环境域名上，
 *    或（无环境时）变成不合法地址。
 *
 * query 一律不写回 `path`：历史 query 已由 `parseHistoryParams` 解析进参数面板，
 * `buildRequest` 会重新拼接，保留会重复。
 */
export function extractPathFromHistoryUrl(
  url: string | undefined,
  baseUrls: string[] = [],
): string {
  const raw = (url ?? '').trim()

  if (!raw) { return '' }

  if (!ABSOLUTE_URL.test(raw)) {
    return stripQueryAndHash(raw)
  }

  const candidates = Array.from(
    new Set(baseUrls.map((base) => base.trim().replace(/\/+$/, '')).filter(Boolean)),
  ).sort((a, b) => b.length - a.length)

  const lowerRaw = raw.toLowerCase()

  for (const base of candidates) {
    const lowerBase = base.toLowerCase()

    if (lowerRaw === lowerBase) { return '/' }

    if (lowerRaw.startsWith(`${lowerBase}/`)) {
      const rest = stripQueryAndHash(raw.slice(base.length))

      return rest.startsWith('/') ? rest : `/${rest}`
    }
  }

  // 未命中任何环境：保留完整地址（不含 query/hash），避免丢失 host
  try {
    const parsed = new URL(raw)
    const origin = parsed.origin === 'null' ? '' : parsed.origin
    const pathname = parsed.pathname || '/'

    return origin ? `${origin}${pathname}` : stripQueryAndHash(raw)
  }
  catch {
    return stripQueryAndHash(raw)
  }
}
