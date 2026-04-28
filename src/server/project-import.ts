import { randomUUID } from 'node:crypto'

import type { ApiMenuData } from '@/components/ApiMenu'
import { ROOT_CATALOG } from '@/configs/static'
import { MenuItemType } from '@/enums'
import type { ApiDetails } from '@/types'

import { getMaxSortOrder, insertMenuItem, listMenuItems, runInTransaction, updateMenuItem } from './db/menu-repo'
import { getProjectState } from './project-state'

export type ImportMergeMode = 'append' | 'openapi-upsert'

function normalizeParentId(parentId?: string) {
  if (!parentId || parentId === ROOT_CATALOG) {
    return undefined
  }

  return parentId
}

function assertUniqueImportedMenuIds(menuItems: ApiMenuData[]) {
  const seenIds = new Set<string>()

  menuItems.forEach((item) => {
    if (seenIds.has(item.id)) {
      throw new Error(`导入数据包含重复菜单 ID：${item.id}`)
    }

    seenIds.add(item.id)
  })
}

function reserveImportedId(preferredId: string, occupiedIds: Set<string>) {
  if (!occupiedIds.has(preferredId)) {
    occupiedIds.add(preferredId)

    return preferredId
  }

  let nextId = randomUUID()

  while (occupiedIds.has(nextId)) {
    nextId = randomUUID()
  }

  occupiedIds.add(nextId)

  return nextId
}

function buildImportedIdMap(menuItems: ApiMenuData[], occupiedIds: Set<string>) {
  const importedIdMap = new Map<string, string>()

  menuItems.forEach((item) => {
    importedIdMap.set(item.id, reserveImportedId(item.id, occupiedIds))
  })

  return importedIdMap
}

function resolveImportedParentId(
  parentId: string | undefined,
  importedIdMap: Map<string, string>,
) {
  const normalizedParentId = normalizeParentId(parentId)

  if (!normalizedParentId) {
    return undefined
  }

  return importedIdMap.get(normalizedParentId) ?? normalizedParentId
}

function folderParentKey(parentId?: string) {
  if (!parentId || parentId === ROOT_CATALOG) {
    return 'ROOT'
  }

  return parentId
}

function makeFolderLookupKey(parentId: string | undefined, name: string) {
  return `${folderParentKey(parentId)}\0${name}`
}

function makeEndpointLookupKey(path: string | undefined, method: string | undefined) {
  const p = (path ?? '').trim()
  const m = (method ?? 'GET').toUpperCase()

  return `${p}\0${m}`
}

function buildDataJsonForUpsert(
  item: ApiMenuData,
  targetId: string,
  isUpdate: boolean,
  snapshot: ApiMenuData[],
): string | undefined {
  if (!item.data) {
    return undefined
  }

  if (!isUpdate) {
    return JSON.stringify(item.data)
  }

  const existing = snapshot.find((x) => x.id === targetId)

  if (item.type === MenuItemType.ApiDetail && existing?.data && typeof existing.data === 'object') {
    const oldData = existing.data as ApiDetails
    const next = { ...item.data } as ApiDetails

    if (typeof oldData.id === 'string' && oldData.id) {
      next.id = oldData.id
    }

    return JSON.stringify(next)
  }

  return JSON.stringify(item.data)
}

interface ImportCounts {
  created: number
  updated: number
}

function mergeOpenApiUpsert(projectId: string, menuItems: ApiMenuData[], snapshot: ApiMenuData[]): ImportCounts {
  const occupiedIds = new Set(listMenuItems(projectId).map(({ id }) => id))

  const endpointToMenuId = new Map<string, string>()
  const schemaNameToMenuId = new Map<string, string>()
  const detailFolderByKey = new Map<string, string>()
  const schemaFolderByKey = new Map<string, string>()

  for (const item of snapshot) {
    if (item.type === MenuItemType.ApiDetail && item.data && typeof item.data === 'object') {
      const d = item.data
      const key = makeEndpointLookupKey(d.path, d.method)

      if (!endpointToMenuId.has(key)) {
        endpointToMenuId.set(key, item.id)
      }
    }

    if (item.type === MenuItemType.ApiSchema) {
      if (!schemaNameToMenuId.has(item.name)) {
        schemaNameToMenuId.set(item.name, item.id)
      }
    }

    if (item.type === MenuItemType.ApiDetailFolder) {
      const k = makeFolderLookupKey(item.parentId, item.name)

      if (!detailFolderByKey.has(k)) {
        detailFolderByKey.set(k, item.id)
      }
    }

    if (item.type === MenuItemType.ApiSchemaFolder) {
      const k = makeFolderLookupKey(item.parentId, item.name)

      if (!schemaFolderByKey.has(k)) {
        schemaFolderByKey.set(k, item.id)
      }
    }
  }

  const workingEndpoints = new Map(endpointToMenuId)
  const workingSchemas = new Map(schemaNameToMenuId)
  const workingDetailFolders = new Map(detailFolderByKey)
  const workingSchemaFolders = new Map(schemaFolderByKey)

  const importedIdMap = new Map<string, string>()
  const updateTargets = new Set<string>()

  const assignMapped = (importId: string, targetId: string, asUpdate: boolean) => {
    importedIdMap.set(importId, targetId)

    if (asUpdate) {
      updateTargets.add(targetId)
    }
  }

  for (const item of menuItems) {
    const mappedParent = item.parentId
      ? (importedIdMap.get(item.parentId) ?? item.parentId)
      : undefined

    if (item.type === MenuItemType.ApiDetailFolder) {
      const lk = makeFolderLookupKey(mappedParent, item.name)
      const hit = workingDetailFolders.get(lk)

      if (hit) {
        assignMapped(item.id, hit, true)
      }
      else {
        const nid = reserveImportedId(item.id, occupiedIds)
        assignMapped(item.id, nid, false)
        workingDetailFolders.set(lk, nid)
      }

      continue
    }

    if (item.type === MenuItemType.ApiSchemaFolder) {
      const lk = makeFolderLookupKey(mappedParent, item.name)
      const hit = workingSchemaFolders.get(lk)

      if (hit) {
        assignMapped(item.id, hit, true)
      }
      else {
        const nid = reserveImportedId(item.id, occupiedIds)
        assignMapped(item.id, nid, false)
        workingSchemaFolders.set(lk, nid)
      }

      continue
    }

    if (item.type === MenuItemType.ApiDetail && item.data && typeof item.data === 'object') {
      const d = item.data
      const ek = makeEndpointLookupKey(d.path, d.method)
      const hit = workingEndpoints.get(ek)

      if (hit) {
        assignMapped(item.id, hit, true)
      }
      else {
        const nid = reserveImportedId(item.id, occupiedIds)
        assignMapped(item.id, nid, false)
        workingEndpoints.set(ek, nid)
      }

      continue
    }

    if (item.type === MenuItemType.ApiSchema) {
      const hit = workingSchemas.get(item.name)

      if (hit) {
        assignMapped(item.id, hit, true)
      }
      else {
        const nid = reserveImportedId(item.id, occupiedIds)
        assignMapped(item.id, nid, false)
        workingSchemas.set(item.name, nid)
      }

      continue
    }

    assignMapped(item.id, reserveImportedId(item.id, occupiedIds), false)
  }

  let sortOrder = getMaxSortOrder(projectId)

  for (const item of menuItems) {
    const targetId = importedIdMap.get(item.id)

    if (!targetId) {
      throw new Error('导入合并映射异常')
    }

    const parentId = resolveImportedParentId(item.parentId, importedIdMap)
    const isUpdate = updateTargets.has(targetId)
    const dataJson = buildDataJsonForUpsert(item, targetId, isUpdate, snapshot)

    if (isUpdate) {
      updateMenuItem({
        projectId,
        id: targetId,
        parentId,
        name: item.name,
        type: item.type,
        dataJson,
      })
    }
    else {
      sortOrder += 1

      insertMenuItem({
        projectId,
        id: targetId,
        parentId,
        name: item.name,
        type: item.type,
        dataJson,
        sortOrder,
      })
    }
  }

  return { created: menuItems.length - updateTargets.size, updated: updateTargets.size }
}

export function mergeProjectStateWithMenuItems(
  projectId: string,
  menuItems: ApiMenuData[],
  options?: { mergeMode?: ImportMergeMode },
) {
  assertUniqueImportedMenuIds(menuItems)

  const mergeMode = options?.mergeMode ?? 'append'
  let counts: ImportCounts = { created: 0, updated: 0 }

  runInTransaction(() => {
    if (mergeMode === 'openapi-upsert') {
      const snapshot = getProjectState(projectId).menuRawList
      counts = mergeOpenApiUpsert(projectId, menuItems, snapshot)

      return
    }

    const occupiedIds = new Set(listMenuItems(projectId).map(({ id }) => id))
    const importedIdMap = buildImportedIdMap(menuItems, occupiedIds)
    let sortOrder = getMaxSortOrder(projectId)

    menuItems.forEach((item) => {
      sortOrder += 1

      insertMenuItem({
        projectId,
        id: importedIdMap.get(item.id) ?? item.id,
        parentId: resolveImportedParentId(item.parentId, importedIdMap),
        name: item.name,
        type: item.type,
        dataJson: item.data ? JSON.stringify(item.data) : undefined,
        sortOrder,
      })
    })

    counts = { created: menuItems.length, updated: 0 }
  })

  return { state: getProjectState(projectId), ...counts }
}
