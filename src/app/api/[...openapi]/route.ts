import { randomUUID } from 'node:crypto'

import { MenuItemType } from '@/enums'
import { deleteMenuItems, getMenuItem, getMaxSortOrder, insertMenuItem, listMenuItems, updateMenuItem } from '@/server/db/menu-repo'
import { getProject } from '@/server/db/project-repo'
import { findProjectByToken } from '@/server/db/token-repo'
import { type YApiInterface, apiDetailsToYApi, yapiToApiDetails } from '@/server/yapi-adapter'

import type { ApiDetails } from '@/types'

function yapiError(errmsg: string, errcode = 1) {
  return Response.json({ errcode, errmsg })
}

function yapiOk(data: unknown) {
  return Response.json({ errcode: 0, errmsg: '成功', data })
}

function parseJsonValue<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T }
  catch { return fallback }
}

function extractToken(request: Request, url: URL): string | null {
  const headerToken = request.headers.get('X-YAPI-TOKEN')
  if (headerToken) return headerToken
  const queryToken = url.searchParams.get('token')
  if (queryToken) return queryToken
  return null
}

async function extractBodyToken(request: Request): Promise<string | null> {
  try {
    const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null
    if (body?.token && typeof body.token === 'string') return body.token
  }
  catch { /* ignore */ }
  return null
}

async function resolveProjectId(request: Request, url: URL): Promise<string | null> {
  let token = extractToken(request, url)
  if (!token) token = await extractBodyToken(request)
  if (!token) return null
  const row = findProjectByToken(token)
  return row?.project_id ?? null
}

function toYApiCat(row: { id: string, name: string }) {
  return { _id: row.id, name: row.name, desc: '', index: 0 }
}

function ensureDefaultFolder(projectId: string): string {
  const items = listMenuItems(projectId)
  const existing = items.find((item) => item.type === MenuItemType.ApiDetailFolder)
  if (existing) return existing.id
  const folderId = randomUUID()
  insertMenuItem({ projectId, id: folderId, parentId: undefined, name: '默认分类', type: MenuItemType.ApiDetailFolder, dataJson: undefined, sortOrder: 0 })
  return folderId
}

interface SaveBody {
  token?: string
  id?: string
  catid?: string | number
  title: string
  path: string
  method: string
  desc?: string
  markdown?: string
  status?: string
  tag?: string[]
  tags?: string[]
  req_headers?: YApiInterface['req_headers']
  req_query?: YApiInterface['req_query']
  req_params?: YApiInterface['req_params']
  req_body_type?: string
  req_body_form?: YApiInterface['req_body_form']
  req_body_other?: string
  req_body_is_json_schema?: boolean
  res_body_type?: string
  res_body?: string
  res_body_is_json_schema?: boolean
}

function findExistingInterface(projectId: string, path: string, method: string) {
  const items = listMenuItems(projectId)
  const upperMethod = method.toUpperCase()
  for (const item of items) {
    if (item.type !== MenuItemType.ApiDetail) continue
    const data = parseJsonValue<ApiDetails>(item.data_json, undefined as unknown as ApiDetails)
    if (!data) continue
    if (data.path === path && data.method?.toUpperCase() === upperMethod) return item
  }
  return null
}

function buildYapiFromSaveBody(body: SaveBody): YApiInterface {
  return {
    title: body.title,
    path: body.path,
    method: body.method,
    desc: body.desc,
    markdown: body.markdown,
    status: body.status,
    tag: body.tag,
    tags: body.tags,
    req_headers: body.req_headers,
    req_query: body.req_query,
    req_params: body.req_params,
    req_body_type: body.req_body_type,
    req_body_form: body.req_body_form,
    req_body_other: body.req_body_other,
    req_body_is_json_schema: body.req_body_is_json_schema,
    res_body_type: body.res_body_type,
    res_body: body.res_body,
    res_body_is_json_schema: body.res_body_is_json_schema,
  }
}

function upsertMenuItemData(projectId: string, existing: { id: string, parent_id: string | null, data_json: string | null }, folderId: string, name: string, apiDetails: ApiDetails) {
  const currentData = parseJsonValue<Record<string, unknown>>(existing.data_json, {})
  const nextData = { ...currentData, ...apiDetails, id: (currentData as Record<string, unknown>)?.id ?? apiDetails.id }
  const oldParentId = existing.parent_id
  updateMenuItem({ projectId, id: existing.id, parentId: folderId, name, type: MenuItemType.ApiDetail, dataJson: JSON.stringify(nextData) })

  // Clean up empty source folder if the API moved to a different category
  if (oldParentId && oldParentId !== folderId) {
    const allItems = listMenuItems(projectId)
    const hasChildren = allItems.some((item) => item.parent_id === oldParentId)
    if (!hasChildren) {
      deleteMenuItems({ projectId, ids: [oldParentId] })
    }
  }

  return yapiOk({ _id: existing.id })
}

// ── GET handlers ──

async function handleProjectGet(request: Request, url: URL) {
  const projectId = await resolveProjectId(request, url)
  if (!projectId) return yapiError('token 无效')
  const project = getProject(projectId)
  if (!project) return yapiError('项目不存在')
  return yapiOk({ _id: project.id, name: project.name, desc: '', basepath: '/' })
}

async function handleCatGetMenu(request: Request, url: URL) {
  const projectId = await resolveProjectId(request, url)
  if (!projectId) return yapiError('token 无效')
  const items = listMenuItems(projectId)
  const cats = items.filter((item) => item.type === MenuItemType.ApiDetailFolder).map(toYApiCat)
  if (cats.length === 0) {
    const folderId = ensureDefaultFolder(projectId)
    cats.push({ _id: folderId, name: '默认分类', desc: '', index: 0 })
  }
  return yapiOk(cats)
}

async function handleInterfaceGet(request: Request, url: URL) {
  const projectId = await resolveProjectId(request, url)
  if (!projectId) return yapiError('token 无效')
  const id = url.searchParams.get('id')
  if (!id) return yapiError('缺少参数: id')
  const item = getMenuItem({ projectId, menuId: id })
  if (!item || item.type !== MenuItemType.ApiDetail) return yapiError('接口不存在')
  const data = parseJsonValue<ApiDetails>(item.data_json, undefined as unknown as ApiDetails)
  if (!data) return yapiError('接口数据异常')
  const yapiData = apiDetailsToYApi(data, item.id)
  return yapiOk({ ...yapiData, _id: item.id, catid: item.parent_id, title: item.name })
}

async function handleInterfaceListCat(request: Request, url: URL) {
  const projectId = await resolveProjectId(request, url)
  if (!projectId) return yapiError('token 无效')
  const catid = url.searchParams.get('catid')
  if (!catid) return yapiError('缺少参数: catid')
  const items = listMenuItems(projectId)
  const filtered = items
    .filter((item) => item.parent_id === catid && item.type === MenuItemType.ApiDetail)
    .map((item) => {
      const data = parseJsonValue<ApiDetails>(item.data_json, undefined as unknown as ApiDetails)
      return { _id: item.id, title: item.name, path: data?.path ?? '', method: data?.method ?? 'GET', status: data?.status === 'released' ? 'done' : 'undone', catid: item.parent_id }
    })
  const page = parseInt(url.searchParams.get('page') ?? '1', 10)
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10)
  const start = (page - 1) * limit
  const paged = filtered.slice(start, start + limit)
  return yapiOk({ total: filtered.length, list: paged })
}

async function handleInterfaceListMenu(request: Request, url: URL) {
  const projectId = await resolveProjectId(request, url)
  if (!projectId) return yapiError('token 无效')
  const items = listMenuItems(projectId)
  const list = items
    .filter((item) => item.type === MenuItemType.ApiDetail)
    .map((item) => {
      const data = parseJsonValue<ApiDetails>(item.data_json, undefined as unknown as ApiDetails)
      return { _id: item.id, title: item.name, path: data?.path ?? '', method: data?.method ?? 'GET', status: data?.status === 'released' ? 'done' : 'undone', catid: item.parent_id }
    })
  return yapiOk(list)
}

// ── POST handlers ──

async function handleAddCat(request: Request, url: URL) {
  const projectId = await resolveProjectId(request, url)
  if (!projectId) return yapiError('token 无效')
  const body = await request.json().catch(() => null) as { name?: string, desc?: string } | null
  if (!body?.name) return yapiError('缺少必要参数: name')
  const folderId = randomUUID()
  insertMenuItem({ projectId, id: folderId, parentId: undefined, name: body.name, type: MenuItemType.ApiDetailFolder, dataJson: undefined, sortOrder: getMaxSortOrder(projectId) + 1 })
  return yapiOk({ _id: folderId, name: body.name, desc: body.desc ?? '', index: 0 })
}

async function handleInterfaceSave(request: Request, url: URL) {
  const projectId = await resolveProjectId(request, url)
  if (!projectId) return yapiError('token 无效')
  const body = await request.json().catch(() => null) as SaveBody | null
  if (!body?.title || !body.path || !body.method) return yapiError('缺少必要参数: title, path, method')
  const catid = body.catid != null ? String(body.catid) : ensureDefaultFolder(projectId)
  const yapiData = buildYapiFromSaveBody(body)
  const apiDetails = yapiToApiDetails(yapiData)

  // If id is provided, update the existing item directly
  if (body.id) {
    const existing = getMenuItem({ projectId, menuId: body.id })
    if (existing) return upsertMenuItemData(projectId, existing, catid, body.title, apiDetails)
  }

  // Otherwise, try to find by path+method project-wide
  const existing = findExistingInterface(projectId, body.path, body.method)
  if (existing) return upsertMenuItemData(projectId, existing, catid, body.title, apiDetails)

  const menuItemId = randomUUID()
  insertMenuItem({ projectId, id: menuItemId, parentId: catid, name: body.title, type: MenuItemType.ApiDetail, dataJson: JSON.stringify(apiDetails), sortOrder: getMaxSortOrder(projectId) + 1 })
  return yapiOk({ _id: menuItemId })
}

async function handleInterfaceUp(request: Request, url: URL) {
  const projectId = await resolveProjectId(request, url)
  if (!projectId) return yapiError('token 无效')
  const body = await request.json().catch(() => null) as SaveBody | null
  if (!body?.id) return yapiError('缺少必要参数: id')
  const existing = getMenuItem({ projectId, menuId: body.id })
  if (!existing) return yapiError('接口不存在')
  const yapiData = buildYapiFromSaveBody(body)
  const apiDetails = yapiToApiDetails(yapiData)
  return upsertMenuItemData(projectId, existing, existing.parent_id ?? '', body.title ?? existing.name, apiDetails)
}

// ── Router ──

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/?/, '')
  if (path.startsWith('v1/')) return new Response('Not Found', { status: 404 })

  try {
    if (path === 'project/get') return await handleProjectGet(request, url)
    if (path === 'interface/getCatMenu') return await handleCatGetMenu(request, url)
    if (path === 'cat/getCatMenu') return await handleCatGetMenu(request, url)
    if (path === 'interface/get') return await handleInterfaceGet(request, url)
    if (path === 'interface/list_cat') return await handleInterfaceListCat(request, url)
    if (path === 'interface/list_menu') return await handleInterfaceListMenu(request, url)
    return yapiError(`未知的 GET 接口: ${path}`)
  }
  catch (error) { return yapiError((error as Error).message) }
}

export async function action({ request }: { request: Request }) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/?/, '')
  if (path.startsWith('v1/')) return new Response('Not Found', { status: 404 })

  try {
    if (path === 'interface/save') return await handleInterfaceSave(request, url)
    if (path === 'interface/up') return await handleInterfaceUp(request, url)
    if (path === 'interface/add_cat') return await handleAddCat(request, url)
    return yapiError(`未知的 POST 接口: ${path}`)
  }
  catch (error) { return yapiError((error as Error).message) }
}
