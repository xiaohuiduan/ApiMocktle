import { randomUUID } from 'node:crypto'

import { db } from './client'

import type { ProjectRole } from '../types'

export interface MenuItemRow {
  project_id: string
  id: string
  parent_id: string | null
  name: string
  type: string
  data_json: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface RecycleItemRow {
  id: string
  project_id: string
  catalog_type: string
  deleted_item_json: string
  creator_json: string
  expires_at: number
  created_at: string
}

export function runInTransaction<T>(handler: () => T): T {
  db.exec('BEGIN')

  try {
    const result = handler()
    db.exec('COMMIT')
    return result
  }
  catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function listMenuItems(projectId: string) {
  return db.prepare(`
    SELECT project_id, id, parent_id, name, type, data_json, sort_order, created_at, updated_at
    FROM menu_items
    WHERE project_id = ?
    ORDER BY sort_order ASC
  `).all(projectId) as MenuItemRow[]
}

export function getMenuItem(payload: { projectId: string, menuId: string }) {
  return db.prepare(`
    SELECT project_id, id, parent_id, name, type, data_json, sort_order, created_at, updated_at
    FROM menu_items
    WHERE project_id = ? AND id = ?
  `).get(payload.projectId, payload.menuId) as MenuItemRow | undefined
}

export function getMenuItemsByIds(payload: { projectId: string, ids: string[] }) {
  if (payload.ids.length === 0) {
    return [] as MenuItemRow[]
  }

  const placeholders = payload.ids.map(() => '?').join(', ')
  const stmt = db.prepare(`
    SELECT project_id, id, parent_id, name, type, data_json, sort_order, created_at, updated_at
    FROM menu_items
    WHERE project_id = ? AND id IN (${placeholders})
  `)

  return stmt.all(payload.projectId, ...payload.ids) as MenuItemRow[]
}

export function getApiSchemasByNames(projectId: string, names: string[]) {
  if (names.length === 0) {
    return [] as MenuItemRow[]
  }

  const placeholders = names.map(() => '?').join(', ')
  const stmt = db.prepare(`
    SELECT project_id, id, parent_id, name, type, data_json, sort_order, created_at, updated_at
    FROM menu_items
    WHERE project_id = ? AND type = 'apiSchema' AND name IN (${placeholders})
  `)

  return stmt.all(projectId, ...names) as MenuItemRow[]
}

export function getMaxSortOrder(projectId: string) {
  const row = db.prepare(`
    SELECT MAX(sort_order) AS max_sort
    FROM menu_items
    WHERE project_id = ?
  `).get(projectId) as { max_sort: number | null }

  return row.max_sort ?? 0
}

export function insertMenuItem(payload: {
  projectId: string
  id: string
  parentId?: string
  name: string
  type: string
  dataJson?: string
  sortOrder: number
}) {
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO menu_items (
      project_id, id, parent_id, name, type, data_json, sort_order, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.projectId,
    payload.id,
    payload.parentId ?? null,
    payload.name,
    payload.type,
    payload.dataJson ?? null,
    payload.sortOrder,
    now,
    now,
  )
}

export function updateMenuItem(payload: {
  projectId: string
  id: string
  parentId?: string
  name: string
  type: string
  dataJson?: string
}) {
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE menu_items
    SET parent_id = ?, name = ?, type = ?, data_json = ?, updated_at = ?
    WHERE project_id = ? AND id = ?
  `).run(
    payload.parentId ?? null,
    payload.name,
    payload.type,
    payload.dataJson ?? null,
    now,
    payload.projectId,
    payload.id,
  )
}

export function updateMenuSortOrder(payload: {
  projectId: string
  id: string
  sortOrder: number
  parentId?: string
}) {
  db.prepare(`
    UPDATE menu_items
    SET sort_order = ?, parent_id = ?, updated_at = ?
    WHERE project_id = ? AND id = ?
  `).run(
    payload.sortOrder,
    payload.parentId ?? null,
    new Date().toISOString(),
    payload.projectId,
    payload.id,
  )
}

export function deleteMenuItems(payload: { projectId: string, ids: string[] }) {
  if (payload.ids.length === 0) {
    return
  }

  const placeholders = payload.ids.map(() => '?').join(', ')
  const stmt = db.prepare(`
    DELETE FROM menu_items
    WHERE project_id = ? AND id IN (${placeholders})
  `)

  stmt.run(payload.projectId, ...payload.ids)
}

export function clearMenuItems(projectId: string) {
  db.prepare(`
    DELETE FROM menu_items
    WHERE project_id = ?
  `).run(projectId)
}

export function insertRecycleItem(payload: {
  projectId: string
  catalogType: string
  deletedItemJson: string
  creatorJson: string
  expiresAt: number
}) {
  const id = randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO recycle_items (id, project_id, catalog_type, deleted_item_json, creator_json, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    payload.projectId,
    payload.catalogType,
    payload.deletedItemJson,
    payload.creatorJson,
    payload.expiresAt,
    now,
  )
}

export function listRecycleItems(projectId: string) {
  return db.prepare(`
    SELECT id, project_id, catalog_type, deleted_item_json, creator_json, expires_at, created_at
    FROM recycle_items
    WHERE project_id = ?
    ORDER BY created_at DESC
  `).all(projectId) as RecycleItemRow[]
}

export function getRecycleItem(payload: { projectId: string, recycleId: string }) {
  return db.prepare(`
    SELECT id, project_id, catalog_type, deleted_item_json, creator_json, expires_at, created_at
    FROM recycle_items
    WHERE project_id = ? AND id = ?
  `).get(payload.projectId, payload.recycleId) as RecycleItemRow | undefined
}

export function getRecycleItemsByIds(payload: { projectId: string, ids: string[] }) {
  if (payload.ids.length === 0) {
    return [] as RecycleItemRow[]
  }

  const placeholders = payload.ids.map(() => '?').join(', ')
  const stmt = db.prepare(`
    SELECT id, project_id, catalog_type, deleted_item_json, creator_json, expires_at, created_at
    FROM recycle_items
    WHERE project_id = ? AND id IN (${placeholders})
  `)

  return stmt.all(payload.projectId, ...payload.ids) as RecycleItemRow[]
}

export function deleteRecycleItem(payload: { projectId: string, recycleId: string }) {
  db.prepare(`
    DELETE FROM recycle_items
    WHERE project_id = ? AND id = ?
  `).run(payload.projectId, payload.recycleId)
}

export function deleteRecycleItems(payload: { projectId: string, ids: string[] }) {
  if (payload.ids.length === 0) {
    return
  }

  const placeholders = payload.ids.map(() => '?').join(', ')
  const stmt = db.prepare(`
    DELETE FROM recycle_items
    WHERE project_id = ? AND id IN (${placeholders})
  `)

  stmt.run(payload.projectId, ...payload.ids)
}

export function clearRecycleItems(projectId: string) {
  db.prepare(`
    DELETE FROM recycle_items
    WHERE project_id = ?
  `).run(projectId)
}

export function clearExpiredRecycleItems(payload: { now: number, projectId?: string }) {
  if (payload.projectId) {
    db.prepare(`
      DELETE FROM recycle_items
      WHERE project_id = ? AND expires_at <= ?
    `).run(payload.projectId, payload.now)
    return
  }

  db.prepare(`
    DELETE FROM recycle_items
    WHERE expires_at <= ?
  `).run(payload.now)
}

export function setProjectRole(payload: { projectId: string, userId: string, role: ProjectRole }) {
  db.prepare(`
    UPDATE project_members
    SET role = ?
    WHERE project_id = ? AND user_id = ?
  `).run(payload.role, payload.projectId, payload.userId)
}
