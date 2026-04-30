import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { requireRouteParam } from '@/router/route-param'
import { getSessionUserFromRequest } from '@/server/auth'
import { deleteProject, getProjectMembers, updateProject } from '@/server/db/project-repo'
import { ensureProjectCreator, ensureProjectPermission } from '@/server/project-access'

const INCLUDE_MEMBERS_QUERY_KEY = 'includeMembers'

export async function loader({ params, request }: LoaderFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({
    projectId,
    userId: user.id,
    required: 'viewer',
  })

  if ('error' in access) {
    return access.error
  }

  const requestUrl = new URL(request.url)
  const includeMembers = requestUrl.searchParams.get(INCLUDE_MEMBERS_QUERY_KEY) === 'true'

  const data: {
    currentUserId: string
    project: typeof access.project
    role: typeof access.role
    members?: ReturnType<typeof getProjectMembers>
  } = {
    currentUserId: user.id,
    project: access.project,
    role: access.role,
  }

  if (includeMembers) {
    data.members = getProjectMembers(projectId)
  }

  return ok(data)
}

async function patchProject(request: Request, projectId: string) {
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectCreator({
    projectId,
    userId: user.id,
  })

  if ('error' in access) {
    return access.error
  }

  const body = await request.json().catch(() => null) as { name?: string, icon?: string } | null
  const name = body?.name?.trim()

  if (!name) {
    return fail('项目名称不能为空')
  }

  const project = updateProject({ projectId, name, icon: body?.icon })

  if (!project) {
    return fail('项目不存在', 404)
  }

  return ok({ project })
}

async function removeProject(request: Request, projectId: string) {
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectCreator({
    projectId,
    userId: user.id,
  })

  if ('error' in access) {
    return access.error
  }

  deleteProject(projectId)

  return ok({ projectId })
}

export async function action({ params, request }: ActionFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')

  if (request.method === 'PATCH') {
    return patchProject(request, projectId)
  }

  if (request.method === 'DELETE') {
    return removeProject(request, projectId)
  }

  return new Response(null, {
    headers: { Allow: 'GET, PATCH, DELETE' },
    status: 405,
  })
}
