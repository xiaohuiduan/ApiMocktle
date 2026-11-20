import { enUS, zhCN } from './resources'

/**
 * 系统生成的默认名称集合（**跨所有语种**）。
 *
 * 背景：`contexts/menu-drafts.ts` 用「名字是否等于系统默认名」判断用户有没有
 * 真正命名过一条草稿——只带默认名的空草稿在关闭页签时会被自动丢弃。
 *
 * 这些默认名会被写进草稿与数据库，属于内容数据，**不随切换语言回改**。
 * 因此判定集合必须同时包含中文与英文两套默认名，否则英文界面下新建的草稿
 * （名字是 `New API`）在切回中文后会被误判为「已命名」，空草稿清理逻辑失效。
 *
 * 新增语种或新增默认名类型时，必须同步更新本集合。
 */
export const SYSTEM_DEFAULT_NAMES: ReadonlySet<string> = new Set([
  ...Object.values(zhCN.app.defaultNames),
  ...Object.values(enUS.app.defaultNames),
])

/**
 * 默认**响应**名称集合（跨所有语种）。
 *
 * 新建响应时 `ModalNewResponse` 用 `t('api.response.defaultName')` 作为初始名字，
 * 即中文界面写「成功」、英文界面写「Success」。`menu-drafts.ts` 的
 * `isDraftEmpty()` 用它判断「默认响应是否被改过」——判定必须同时认两种语言。
 */
export const DEFAULT_RESPONSE_NAMES: ReadonlySet<string> = new Set([
  zhCN.api.response.defaultName,
  enUS.api.response.defaultName,
])

/** 判断给定名称是否为系统默认名（即用户未真正命名过）。 */
export function isSystemDefaultName(name: string | undefined | null): boolean {
  const trimmed = name?.trim()

  if (!trimmed) {
    return true
  }

  return SYSTEM_DEFAULT_NAMES.has(trimmed)
}

/**
 * 判断响应名是否仍是默认名（用户未改过）。
 *
 * 默认响应名同样可能以中英两种语言之一写入数据库，因此跨语种判定。
 */
export function isDefaultResponseName(name: string | undefined | null): boolean {
  const trimmed = name?.trim()

  if (!trimmed) {
    return true
  }

  return DEFAULT_RESPONSE_NAMES.has(trimmed)
}
