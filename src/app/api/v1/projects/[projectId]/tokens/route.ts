import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import {
  createProjectToken,
  deleteProjectToken,
  listProjectTokens,
} from '@/server/db/token-repo'
import { ensureProjectPermission } from '@/server/project-access'
import { requireRouteParam } from '@/router/route-param'

function checkAuth(request: Request, projectId: string) {
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({
    projectId,
    userId: user.id,
    required: 'editor',
  })

  if ('error' in access) {
    return access.error
  }

  return null
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  const authError = checkAuth(request, projectId)

  if (authError) {
    return authError
  }

  const tokens = listProjectTokens(projectId)

  return ok(tokens)
}

export async function action({ params, request }: ActionFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  const authError = checkAuth(request, projectId)

  if (authError) {
    return authError
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => null) as { name?: string } | null
    const name = body?.name?.trim() || 'default'
    const token = createProjectToken(projectId, name)

    return ok(token)
  }

  if (request.method === 'DELETE') {
    const body = await request.json().catch(() => null) as { id?: string } | null

    if (!body?.id) {
      return fail('缺少 id')
    }

    deleteProjectToken(body.id)

    return ok({ deleted: true })
  }

  return new Response(null, { headers: { Allow: 'GET, POST, DELETE' }, status: 405 })
}
