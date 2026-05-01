import { api } from '@/api-client'

export interface ProjectItem {
  id: string
  name: string
  role: 'owner' | 'editor' | 'viewer'
  ownerId: string
  createdAt: string
  icon?: string
}

export class ApiRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function requestProjects(sessionId: string) {
  const result = await api<{ projects: ProjectItem[] }>('list_projects', { sessionId })
  return result.projects
}

export async function requestCreateProject(sessionId: string, values: { name: string, icon?: string }) {
  const result = await api<{ project: ProjectItem }>('create_project', {
    sessionId,
    payload: values,
  })
  return result.project
}

export async function requestUpdateProject(sessionId: string, projectId: string, values: { name: string, icon?: string }) {
  const result = await api<{ project: ProjectItem }>('update_project', {
    sessionId,
    projectId,
    payload: values,
  })
  return result.project
}

export async function requestDeleteProject(sessionId: string, projectId: string) {
  const result = await api<{ projectId: string }>('delete_project', {
    sessionId,
    projectId,
  })
  return result.projectId
}
