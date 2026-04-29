import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { accessShareLink, getShareLinkApiData, getShareMeta } from '@/server/share-links'
import { requireRouteParam } from '@/router/route-param'

/**
 * 公开访问分享链接 - GET 获取基本信息（是否需要密码、是否过期等）
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const shareId = requireRouteParam(params.shareId, 'shareId')

  const meta = getShareMeta(shareId)

  if (!meta) {
    return fail('分享链接不存在', 404)
  }

  if (meta.expired) {
    return fail('分享链接已过期', 410)
  }

  return ok({
    id: meta.id,
    title: meta.title,
    expiresAt: meta.expiresAt,
    needsPassword: meta.needsPassword,
  })
}

/**
 * 公开访问分享链接 - POST 验证密码/access_key 并获取 API 数据
 */
export async function action({ params, request }: ActionFunctionArgs) {
  const shareId = requireRouteParam(params.shareId, 'shareId')

  const payload = await request.json().catch(() => null) as {
    password?: string
    key?: string
  } | null

  const result = accessShareLink(shareId, payload?.password, payload?.key)

  if (!result.valid) {
    if (result.error === '分享链接已过期') {
      return fail(result.error, 410)
    }
    if (result.error === '密码错误' || result.error === '需要密码') {
      return fail(result.error, 401)
    }
    return fail(result.error ?? '访问失败', 400)
  }

  const apiData = getShareLinkApiData(shareId)

  if (!apiData) {
    return fail('分享数据不存在', 404)
  }

  return ok({ ...apiData })
}
