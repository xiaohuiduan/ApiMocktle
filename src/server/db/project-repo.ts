import { randomUUID } from 'node:crypto'

import { db } from './client'

import type { ProjectItem, ProjectRole } from '../types'

interface ProjectRow {
  id: string
  name: string
  owner_id: string
  created_at: string
  icon: string
}

interface MemberRow {
  project_id: string
  user_id: string
  role: ProjectRole
  username: string
  created_at: string
}

function toProjectItem(row: ProjectRow, role: ProjectRole): ProjectItem {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    role,
    icon: row.icon || undefined,
  }
}

export function createProject(payload: { name: string, ownerId: string, icon?: string }) {
  const id = randomUUID()
  const now = new Date().toISOString()
  const icon = payload.icon ?? ''
  const projectRow: ProjectRow = {
    id,
    name: payload.name,
    owner_id: payload.ownerId,
    created_at: now,
    icon,
  }

  db.exec('BEGIN')

  try {
    db.prepare(`
      INSERT INTO projects (id, name, owner_id, created_at, icon)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, payload.name, payload.ownerId, now, icon)

    db.prepare(`
      INSERT INTO project_members (project_id, user_id, role, created_at)
      VALUES (?, ?, 'owner', ?)
    `).run(id, payload.ownerId, now)

    db.exec('COMMIT')
  }
  catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return toProjectItem(projectRow, 'owner')
}

export function getProject(projectId: string) {
  return db.prepare(`
    SELECT id, name, owner_id, created_at, icon
    FROM projects
    WHERE id = ?
  `).get(projectId) as ProjectRow | undefined
}

export function getProjectsByUser(userId: string) {
  const rows = db.prepare(`
    SELECT p.id, p.name, p.owner_id, p.created_at, p.icon, m.role
    FROM projects p
    JOIN project_members m ON m.project_id = p.id
    WHERE m.user_id = ?
    ORDER BY p.created_at DESC
  `).all(userId) as Array<ProjectRow & { role: ProjectRole }>

  return rows.map((row) => toProjectItem(row, row.role))
}

export function updateProject(payload: { projectId: string, name: string, icon?: string }) {
  if (payload.icon !== undefined) {
    db.prepare(`
      UPDATE projects
      SET name = ?, icon = ?
      WHERE id = ?
    `).run(payload.name, payload.icon, payload.projectId)
  } else {
    db.prepare(`
      UPDATE projects
      SET name = ?
      WHERE id = ?
    `).run(payload.name, payload.projectId)
  }

  const project = getProject(payload.projectId)

  if (!project) {
    return undefined
  }

  return toProjectItem(project, 'owner')
}

export function deleteProject(projectId: string) {
  const result = db.prepare(`
    DELETE FROM projects
    WHERE id = ?
  `).run(projectId)

  return result.changes > 0
}

export function getProjectMember(payload: { projectId: string, userId: string }) {
  return db.prepare(`
    SELECT project_id, user_id, role, created_at
    FROM project_members
    WHERE project_id = ? AND user_id = ?
  `).get(payload.projectId, payload.userId) as {
    project_id: string
    user_id: string
    role: ProjectRole
    created_at: string
  } | undefined
}

export function getProjectMembers(projectId: string) {
  const rows = db.prepare(`
    SELECT m.project_id, m.user_id, m.role, m.created_at, u.username
    FROM project_members m
    JOIN users u ON u.id = m.user_id
    WHERE m.project_id = ?
    ORDER BY m.created_at ASC
  `).all(projectId) as MemberRow[]

  return rows.map((row) => ({
    projectId: row.project_id,
    userId: row.user_id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
  }))
}

export function addProjectMember(payload: { projectId: string, userId: string, role: ProjectRole }) {
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO project_members (project_id, user_id, role, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET role = excluded.role
  `).run(payload.projectId, payload.userId, payload.role, now)
}

export function updateProjectMemberRole(payload: {
  projectId: string
  userId: string
  role: ProjectRole
}) {
  db.prepare(`
    UPDATE project_members
    SET role = ?
    WHERE project_id = ? AND user_id = ?
  `).run(payload.role, payload.projectId, payload.userId)
}

export function deleteProjectMember(payload: { projectId: string, userId: string }) {
  db.prepare(`
    DELETE FROM project_members
    WHERE project_id = ? AND user_id = ?
  `).run(payload.projectId, payload.userId)
}

export function getUserByUsername(username: string) {
  return db.prepare(`
    SELECT id, username
    FROM users
    WHERE username = ?
  `).get(username) as { id: string, username: string } | undefined
}
