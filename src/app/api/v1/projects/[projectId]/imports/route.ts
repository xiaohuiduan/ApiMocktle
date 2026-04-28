import { type ActionFunctionArgs } from 'react-router'

import { requireRouteParam } from '@/router/route-param'
import { importApiDocumentToMenuItems } from '@/server/api-document-import'
import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { fetchImportDocumentFromUrl } from '@/server/import-from-url'
import { ensureProjectPermission } from '@/server/project-access'
import { mergeProjectStateWithMenuItems } from '@/server/project-import'

function mergeImportedDocument(
  routeTag: string,
  projectId: string,
  userId: string,
  content: string,
  filename: string,
  startedAt: number,
  parseStartedAt: number,
) {
  try {
    const { menuItems, mergeMode } = importApiDocumentToMenuItems(content, filename)
    const afterParse = Date.now()
    const parseMs = afterParse - parseStartedAt
    console.warn(
      `${routeTag} step=import_document projectId=${projectId} userId=${userId} `
      + `elapsedMs=${parseMs} menuItems=${menuItems.length} mergeMode=${mergeMode}`,
    )
    const { state: nextState, created, updated } = mergeProjectStateWithMenuItems(projectId, menuItems, { mergeMode })
    const mergeMs = Date.now() - afterParse
    console.warn(
      `${routeTag} step=merge_project_state projectId=${projectId} userId=${userId} elapsedMs=${mergeMs} `
      + `created=${created} updated=${updated}`,
    )
    console.warn(`${routeTag} step=done projectId=${projectId} userId=${userId} totalMs=${Date.now() - startedAt}`)

    return ok({ state: nextState, created, updated })
  }
  catch (error) {
    console.error(`${routeTag} step=failed projectId=${projectId} userId=${userId} totalMs=${Date.now() - startedAt}`, error)

    return fail(error instanceof Error ? error.message : '导入失败')
  }
}

async function importProjectDocumentFromUrl(request: Request, projectId: string) {
  const routeTag = '[api][projects/imports][url]'
  const startedAt = Date.now()
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({ projectId, userId: user.id, required: 'editor' })

  if ('error' in access) {
    return access.error
  }

  let body: unknown

  try {
    body = await request.json()
  }
  catch {
    return fail('请求体不是有效的 JSON')
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('请求体格式错误')
  }

  const urlField = (body as { url?: unknown }).url

  if (typeof urlField !== 'string') {
    return fail('请在 JSON 中提供 url 字段（字符串）')
  }

  try {
    const fetchStarted = Date.now()
    const { content, filename } = await fetchImportDocumentFromUrl(urlField)
    const fetchMs = Date.now() - fetchStarted
    console.warn(
      `${routeTag} step=fetch_url projectId=${projectId} userId=${user.id} elapsedMs=${fetchMs} size=${content.length}`,
    )

    const parseStarted = Date.now()

    return mergeImportedDocument(
      routeTag,
      projectId,
      user.id,
      content,
      filename,
      startedAt,
      parseStarted,
    )
  }
  catch (error) {
    const totalMs = Date.now() - startedAt
    console.error(`${routeTag} step=fetch_failed projectId=${projectId} userId=${user.id} totalMs=${totalMs}`, error)

    return fail(error instanceof Error ? error.message : '拉取或导入失败')
  }
}

async function importProjectDocument(request: Request, projectId: string) {
  const routeTag = '[api][projects/imports]'
  const startedAt = Date.now()
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({ projectId, userId: user.id, required: 'editor' })

  if ('error' in access) {
    return access.error
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const afterForm = Date.now()

  if (!(file instanceof File)) {
    console.warn(`${routeTag} step=invalid_file projectId=${projectId} userId=${user.id} totalMs=${Date.now() - startedAt}`)

    return fail('请上传接口文档文件')
  }

  const filename = file.name.toLowerCase()

  if (!filename.endsWith('.json') && !filename.endsWith('.yaml') && !filename.endsWith('.yml')) {
    console.warn(`${routeTag} step=invalid_extension projectId=${projectId} userId=${user.id} totalMs=${Date.now() - startedAt}`)

    return fail('仅支持 .json/.yaml/.yml 文件')
  }

  const content = await file.text()
  const readMs = Date.now() - afterForm
  console.warn(
    `${routeTag} step=read_file_text projectId=${projectId} userId=${user.id} elapsedMs=${readMs} size=${content.length}`,
  )

  if (!content.trim()) {
    console.warn(`${routeTag} step=empty_content projectId=${projectId} userId=${user.id} totalMs=${Date.now() - startedAt}`)

    return fail('文件内容为空')
  }

  const parseStarted = Date.now()

  return mergeImportedDocument(
    routeTag,
    projectId,
    user.id,
    content,
    filename,
    startedAt,
    parseStarted,
  )
}

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { headers: { Allow: 'POST' }, status: 405 })
  }

  const projectId = requireRouteParam(params.projectId, 'projectId')
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return await importProjectDocumentFromUrl(request, projectId)
  }

  return await importProjectDocument(request, projectId)
}
