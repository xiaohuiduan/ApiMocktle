import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { createShareLink, getShareLinkList, removeShareLink, editShareLink } from '@/server/share-links'
import { requireRouteParam } from '@/router/route-param'

export async function loader({ params, request }: LoaderFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({ projectId, userId: user.id, required: 'viewer' })

  if ('error' in access) {
    return access.error
  }

  return ok({ shareLinks: getShareLinkList(projectId) })
}

export async function action({ params, request }: ActionFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({ projectId, userId: user.id, required: 'editor' })

  if ('error' in access) {
    return access.error
  }

  if (request.method === 'POST') {
    const payload = await request.json().catch(() => null) as {
      apiMenuIds?: string[]
      password?: string
      expiresAt?: string
      title?: string
    } | null

    if (!payload?.apiMenuIds || !Array.isArray(payload.apiMenuIds) || payload.apiMenuIds.length === 0) {
      return fail('请至少选择一个接口')
    }

    try {
      const shareLinks = createShareLink({
        projectId,
        creatorUserId: user.id,
        apiMenuIds: payload.apiMenuIds,
        password: payload.password,
        expiresAt: payload.expiresAt,
        title: payload.title,
      })
      return ok({ shareLinks })
    } catch (error) {
      return fail(error instanceof Error ? error.message : '创建分享链接失败')
    }
  }

  if (request.method === 'PATCH') {
    const payload = await request.json().catch(() => null) as {
      shareId?: string
      apiMenuIds?: string[]
      password?: string | null
      expiresAt?: string | null
      title?: string
    } | null

    if (!payload?.shareId) {
      return fail('缺少 shareId')
    }

    try {
      const shareLinks = editShareLink({
        projectId,
        shareId: payload.shareId,
        apiMenuIds: payload.apiMenuIds,
        password: payload.password,
        expiresAt: payload.expiresAt,
        title: payload.title,
      })
      return ok({ shareLinks })
    } catch (error) {
      return fail(error instanceof Error ? error.message : '更新分享链接失败')
    }
  }

  if (request.method === 'DELETE') {
    const payload = await request.json().catch(() => null) as {
      shareId?: string
    } | null

    if (!payload?.shareId) {
      return fail('缺少 shareId')
    }

    try {
      const shareLinks = removeShareLink(projectId, payload.shareId)
      return ok({ shareLinks })
    } catch (error) {
      return fail(error instanceof Error ? error.message : '删除分享链接失败')
    }
  }

  return new Response(null, { headers: { Allow: 'POST, PATCH, DELETE' }, status: 405 })
}
