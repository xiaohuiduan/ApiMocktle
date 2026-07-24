import type { TreeProps } from 'antd'

import type { MenuItemType } from '@/enums'
import type { ApiDetails, ApiDoc, ApiFolder, ApiSchema, RunTabInfo } from '@/types'

export interface ApiMenuBase {
  id: CatalogId
  parentId?: ApiMenuBase['id']
  name: string
  type: MenuItemType
  /** 运行时标记：该节点为未保存的新建草稿（仅内存/localStorage，未入库），供左侧树渲染红 `*`。 */
  __isDraft?: boolean
}

interface ApiMenuInterface extends ApiMenuBase {
  type: MenuItemType.ApiDetail
  data?: ApiDetails
  runTabInfo?: RunTabInfo
}

interface ApiMenuInterfaceFolder extends ApiMenuBase {
  type: MenuItemType.ApiDetailFolder
  data?: ApiFolder
}

interface ApiMenuDoc extends ApiMenuBase {
  type: MenuItemType.Doc
  data?: ApiDoc
}

interface ApiMenuSchema extends ApiMenuBase {
  type: MenuItemType.ApiSchema | MenuItemType.ApiSchemaFolder
  data?: ApiSchema
}

interface ApiMenuRequest extends ApiMenuBase {
  type: MenuItemType.HttpRequest | MenuItemType.RequestFolder
  data?: ApiDetails
  runTabInfo?: RunTabInfo
}

export type CatalogId = string

export type ApiMenuData =
  | ApiMenuInterface
  | ApiMenuSchema
  | ApiMenuDoc
  | ApiMenuRequest
  | ApiMenuInterfaceFolder

export type TreeDataNode = NonNullable<TreeProps['treeData']>[number]

export type CatalogDataNode = Omit<TreeDataNode, 'key'> & {
  key: string
  customData: {
    catalog: ApiMenuData
    leafCount?: number
  }
  children?: CatalogDataNode[]
}
