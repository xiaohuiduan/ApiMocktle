import { nanoid } from 'nanoid'

import type { ApiMenuData } from '@/components/ApiMenu/ApiMenu.type'
import { PageTabStatus } from '@/components/ApiTab/ApiTab.enum'
import type { ApiTabItem } from '@/components/ApiTab/ApiTab.type'
import { API_MENU_CONFIG } from '@/configs/static'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useMenuTabHelpers } from '@/contexts/menu-tab-settings'
import { initialCreateApiDetailsData } from '@/data/remote'
import { BodyType, CatalogType, MenuItemType } from '@/enums'
import type { ApiDetails } from '@/types'

/** 构造一条空的快捷请求详情，作为新建草稿的初始数据。 */
function createEmptyRequestDetails(name: string, id: string): ApiDetails {
  return {
    id,
    method: 'GET' as ApiDetails['method'],
    path: '',
    name,
    status: 'developing' as ApiDetails['status'],
    serverUrl: '',
    parameters: {
      query: [],
      header: [],
      path: [],
      cookie: [],
    },
    requestBody: { type: BodyType.None },
    responses: [],
  }
}

export function useHelpers() {
  const { addTabItem } = useMenuTabHelpers()
  const { saveDraft } = useMenuHelpersContext()

  const createApiDetails = (
    payload?: Partial<ApiTabItem>,
    config?: { autoActive?: boolean, replaceTab?: ApiTabItem['key'] },
    parentId?: string,
  ) => {
    const { newLabel } = API_MENU_CONFIG[CatalogType.Http]
    // 用同一个 id 作为 tab key / 草稿 id / 将来入库的 DB id，保证全程一致。
    const id = nanoid(6)

    // 新建即写入草稿，使其立即出现在左侧树（带红 *），并在切换项目后可恢复。
    const draftItem = {
      id,
      name: newLabel,
      type: MenuItemType.ApiDetail,
      ...(parentId ? { parentId } : {}),
      data: { ...initialCreateApiDetailsData, id, name: newLabel },
    } as ApiMenuData
    saveDraft(draftItem, true)

    addTabItem(
      {
        ...payload,
        key: id,
        label: newLabel,
        contentType: MenuItemType.ApiDetail,
        data: { tabStatus: PageTabStatus.Create, ...(parentId ? { parentId } : {}) },
      },
      { autoActive: true, ...config },
    )
  }

  const createApiRequest = (
    payload?: Partial<ApiTabItem>,
    config?: { autoActive?: boolean, replaceTab?: ApiTabItem['key'] },
    parentId?: string,
  ) => {
    const { newLabel } = API_MENU_CONFIG[CatalogType.Request]
    // 用同一个 id 作为 tab key / 草稿 id / 将来入库的 DB id，保证全程一致。
    const id = nanoid(6)

    // 新建即写入草稿，使其立即出现在左侧树（带红 *），并在切换项目后可恢复。
    const draftItem = {
      id,
      name: newLabel,
      type: MenuItemType.HttpRequest,
      ...(parentId ? { parentId } : {}),
      data: createEmptyRequestDetails(newLabel, id),
    } as ApiMenuData
    saveDraft(draftItem, true)

    addTabItem(
      {
        ...payload,
        key: id,
        label: newLabel,
        contentType: MenuItemType.HttpRequest,
        data: { tabStatus: PageTabStatus.Create, ...(parentId ? { parentId } : {}) },
      },
      { autoActive: true, ...config },
    )
  }

  const createDoc = (
    payload?: Partial<ApiTabItem>,
    config?: { autoActive?: boolean, replaceTab?: ApiTabItem['key'] },
    parentId?: string,
  ) => {
    addTabItem(
      {
        ...payload,
        key: nanoid(6),
        label: '新建 Markdown',
        contentType: MenuItemType.Doc,
        data: { tabStatus: PageTabStatus.Create, ...(parentId ? { parentId } : {}) },
      },
      config,
    )
  }

  const createApiSchema = (
    payload?: Partial<ApiTabItem>,
    config?: { autoActive?: boolean, replaceTab?: ApiTabItem['key'] },
    parentId?: string,
  ) => {
    const { newLabel } = API_MENU_CONFIG[CatalogType.Schema]

    addTabItem(
      {
        ...payload,
        key: nanoid(6),
        label: newLabel,
        contentType: MenuItemType.ApiSchema,
        data: { tabStatus: PageTabStatus.Create, ...(parentId ? { parentId } : {}) },
      },
      config,
    )
  }

  return {
    createApiDetails,
    createApiRequest,
    createDoc,
    createApiSchema,

    createTabItem: (t: MenuItemType, parentId?: string) => {
      switch (t) {
        case MenuItemType.ApiDetail:
          createApiDetails(undefined, undefined, parentId)
          break

        case MenuItemType.HttpRequest:
          createApiRequest(undefined, undefined, parentId)
          break

        case MenuItemType.Doc:
          createDoc(undefined, undefined, parentId)
          break

        case MenuItemType.ApiSchema:
          createApiSchema(undefined, undefined, parentId)
          break
      }
    },
  }
}
