import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { accessShareLink, getShareLinkApiData } from '@/server/share-links'
import { requireRouteParam } from '@/router/route-param'

/**
 * 公开访问分享链接 - GET 获取基本信息（是否需要密码、是否过期等）
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const shareId = requireRouteParam(params.shareId, 'shareId')

  const result = accessShareLink(shareId)

  if (!result.valid) {
    // 区分过期(410)和不存在(404)
    if (result.error === '分享链接已过期') {
      return fail(result.error, 410)
    }
    return fail(result.error ?? '分享链接不存在', 404)
  }

  // 返回基本信息，不返回具体 API 数据（需要密码时先验证密码）
  if (result.shareData) {
    const needsPassword = !!result.shareData // 密码验证在 POST 里做
    return ok({
      id: result.shareData.id,
      title: result.shareData.title,
      expiresAt: result.shareData.expiresAt,
      needsPassword: !!(await getShareLinkNeedsPassword(shareId)),
    })
  }

  return fail('分享链接不存在', 404)
}

/**
 * 公开访问分享链接 - POST 验证密码并获取 API 数据
 */
export async function action({ params, request }: ActionFunctionArgs) {
  const shareId = requireRouteParam(params.shareId, 'shareId')

  const payload = await request.json().catch(() => null) as {
    password?: string
  } | null

  const result = accessShareLink(shareId, payload?.password)

  if (!result.valid) {
    if (result.error === '分享链接已过期') {
      return fail(result.error, 410)
    }
    if (result.error === '密码错误') {
      return fail(result.error, 401)
    }
    return fail(result.error ?? '访问失败', 400)
  }

  // 获取分享的 API 数据
  const apiData = getShareLinkApiData(shareId)

  if (!apiData) {
    return fail('分享数据不存在', 404)
  }

  return ok({ ...apiData })
}

// Helper: check if share link needs a password
async function getShareLinkNeedsPassword(shareId: string): Promise<boolean> {
  const { getShareLink } = await import('@/server/db/share-links-repo')
  const row = getShareLink(shareId)
  return !!row?.password_hash
}
