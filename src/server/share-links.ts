import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'

import { getUserById } from './db/auth-repo'
import {
  deleteShareLink as deleteShareLinkRow,
  getShareLink as getShareLinkRow,
  insertShareLink,
  listShareLinks as listShareLinksRows,
  updateShareLink as updateShareLinkRow,
} from './db/share-links-repo'
import { getApiSchemasByNames, getMenuItemsByIds } from './db/menu-repo'

function toPasswordHash(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false
  const calculated = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (calculated.length !== expected.length) return false
  return timingSafeEqual(calculated, expected)
}

function toShareLinkItem(row: ReturnType<typeof listShareLinksRows>[number]) {
  const creator = getUserById(row.creator_user_id)
  return {
    id: row.id,
    projectId: row.project_id,
    creatorUserId: row.creator_user_id,
    creatorUsername: creator?.username ?? 'unknown',
    apiMenuIds: JSON.parse(row.api_menu_ids) as string[],
    hasPassword: !!row.password_hash,
    accessKey: row.access_key ?? undefined,
    expiresAt: row.expires_at,
    title: row.title,
    createdAt: row.created_at,
  }
}

export function getShareLinkList(projectId: string) {
  return listShareLinksRows(projectId).map(toShareLinkItem)
}

export function createShareLink(payload: {
  projectId: string
  creatorUserId: string
  apiMenuIds: string[]
  password?: string
  expiresAt?: string
  title?: string
}) {
  const passwordHash = payload.password ? toPasswordHash(payload.password) : undefined
  const accessKey = payload.password ? randomUUID() : undefined
  const id = insertShareLink({
    projectId: payload.projectId,
    creatorUserId: payload.creatorUserId,
    apiMenuIds: payload.apiMenuIds,
    passwordHash,
    accessKey,
    expiresAt: payload.expiresAt,
    title: payload.title,
  })

  return getShareLinkList(payload.projectId)
}

export function removeShareLink(projectId: string, shareId: string) {
  deleteShareLinkRow({ projectId, shareId })
  return getShareLinkList(projectId)
}

export function editShareLink(payload: {
  projectId: string
  shareId: string
  apiMenuIds?: string[]
  password?: string | null
  expiresAt?: string | null
  title?: string
}) {
  const updates: Parameters<typeof updateShareLinkRow>[0] = {
    projectId: payload.projectId,
    shareId: payload.shareId,
  }

  if (payload.apiMenuIds !== undefined) updates.apiMenuIds = payload.apiMenuIds
  if (payload.password !== undefined) {
    updates.passwordHash = payload.password === null ? null : toPasswordHash(payload.password)
  }
  if (payload.expiresAt !== undefined) updates.expiresAt = payload.expiresAt
  if (payload.title !== undefined) updates.title = payload.title

  updateShareLinkRow(updates)
  return getShareLinkList(payload.projectId)
}

export interface ShareLinkAccessResult {
  valid: boolean
  error?: string
  shareData?: {
    id: string
    projectId: string
    title: string
    apiMenuIds: string[]
    expiresAt: string | null
  }
}

/**
 * 仅检查分享是否存在及是否过期，不验证密码
 */
export function getShareMeta(shareId: string) {
  const row = getShareLinkRow(shareId)
  if (!row) return null

  const expired = row.expires_at ? Date.now() > new Date(row.expires_at).getTime() : false

  return {
    id: row.id,
    title: row.title,
    expiresAt: row.expires_at,
    needsPassword: !!row.password_hash,
    expired,
  }
}

export function accessShareLink(shareId: string, password?: string, accessKey?: string): ShareLinkAccessResult {
  const row = getShareLinkRow(shareId)

  if (!row) {
    return { valid: false, error: '分享链接不存在' }
  }

  // 检查过期
  if (row.expires_at) {
    const expiresAt = new Date(row.expires_at).getTime()
    if (Date.now() > expiresAt) {
      return { valid: false, error: '分享链接已过期' }
    }
  }

  // access_key 验证（优先，无需密码）
  if (row.password_hash && accessKey && row.access_key) {
    if (accessKey === row.access_key) {
      return {
        valid: true,
        shareData: {
          id: row.id,
          projectId: row.project_id,
          title: row.title,
          apiMenuIds: JSON.parse(row.api_menu_ids) as string[],
          expiresAt: row.expires_at,
        },
      }
    }
    return { valid: false, error: '密码错误' }
  }

  // 密码验证
  if (row.password_hash) {
    if (!password) {
      return { valid: false, error: '需要密码' }
    }
    if (!verifyPassword(password, row.password_hash)) {
      return { valid: false, error: '密码错误' }
    }
  }

  return {
    valid: true,
    shareData: {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      apiMenuIds: JSON.parse(row.api_menu_ids) as string[],
      expiresAt: row.expires_at,
    },
  }
}

function collectRefNames(schema: unknown, names: Set<string>) {
  if (!schema || typeof schema !== 'object') return
  if (Array.isArray(schema)) {
    for (const item of schema) collectRefNames(item, names)
    return
  }
  const s = schema as Record<string, unknown>
  if (typeof s.$ref === 'string') {
    names.add(s.$ref)
  }
  for (const v of Object.values(s)) {
    if (v && typeof v === 'object') {
      collectRefNames(v, names)
    }
  }
}

function resolveSchemaRefsDeep(
  schema: unknown,
  schemasMap: Map<string, unknown>,
  visited: Set<string> = new Set(),
): unknown {
  if (!schema || typeof schema !== 'object') return schema
  if (Array.isArray(schema)) return schema.map((s) => resolveSchemaRefsDeep(s, schemasMap, visited))

  const s = schema as Record<string, unknown>

  if (typeof s.$ref === 'string') {
    if (visited.has(s.$ref)) return schema
    const resolved = schemasMap.get(s.$ref)
    if (resolved) {
      const newVisited = new Set(visited)
      newVisited.add(s.$ref)
      const fullyResolved = resolveSchemaRefsDeep(resolved, schemasMap, newVisited)
      return {
        ...(fullyResolved as Record<string, unknown>),
        name: s.name,
        description: s.description ?? (fullyResolved as Record<string, unknown>).description,
      }
    }
    return schema
  }

  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s)) {
    if (v && typeof v === 'object') {
      result[k] = resolveSchemaRefsDeep(v, schemasMap, visited)
    } else {
      result[k] = v
    }
  }
  return result
}

/**
 * 获取分享链接对应的接口数据（只读），并解析所有 $ref 引用
 */
export function getShareLinkApiData(shareId: string) {
  const row = getShareLinkRow(shareId)
  if (!row) return null

  const apiMenuIds = JSON.parse(row.api_menu_ids) as string[]
  const sharedItems = getMenuItemsByIds({ projectId: row.project_id, ids: apiMenuIds })

  // 收集所有 $ref 名称
  const refNames = new Set<string>()
  for (const item of sharedItems) {
    if (!item.data_json) continue
    const data = JSON.parse(item.data_json) as Record<string, unknown>
    if (data.requestBody) collectRefNames(data.requestBody, refNames)
    if (Array.isArray(data.responses)) {
      for (const resp of data.responses) {
        collectRefNames(resp, refNames)
      }
    }
  }

  // 查询引用的 schema 定义
  const schemaItems = getApiSchemasByNames(row.project_id, Array.from(refNames))
  const schemasMap = new Map<string, unknown>()
  for (const schemaItem of schemaItems) {
    if (schemaItem.data_json) {
      schemasMap.set(schemaItem.name, JSON.parse(schemaItem.data_json))
    }
  }

  // 递归解析 schema 中的 $ref（需要二次解析因为 schema 可能嵌套）
  const resolvedSchemasMap = new Map<string, unknown>()
  for (const [name, raw] of schemasMap) {
    const schemaData = raw as Record<string, unknown>
    resolvedSchemasMap.set(name, resolveSchemaRefsDeep(schemaData.jsonSchema ?? schemaData, schemasMap))
  }

  return {
    title: row.title,
    projectId: row.project_id,
    items: sharedItems.map((item) => {
      const data = item.data_json ? JSON.parse(item.data_json) as Record<string, unknown> : null
      if (!data) return { id: item.id, name: item.name, type: item.type, parentId: item.parent_id, data: null }

      if (data.requestBody) {
        data.requestBody = resolveSchemaRefsDeep(data.requestBody, resolvedSchemasMap) as Record<string, unknown>
      }
      if (Array.isArray(data.responses)) {
        data.responses = data.responses.map((r: unknown) => resolveSchemaRefsDeep(r, resolvedSchemasMap))
      }

      return {
        id: item.id,
        name: item.name,
        type: item.type,
        parentId: item.parent_id,
        data,
      }
    }),
  }
}
