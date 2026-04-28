import { type LoaderFunctionArgs } from 'react-router'

import { fail } from '@/server/api-response'
import { requireRouteParam } from '@/router/route-param'
import { getSessionUserFromRequest } from '@/server/auth'
import { exportMenuItemsToOpenApi, exportMenuItemsToSwagger } from '@/server/openapi'
import { ensureProjectPermission } from '@/server/project-access'
import { getProjectState } from '@/server/project-state'

export async function loader({ params, request }: LoaderFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
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

  const requestUrl = new URL(request.url)
  const docFormat = requestUrl.searchParams.get('format')

  // swagger: Swagger 2.0; 其他: OpenAPI 3.0
  const isSwagger = docFormat === 'swagger' || docFormat === 'swagger2'
  const textFormat = requestUrl.searchParams.get('textFormat') === 'yaml' ? 'yaml' : 'json'

  // 选择性导出：menuIds 以逗号分隔
  const menuIdsRaw = requestUrl.searchParams.get('menuIds')
  const menuIds = menuIdsRaw ? menuIdsRaw.split(',').filter(Boolean) : undefined

  const state = getProjectState(projectId)
  const text = isSwagger
    ? exportMenuItemsToSwagger(state.menuRawList, textFormat, menuIds)
    : exportMenuItemsToOpenApi(state.menuRawList, textFormat, menuIds)

  const specName = isSwagger ? 'swagger' : 'openapi'
  const filename = `${specName}.${textFormat === 'yaml' ? 'yaml' : 'json'}`

  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': textFormat === 'yaml' ? 'application/yaml; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
