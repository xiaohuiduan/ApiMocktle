import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { show } from '@ebay/nice-modal-react'
import { Dropdown, type DropdownProps, type MenuProps, theme, Tooltip } from 'antd'
import { CheckIcon,
  ChevronRight,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  FolderInputIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from 'lucide-react'

import { AppMenuControls } from '@/components/ApiMenu/AppMenuControls'
import { FileIcon } from '@/components/icons/FileIcon'
import { ModalImportCurl } from '@/components/modals/ModalImportCurl'
import { ModalNewCatalog } from '@/components/modals/ModalNewCatalog'
import { API_MENU_CONFIG, ROOT_CATALOG } from '@/configs/static'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useMenuTabHelpers } from '@/contexts/menu-tab-settings'
import { CatalogType, MenuItemType } from '@/enums'
import { getCreateType, isMenuFolder } from '@/helpers'
import { useHelpers } from '@/hooks/useHelpers'

import { useApiMenuContext } from './ApiMenuContext'
import { MenuActionButton } from './MenuActionButton'

type DropdownMenuItems = NonNullable<DropdownProps['menu']>['items']
type MenuClickInfo = Parameters<NonNullable<MenuProps['onClick']>>[0]

interface ApiMenuTopTitleProps {
  topMenuType: CatalogType
  extraDropdownMenuItems?: DropdownMenuItems
}

/**
 * 菜单目录的顶级标题，用于归类不同类型的目录，如项目概览、接口、数据模型、快捷请求、回收站等。
 */
export function ApiMenuTitleTop(props: ApiMenuTopTitleProps) {
  const { token } = theme.useToken()
  const { t } = useTranslation()

  const { topMenuType, extraDropdownMenuItems = [] } = props

  const { apiDetailDisplay, setApiDetailDisplay, addMenuItem } = useMenuHelpersContext()
  const { addTabItem } = useMenuTabHelpers()

  const {
    groupedMenus,
    expandedMenuKeys,

    addExpandedMenuKeys,
    removeExpandedMenuKeys,
  } = useApiMenuContext()

  const { createTabItem } = useHelpers()
  const [plusOpen, setPlusOpen] = useState(false)

  const menuFolderKeys = useMemo(() => {
    const folders = groupedMenus?.[topMenuType].filter((it) =>
      isMenuFolder(it.customData.catalog.type),
    )
    const menuKeys = folders?.map((it) => it.key) ?? []

    return [topMenuType, ...menuKeys]
  }, [groupedMenus, topMenuType])

  const allExpanded = useMemo<boolean>(() => {
    return menuFolderKeys.every((key) => expandedMenuKeys.includes(key))
  }, [menuFolderKeys, expandedMenuKeys])

  const { titleKey, newLabelKey } = API_MENU_CONFIG[topMenuType]
  const title = t(titleKey)
  const newLabel = newLabelKey ? t(newLabelKey) : ''

  const noActions = topMenuType === CatalogType.Overview || topMenuType === CatalogType.Recycle

  const handleCreateTabItem = () => {
    createTabItem(getCreateType(topMenuType))
  }

  return (
    <span className="flex h-7 items-center">
      <span className="inline-flex items-center">
        <span>{title}</span>

        {!noActions && (
          <span
            className={`ml-1 scale-50 ${expandedMenuKeys.includes(topMenuType) ? 'rotate-90' : ''}`}
          >
            <ChevronRight size={14} />
          </span>
        )}
      </span>

      {!noActions && (
        <AppMenuControls>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'newItem',
                  label: newLabel,
                  icon: (
                    <FileIcon size={14} style={{ color: token.colorPrimary }} type={topMenuType} />
                  ),
                  onClick: (ev) => {
                    ev.domEvent.stopPropagation()
                    handleCreateTabItem()
                  },
                },
                {
                  key: 'newCatalog',
                  label: t('api.menu.newCatalog'),
                  icon: <FolderPlusIcon size={14} />,
                  onClick: (ev) => {
                    ev.domEvent.stopPropagation()

                    void show(ModalNewCatalog, {
                      formData: {
                        parentId: ROOT_CATALOG,
                        type:
                          topMenuType === CatalogType.Http
                            ? MenuItemType.ApiDetailFolder
                            : topMenuType === CatalogType.Schema
                              ? MenuItemType.ApiSchemaFolder
                              : MenuItemType.RequestFolder,
                      },
                    })
                  },
                },
                ...(topMenuType === CatalogType.Http
                  ? [
                      {
                        key: 'importCurl',
                        label: t('api.menu.importCurl'),
                        icon: <FolderInputIcon size={14} />,
                        onClick: (ev: MenuClickInfo) => {
                          ev.domEvent.stopPropagation()
                          void show(ModalImportCurl, {
                            onImport: (menuItem) => {
                              addMenuItem(menuItem)
                              addTabItem({
                                key: menuItem.id,
                                label: menuItem.name,
                                contentType: menuItem.type,
                              })
                            },
                          })
                        },
                      },
                    ]
                  : []),
                ...(topMenuType === CatalogType.Request
                  ? [
                      {
                        key: 'importCurl',
                        label: t('api.menu.importFromCurl'),
                        icon: <FolderInputIcon size={14} />,
                        onClick: (ev: MenuClickInfo) => {
                          ev.domEvent.stopPropagation()
                          void show(ModalImportCurl, {
                            onImport: (menuItem) => {
                              if (menuItem.data && 'path' in menuItem.data) {
                                const d = menuItem.data
                                menuItem.data = {
                                  ...d,
                                  path: (d.serverUrl ?? '') + (d.path ?? '/'),
                                }
                              }

                              menuItem.type = MenuItemType.HttpRequest
                              addMenuItem(menuItem)
                              addTabItem({
                                key: menuItem.id,
                                label: menuItem.name,
                                contentType: MenuItemType.HttpRequest,
                              })
                            },
                          })
                        },
                      },
                    ]
                  : []),
                ...extraDropdownMenuItems,
              ],
            }}
            open={plusOpen}
            trigger={['click']}
            onOpenChange={setPlusOpen}
          >
            <MenuActionButton
              icon={<PlusIcon size={14} />}
              onClick={(ev) => {
                ev.stopPropagation()
                setPlusOpen(true)
              }}
            />
          </Dropdown>

          <Tooltip title={allExpanded ? t('api.menu.collapseAll') : t('api.menu.expandAll')}>
            <MenuActionButton
              icon={
                allExpanded ? <ChevronsDownUpIcon size={14} /> : <ChevronsUpDownIcon size={14} />
              }
              onClick={(ev) => {
                ev.stopPropagation()

                const keys = [topMenuType, ...menuFolderKeys]

                if (allExpanded) {
                  removeExpandedMenuKeys(keys)
                }
                else {
                  addExpandedMenuKeys(keys)
                }
              }}
            />
          </Tooltip>

          {topMenuType === CatalogType.Http && (
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'displayName',
                    label: t('api.menu.displayAsName'),
                    icon: (
                      <CheckIcon
                        size={14}
                        style={{
                          color: token.colorPrimary,
                          opacity: apiDetailDisplay === 'name' ? undefined : 0,
                        }}
                      />
                    ),
                    onClick: (ev) => {
                      ev.domEvent.stopPropagation()
                      setApiDetailDisplay('name')
                    },
                  },
                  {
                    key: 'displayPath',
                    label: t('api.menu.displayAsUrl'),
                    icon: (
                      <CheckIcon
                        size={14}
                        style={{
                          color: token.colorPrimary,
                          opacity: apiDetailDisplay === 'path' ? undefined : 0,
                        }}
                      />
                    ),
                    onClick: (ev) => {
                      ev.domEvent.stopPropagation()
                      setApiDetailDisplay('path')
                    },
                  },
                ],
              }}
              trigger={['click']}
            >
              <MenuActionButton
                icon={(
                  <MoreHorizontalIcon
                    size={14}
                    onClick={(ev) => {
                      ev.stopPropagation()
                    }}
                  />
                )}
              />
            </Dropdown>
          )}
        </AppMenuControls>
      )}
    </span>
  )
}
