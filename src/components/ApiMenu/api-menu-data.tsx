import { useMemo } from 'react'

import type { TreeProps } from 'antd'
import arrayToTree from 'array-to-tree'
import { FolderClosedIcon, FolderOpenIcon, GripVerticalIcon } from 'lucide-react'

import { FileIcon } from '@/components/icons/FileIcon'
import { FolderIcon } from '@/components/icons/FolderIcon'
import { HttpMethodText } from '@/components/icons/HttpMethodText'
import { API_MENU_CONFIG } from '@/configs/static'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { CatalogType, MenuItemType } from '@/enums'
import { filterMenuItemsBySearch, getCatalogType, hasAccentColor, isMenuFolder } from '@/helpers'
import { useStyles } from '@/hooks/useStyle'

import type { CatalogDataNode, TreeDataNode } from './ApiMenu.type'
import { ApiMenuTitle } from './ApiMenuTitle'
import { ApiMenuTitleTop } from './ApiMenuTitleTop'
import { FileAction } from './FileAction'
import { FolderAction } from './FolderAction'

import { css } from '@emotion/css'

type GroupedMenu = Record<CatalogType, CatalogDataNode[]>

const attachLeafCount = (node: CatalogDataNode): number => {
  if (node.isLeaf) {
    node.customData.leafCount = 0

    return 1
  }

  const leafCount = node.children?.reduce((sum, child) => {
    return sum + attachLeafCount(child as CatalogDataNode)
  }, 0) ?? 0

  node.customData.leafCount = leafCount

  return leafCount
}

/**
 * 将菜单目录按照类型进行归类和组装。
 */
const groupMenuByType = (menuData: CatalogDataNode[]) => {
  return menuData.reduce<GroupedMenu>(
    (res, catalogDataNode) => {
      const catalog = catalogDataNode.customData.catalog

      switch (catalog.type) {
        case MenuItemType.ApiDetail:
          // fall through

        case MenuItemType.ApiDetailFolder:
          // fall through

        case MenuItemType.Doc:
          res[CatalogType.Http].push(catalogDataNode)
          break

        case MenuItemType.ApiSchema:
          // fall through

        case MenuItemType.ApiSchemaFolder:
          res[CatalogType.Schema].push(catalogDataNode)
          break

        case MenuItemType.HttpRequest:
          // fall through

        case MenuItemType.RequestFolder:
          res[CatalogType.Request].push(catalogDataNode)
          break
      }

      return res
    },
    {
      [CatalogType.Overview]: [],
      [CatalogType.Http]: [],
      [CatalogType.Schema]: [],
      [CatalogType.Request]: [],
      [CatalogType.Recycle]: [],
      [CatalogType.Markdown]: [],
    },
  )
}

const topMenus: CatalogType[] = [
  CatalogType.Overview,
  CatalogType.Http,
  CatalogType.Schema,
  CatalogType.Request,
  CatalogType.Recycle,
]

export interface MenuState {
  groupedMenus?: GroupedMenu
  menuTree: TreeProps['treeData']
}

export function useMenuData(): MenuState {
  const { menuRawList, menuSearchWord, apiDetailDisplay } = useMenuHelpersContext()

  /**
   * 简单的菜单数据，可以被序列化存储。
   * 此处将从服务端获取到的菜单数据，按照符合菜单树组件的结构组装。
   */
  const menus: CatalogDataNode[] | undefined = useMemo(() => {
    const menuList = (menuSearchWord
      ? menuRawList && filterMenuItemsBySearch(menuRawList, menuSearchWord)
      : menuRawList) ?? []

    return menuList.map<CatalogDataNode>((item) => {
      const isLeaf = !isMenuFolder(item.type)

      return {
        key: item.id,
        title: item.name,
        isLeaf,
        customData: { catalog: item },
      }
    })
  }, [menuRawList, menuSearchWord])

  /**
   * 包含交互组件（即 React 组件）的菜单数据，需要传入到菜单树组件中使用。
   * 注意：render prop 字段需要使用函数形式，否则会导致 deepClone 失败。
   */
  const menusWithRender: CatalogDataNode[] | undefined = useMemo(
    () =>
      menus?.map<CatalogDataNode>((item) => {
        const catalog = item.customData.catalog
        const isHttp
          = catalog.type === MenuItemType.ApiDetail || catalog.type === MenuItemType.HttpRequest
        const isDraft = catalog.__isDraft === true

        // 类型图标(GET/POST 徽标、文件图标、目录图标):
        // 可拖节点时移入 title 内(把手占据 icon 槽),草稿节点仍留在 icon 槽
        const accentColor = API_MENU_CONFIG[getCatalogType(catalog.type)].accentColor
        const typeIcon = isHttp
          ? (
              <span className="inline-block w-[29px] whitespace-nowrap text-left text-xs/none font-semibold">
                <HttpMethodText method={catalog.data?.method} />
              </span>
            )
          : item.isLeaf
            ? (
                <FileIcon
                  size={15}
                  style={{ color: hasAccentColor(catalog.type) ? accentColor : undefined }}
                  type={catalog.type}
                />
              )
            : <FolderIcon size={14} type={catalog.type} />

        return {
          ...item,
          icon: ({ expanded }) => {
            // 可拖节点:icon 槽渲染拖拽把手(位于 GET/POST 等类型图标左侧)
            if (!isDraft) {
              return (
                <span className="drag-handle">
                  <GripVerticalIcon size={12} />
                </span>
              )
            }

            // 草稿(未入库,不可拖)保留原图标
            if (item.isLeaf) {
              return (
                <span
                  className={`inline-flex size-full items-center justify-center ${isHttp ? 'w-[29px] whitespace-nowrap text-left text-xs/none font-semibold' : catalog.type === MenuItemType.ApiSchema ? 'text-[color:var(--ds-highlight-selected)]' : ''}`}
                >
                  {isHttp ? <HttpMethodText method={catalog.data?.method} /> : typeIcon}
                </span>
              )
            }

            return (
              <span className="flex h-full items-center">
                {expanded ? <FolderOpenIcon size={14} /> : <FolderClosedIcon size={14} />}
              </span>
            )
          },
          title: (node) => (
            <ApiMenuTitle
              leadingIcon={!isDraft ? typeIcon : undefined}
              actions={
                item.isLeaf ? <FileAction catalog={catalog} /> : <FolderAction catalog={catalog} />
              }
              name={
                catalog.type === MenuItemType.ApiDetail
                  ? apiDetailDisplay === 'name'
                    ? catalog.name
                    : catalog.data?.path ?? catalog.name
                  : catalog.name
              }
              node={node as CatalogDataNode}
            />
          ),
          className: item.isLeaf ? 'leaf-node' : undefined,
        }
      }),
    [menus, apiDetailDisplay],
  )

  const groupedMenus: GroupedMenu | undefined = useMemo(() => {
    if (menusWithRender) {
      return groupMenuByType(menusWithRender)
    }
  }, [menusWithRender])

  const { styles } = useStyles(({ token }) => ({
    topFolder: css({
      color: token.colorTextSecondary,
    }),
  }))

  const menuTree: TreeProps['treeData'] = useMemo(() => {
    if (!groupedMenus) {
      return
    }

    return topMenus.map<TreeDataNode>((catalogType) => {
      const treeData = arrayToTree(groupedMenus[catalogType], {
        customID: 'key',
        parentProperty: 'customData.catalog.parentId',
      }) as CatalogDataNode[]

      treeData.forEach((node) => {
        attachLeafCount(node)
      })

      return {
        key: catalogType,
        icon: () => (
          <span className="inline-flex size-full items-center justify-center">
            <FolderIcon size={15} type={catalogType} />
          </span>
        ),
        title: () => <ApiMenuTitleTop topMenuType={catalogType} />,
        children: treeData,
        className: `top-folder ${styles.topFolder}`,
      }
    })
  }, [groupedMenus, styles.topFolder])

  return { groupedMenus, menuTree }
}
