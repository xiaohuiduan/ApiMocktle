import type { ApiMenuData } from '@/components/ApiMenu/ApiMenu.type'
import { BodyType } from '@/enums'
import type { ApiDetails } from '@/types'

/**
 * 草稿（未保存到数据库的菜单项）本地存储层。
 *
 * - 存储位置：localStorage，键 `project-drafts:{projectId}`，跨 App 重启保留。
 * - 每条草稿记录形如 { item, isNew }：
 *   - isNew === true：新建但未入库的菜单项（左侧树显示红 `*`）。
 *   - isNew === false：已入库项的“未保存修改”覆盖层（不显示红 `*`，沿用 tab 脏标记）。
 * - 合并策略：以数据库列表为基准，草稿覆盖同 id 项，或作为新节点追加。
 */

export interface StoredDraft {
  item: ApiMenuData
  isNew: boolean
}

const getDraftsKey = (projectId: string) => `project-drafts:${projectId}`

/**
 * 已被“显式删除草稿”的新建草稿 id 墓碑集合。
 *
 * 用于解决时序竞态：删除草稿会同时关闭其页签，导致对应编辑组件卸载，
 * 其卸载 flush 会再次尝试把这条新建草稿写回 localStorage，从而“复活”该草稿、
 * 让左侧树重新出现它。命中墓碑的新建写入（isNew）将被一次性拦截。
 */
const discardedDraftIds = new Set<string>()

export function readDrafts(projectId: string): StoredDraft[] {
  try {
    const raw = window.localStorage.getItem(getDraftsKey(projectId))

    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown

    return Array.isArray(parsed) ? (parsed as StoredDraft[]) : []
  }
  catch {
    return []
  }
}

function writeDrafts(projectId: string, drafts: StoredDraft[]) {
  try {
    if (drafts.length === 0) {
      window.localStorage.removeItem(getDraftsKey(projectId))

      return
    }

    window.localStorage.setItem(getDraftsKey(projectId), JSON.stringify(drafts))
  }
  catch {
    // ignore storage write errors
  }
}

/** 写入或更新一条草稿（按 id 去重）。 */
export function upsertDraft(projectId: string, item: ApiMenuData, isNew: boolean) {
  // 新建草稿刚被显式删除后，拦截紧随其后的卸载 flush 重新写回（一次性消费墓碑）。
  if (isNew && discardedDraftIds.has(item.id)) {
    discardedDraftIds.delete(item.id)

    return
  }

  const drafts = readDrafts(projectId)
  const idx = drafts.findIndex((d) => d.item.id === item.id)

  const next: StoredDraft = { item, isNew }

  if (idx >= 0) {
    drafts[idx] = next
  }
  else {
    drafts.push(next)
  }

  writeDrafts(projectId, drafts)
}

/** 删除指定 id 的草稿。 */
export function removeDraftById(projectId: string, id: string) {
  // 记录墓碑，抑制随后（页签关闭引发的组件卸载）对同一新建草稿的写回。
  discardedDraftIds.add(id)

  const drafts = readDrafts(projectId)
  const next = drafts.filter((d) => d.item.id !== id)

  if (next.length !== drafts.length) {
    writeDrafts(projectId, next)
  }
}

/** 该 id 是否存在草稿。 */
export function hasDraft(projectId: string, id: string): boolean {
  return readDrafts(projectId).some((d) => d.item.id === id)
}

/**
 * 将草稿合并进数据库菜单列表，返回新的合并列表（单一数据源）。
 *
 * - 同 id 存在于数据库：用草稿数据覆盖（`__isDraft` 标记为 false，视为已入库项的未保存修改）。
 * - 同 id 不存在于数据库：作为新节点追加（`__isDraft = isNew`）。
 */
export function mergeDraftsIntoList(
  projectId: string,
  dbList: ApiMenuData[] | undefined,
): ApiMenuData[] {
  const base = (dbList ?? []).map((it) => ({ ...it, __isDraft: false }))
  const drafts = readDrafts(projectId)

  if (drafts.length === 0) {
    return base
  }

  const result = [...base]

  for (const { item, isNew } of drafts) {
    const idx = result.findIndex((m) => m.id === item.id)

    if (idx >= 0) {
      // 已入库项的未保存修改覆盖层
      result[idx] = { ...item, __isDraft: false }
    }
    else {
      // 新建未入库草稿
      result.push({ ...item, __isDraft: isNew })
    }
  }

  return result
}

/**
 * 判断一条快捷请求草稿是否“为空”（新建后未做任何有意义的编辑）。
 * 空草稿在关闭其 tab 时自动丢弃，避免堆积垃圾。
 */
export function isDraftEmpty(item: ApiMenuData): boolean {
  const data = item.data as ApiDetails | undefined

  if (!data) {
    return true
  }

  const hasPath = Boolean(data.path?.trim())
  const isDefaultMethod = data.method.toUpperCase() === 'GET'

  const paramGroups = [
    data.parameters?.query,
    data.parameters?.header,
    data.parameters?.cookie,
    data.parameters?.path,
  ]
  const hasParams = paramGroups.some((group) =>
    (group ?? []).some((p) => Boolean(p.name?.trim())),
  )

  const body = data.requestBody
  let hasBody = false

  if (body && body.type !== BodyType.None) {
    if (body.type === BodyType.FormData || body.type === BodyType.UrlEncoded) {
      hasBody = (body.parameters ?? []).some((p) => Boolean(p.name?.trim()))
    }
    else if (body.type === BodyType.Json || body.type === BodyType.Xml) {
      const schema = body.jsonSchema as { properties?: unknown[] } | undefined
      hasBody = Boolean(schema?.properties?.length)
    }
    else {
      hasBody = Boolean(body.rawText?.trim())
    }
  }

  const hasScripts = Boolean(data.preScript?.trim()) || Boolean(data.postScript?.trim())

  return !hasPath && isDefaultMethod && !hasParams && !hasBody && !hasScripts
}
