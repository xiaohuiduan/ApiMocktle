import { redirect } from 'react-router'

import { resolveAuthRedirectTarget } from './auth-redirect'

import type { ProjectPermission } from '@/server/types'

export async function redirectIfAuthenticated(request: Request) {
  const { getSessionUserFromRequest } = await import('@/server/auth')
  const { user } = getSessionUserFromRequest(request)

  if (user) {
    const requestUrl = new URL(request.url)
    throw redirect(resolveAuthRedirectTarget(requestUrl.searchParams.get('redirect')))
  }
}

export async function requireAuthenticatedUser(request: Request) {
  const { getSessionUserFromRequest } = await import('@/server/auth')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    throw redirect('/login')
  }

  return user
}

export async function resolveProjectAccess(
  request: Request,
  projectId: string,
  required: ProjectPermission,
) {
  const user = await requireAuthenticatedUser(request)
  const { ensureProjectPermission } = await import('@/server/project-access')
  const access = ensureProjectPermission({
    projectId,
    userId: user.id,
    required,
  })

  if ('error' in access) {
    throw redirect('/projects')
  }

  return { access, user }
}
