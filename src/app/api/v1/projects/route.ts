import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { createProject, getProjectsByUser } from '@/server/db/project-repo'

export async function loader({ request }: LoaderFunctionArgs) {
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const projects = getProjectsByUser(user.id)

  return ok({ projects })
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { headers: { Allow: 'GET, POST' }, status: 405 })
  }

  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const body = await request.json().catch(() => null) as { name?: string, icon?: string } | null
  const name = body?.name?.trim()

  if (!name) {
    return fail('项目名称不能为空')
  }

  const project = createProject({ name, ownerId: user.id, icon: body?.icon })

  return ok({ project }, { status: 201 })
}
