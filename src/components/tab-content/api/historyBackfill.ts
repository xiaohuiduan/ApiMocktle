import { BodyType, ParamType } from '@/enums'
import type { ApiDetails, ApiRequestBody, Parameter, SavedRequestConfig } from '@/types'

import { extractPathFromHistoryUrl, parseHistoryParams } from './historyUtils'

type ParamSection = 'query' | 'header' | 'cookie'

export interface HistoryBackfillInput {
  /** 当前运行态副本（可能是文档定义，也可能是用户改过的草稿） */
  current: ApiDetails
  /** 目标历史记录的 requestJson；缺失时原样返回 current */
  requestJson?: SavedRequestConfig
  /** 环境 baseUrl 列表，用于把绝对地址还原成相对路径 */
  baseUrls?: string[]
}

function paramKey(section: ParamSection, name: string | undefined): string {
  const key = (name ?? '').trim()

  // Header 名按 HTTP 语义忽略大小写；query/cookie 名是大小写敏感的
  return section === 'header' ? key.toLowerCase() : key
}

/** 历史解析出的值一律是字符串；骨架若是数组类型，按参数表的展示规则归一 */
function toStringExample(value: Parameter['example']): string {
  if (Array.isArray(value)) { return value.join(',') }

  return value ?? ''
}

/** 写回骨架时必须跟随骨架的类型：array 类型写成裸字符串，参数表面板会渲染成空输入 */
function withExample(param: Parameter, value: string): Parameter {
  return param.type === ParamType.Array
    ? ({ ...param, example: [value] } as Parameter)
    : ({ ...param, example: value } as Parameter)
}

function arrayExampleOf(param: Parameter): string[] {
  const current = param.example

  if (Array.isArray(current)) { return current }

  return current ? [current] : []
}

/**
 * 以当前参数列表为骨架，把历史解析结果合并进来。
 *
 * - 命中同名：只换 `example`，保留文档里的 type/description/required 与顺序；
 * - 同名重复出现（`tag=a&tag=b`）：骨架有空位就按顺序填，否则 array 聚合成数组、
 *   其它类型追加成多行 —— 折叠掉一个等于丢一个实际发出去的参数；
 * - 历史独有：追加到末尾；
 * - 骨架里历史没有的：原样保留 —— URL 无法区分「没启用」与「解析失败」，
 *   擅自关掉会让请求静默少发参数。
 */
function mergeParams(
  section: ParamSection,
  skeleton: Parameter[] | undefined,
  incoming: Parameter[],
): Parameter[] {
  const merged = (skeleton ?? []).map((param) => ({ ...param })) as Parameter[]
  const slotsByName = new Map<string, number[]>()
  const filled = new Set<number>()

  merged.forEach((param, idx) => {
    const key = paramKey(section, param.name)

    if (!key) { return }

    const slots = slotsByName.get(key) ?? []

    slots.push(idx)
    slotsByName.set(key, slots)
  })

  for (const incomingParam of incoming) {
    const key = paramKey(section, incomingParam.name)

    if (!key) { continue }

    const slots = slotsByName.get(key) ?? []
    const freeSlot = slots.find((idx) => !filled.has(idx))

    if (freeSlot !== undefined) {
      filled.add(freeSlot)
      merged[freeSlot] = withExample(merged[freeSlot], toStringExample(incomingParam.example))
      continue
    }

    const arraySlot = slots.find((idx) => merged[idx].type === ParamType.Array)

    if (arraySlot !== undefined) {
      merged[arraySlot] = {
        ...merged[arraySlot],
        example: [...arrayExampleOf(merged[arraySlot]), toStringExample(incomingParam.example)],
      } as Parameter
      continue
    }

    const appendedIdx = merged.length

    merged.push({ ...incomingParam })
    slots.push(appendedIdx)
    slotsByName.set(key, slots)
    filled.add(appendedIdx)
  }

  return merged
}

/** 历史 body 优先；类型只区分 JSON 与其余（与手动回填保持一致） */
function resolveBody(
  current: ApiDetails,
  requestJson: SavedRequestConfig,
): ApiRequestBody | undefined {
  const historyBody = requestJson.body

  if (!historyBody?.trim()) { return current.requestBody }

  const type = requestJson.contentType === 'application/json' ? BodyType.Json : BodyType.Raw
  const base = current.requestBody ?? ({ type } as ApiRequestBody)

  return { ...base, type, rawText: historyBody }
}

/**
 * 把一条运行历史还原进运行态副本（`workCopy`）。
 *
 * 自动恢复与「回填」按钮共用这一份实现：历史上两条链路各写一套，结果就是
 * 自动恢复那条悄悄漂移成「只补空白」，文档占位值（`@id`）永远盖不掉。
 */
export function applyHistoryToWorkCopy(input: HistoryBackfillInput): ApiDetails {
  const { current, requestJson, baseUrls = [] } = input

  if (!requestJson) { return current }

  const parsed = parseHistoryParams(requestJson.headers ?? [], requestJson.url ?? '')
  const historyPath = extractPathFromHistoryUrl(requestJson.url, baseUrls)
  const currentParameters = current.parameters ?? {}
  const header = mergeParams('header', currentParameters.header, parsed.header)

  return {
    ...current,
    method: (requestJson.method ?? current.method) as ApiDetails['method'],
    path: historyPath || current.path,
    parameters: {
      ...currentParameters,
      query: mergeParams('query', currentParameters.query, parsed.query),
      // Cookie 统一由 cookie 段序列化；骨架里再留一个 Cookie header 会发出两个 Cookie 头
      header: parsed.cookie.length > 0
        ? header.filter((param) => (param.name ?? '').trim().toLowerCase() !== 'cookie')
        : header,
      cookie: mergeParams('cookie', currentParameters.cookie, parsed.cookie),
    },
    requestBody: resolveBody(current, requestJson),
  }
}
