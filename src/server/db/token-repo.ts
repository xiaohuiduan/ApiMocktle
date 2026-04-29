import { randomUUID } from 'node:crypto'

import { db } from './client'

export interface ProjectTokenRow {
  id: string
  project_id: string
  token: string
  name: string
  created_at: string
}

export function createProjectToken(projectId: string, name = 'default') {
  const id = randomUUID()
  const token = randomUUID().replace(/-/g, '')
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO project_tokens (id, project_id, token, name, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, projectId, token, name, now)

  return { id, token, name, created_at: now }
}

export function listProjectTokens(projectId: string) {
  return db.prepare(`
    SELECT id, project_id, token, name, created_at
    FROM project_tokens
    WHERE project_id = ?
    ORDER BY created_at DESC
  `).all(projectId) as ProjectTokenRow[]
}

export function deleteProjectToken(id: string) {
  db.prepare(`
    DELETE FROM project_tokens
    WHERE id = ?
  `).run(id)
}

export function findProjectByToken(token: string) {
  return db.prepare(`
    SELECT project_id
    FROM project_tokens
    WHERE token = ?
  `).get(token) as { project_id: string } | undefined
}
