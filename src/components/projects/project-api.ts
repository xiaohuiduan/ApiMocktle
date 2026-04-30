export interface ProjectItem {
  id: string
  name: string
  role: 'owner' | 'editor' | 'viewer'
  ownerId: string
  createdAt: string
  icon?: string
}

interface ApiResponse<T> {
  ok: boolean
  data: T
  error: string | null
}

export class ApiRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function readPayload<T>(response: Response, payload: ApiResponse<T>, fallbackMessage: string) {
  if (!response.ok || !payload.ok) {
    throw new ApiRequestError(payload.error ?? fallbackMessage, response.status)
  }

  return payload.data
}

export async function requestProjects() {
  const response = await fetch('/api/v1/projects', {
    method: 'GET',
    credentials: 'include',
  })
  const payload = await response.json() as ApiResponse<{ projects: ProjectItem[] }>

  return readPayload(response, payload, '加载项目失败').projects
}

export async function requestCreateProject(values: { name: string, icon?: string }) {
  const response = await fetch('/api/v1/projects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  const payload = await response.json() as ApiResponse<{ project: ProjectItem }>

  return readPayload(response, payload, '创建项目失败').project
}

export async function requestUpdateProject(projectId: string, values: { name: string, icon?: string }) {
  const response = await fetch(`/api/v1/projects/${projectId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  const payload = await response.json() as ApiResponse<{ project: ProjectItem }>

  return readPayload(response, payload, '更新项目失败').project
}

export async function requestDeleteProject(projectId: string) {
  const response = await fetch(`/api/v1/projects/${projectId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  const payload = await response.json() as ApiResponse<{ projectId: string }>

  return readPayload(response, payload, '删除项目失败').projectId
}
