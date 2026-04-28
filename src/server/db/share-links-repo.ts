import { randomUUID } from 'node:crypto'

import { db } from './client'

export interface ShareLinkRow {
  id: string
  project_id: string
  creator_user_id: string
  api_menu_ids: string // JSON array
  password_hash: string | null
  expires_at: string | null
  title: string
  created_at: string
}

export function listShareLinks(projectId: string) {
  return db.prepare(`
    SELECT id, project_id, creator_user_id, api_menu_ids, password_hash, expires_at, title, created_at
    FROM share_links
    WHERE project_id = ?
    ORDER BY created_at DESC
  `).all(projectId) as ShareLinkRow[]
}

export function getShareLink(shareId: string) {
  return db.prepare(`
    SELECT id, project_id, creator_user_id, api_menu_ids, password_hash, expires_at, title, created_at
    FROM share_links
    WHERE id = ?
  `).get(shareId) as ShareLinkRow | undefined
}

export function insertShareLink(payload: {
  projectId: string
  creatorUserId: string
  apiMenuIds: string[] // will be JSON.stringify'd
  passwordHash?: string
  expiresAt?: string
  title?: string
}) {
  const id = randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO share_links (id, project_id, creator_user_id, api_menu_ids, password_hash, expires_at, title, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    payload.projectId,
    payload.creatorUserId,
    JSON.stringify(payload.apiMenuIds),
    payload.passwordHash ?? null,
    payload.expiresAt ?? null,
    payload.title ?? '',
    now,
  )

  return id
}

export function deleteShareLink(payload: { projectId: string, shareId: string }) {
  const result = db.prepare(`
    DELETE FROM share_links
    WHERE project_id = ? AND id = ?
  `).run(payload.projectId, payload.shareId)

  return result.changes > 0
}

export function updateShareLink(payload: {
  projectId: string
  shareId: string
  apiMenuIds?: string[]
  passwordHash?: string | null
  expiresAt?: string | null
  title?: string
}) {
  const fields: string[] = []
  const values: (string | null)[] = []

  if (payload.apiMenuIds !== undefined) {
    fields.push('api_menu_ids = ?')
    values.push(JSON.stringify(payload.apiMenuIds))
  }
  if (payload.passwordHash !== undefined) {
    fields.push('password_hash = ?')
    values.push(payload.passwordHash)
  }
  if (payload.expiresAt !== undefined) {
    fields.push('expires_at = ?')
    values.push(payload.expiresAt)
  }
  if (payload.title !== undefined) {
    fields.push('title = ?')
    values.push(payload.title)
  }

  if (fields.length === 0) return false

  values.push(payload.projectId, payload.shareId)

  const result = db.prepare(`
    UPDATE share_links
    SET ${fields.join(', ')}
    WHERE project_id = ? AND id = ?
  `).run(...values)

  return result.changes > 0
}
