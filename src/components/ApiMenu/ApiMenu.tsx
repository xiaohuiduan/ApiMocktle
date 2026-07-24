import { useCallback, useState } from 'react'
import { useEvent } from 'react-use-event-hook'

import { Button, ConfigProvider, Modal, Space, Tree, type TreeProps } from 'antd'
import useResizeObserver from 'use-resize-observer'

import type { ApiMenuData } from '@/components/ApiMenu'
import { API_MENU_CONFIG } from '@/configs/static'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { CatalogType, MenuItemType } from '@/enums'
import { isMenuSameGroup } from '@/helpers'
import { useStyles } from '@/hooks/useStyle'
import type { TabContentType } from '@/types'

import { useMenuTabContext, useMenuTabHelpers } from '../../contexts/menu-tab-settings'
import { PageTabStatus } from '../ApiTab/ApiTab.enum'

import type { CatalogDataNode } from './ApiMenu.type'
import { useApiMenuContext } from './ApiMenuContext'
import { SwitcherIcon } from './SwitcherIcon'

import { css } from '@emotion/css'

type TreeOnSelect = NonNullable<TreeProps['onSelect']>

function toDeletableMenuIds(
  rawKeys: React.Key[],
  menuRawList: ApiMenuData[] | undefined,
): string[] {
  if (!menuRawList?.length) {
    return []
  }

  const valid = new Set(menuRawList.filter((m) => !m.__isDraft).map((m) => m.id))

  return rawKeys.filter((k): k is string => typeof k === 'string' && valid.has(k))
}

const TREE_MIN_VIEWPORT_HEIGHT = 240

/**
 * 侧边的菜单目录，以文件树的形式展示。
 *
 * 相关概念：
 * - 名词解释：菜单/目录（Menu），文件夹（Folder），文件（File），Folder 和 File 统称为 Menu。
 * - 文件夹可以包含文件和另一个文件夹，包含的关系以层级递进的形式展示。
 */
export function ApiMenu() {
  const { moveMenuItem, menuRawList, removeMenuItems } = useMenuHelpersContext()
  const { expandedMenuKeys, addExpandedMenuKeys, removeExpandedMenuKeys, menuTree }
    = useApiMenuContext()

  const { tabItems, activeTabKey } = useMenuTabContext()
  const { activeTabItem, addTabItem, removeTabItem } = useMenuTabHelpers()
  const [batchMode, setBatchMode] = useState(false)
  const [checkedKeys, setCheckedKeys] = useState<React.Key[]>([])
  const { ref: treeContainerRef, height: treeContainerHeight } = useResizeObserver<HTMLDivElement>()

  const selectedKeys = activeTabKey ? [activeTabKey] : undefined
  const treeViewportHeight = Math.max(
    Math.floor(treeContainerHeight ?? TREE_MIN_VIEWPORT_HEIGHT),
    TREE_MIN_VIEWPORT_HEIGHT,
  )

  const switchExpandedKeys = useEvent((menuId: string) => {
    if (expandedMenuKeys.includes(menuId)) {
      removeExpandedMenuKeys([menuId])
    }
    else {
      addExpandedMenuKeys([menuId])
    }
  })

  const exitBatchMode = useCallback(() => {
    setBatchMode(false)
    setCheckedKeys([])
  }, [])

  const handleBatchDelete = useCallback(() => {
    const ids = toDeletableMenuIds(checkedKeys, menuRawList)

    if (ids.length === 0) {
      Modal.warning({ title: '请选择要删除的菜单项（接口、目录、模型等）' })

      return
    }

    Modal.confirm({
      title: `确定删除所选的 ${ids.length} 项？`,
      content: '目录会连同子项一并删除，并进入回收站（30 天内可恢复）。',
      okText: '删除',
      okButtonProps: { danger: true },
      maskClosable: true,
      onOk: async () => {
        try {
          await removeMenuItems(ids)
          ids.forEach((key) => {
            removeTabItem({ key })
          })
          exitBatchMode()
        }
        catch (error) {
          Modal.error({
            title: '批量删除失败',
            content: error instanceof Error ? error.message : '请稍后重试',
          })
        }
      },
    })
  }, [checkedKeys, exitBatchMode, menuRawList, removeMenuItems, removeTabItem])

  const handleMenuSelect = useEvent<TreeOnSelect>((_, { node }) => {
    if (batchMode) {
      return
    }

    const menuId = node.key

    if (typeof menuId === 'string') {
      const isTabPresent = tabItems.some(({ key }) => key === menuId)

      if (isTabPresent) {
        activeTabItem({ key: menuId })
      }
      else {
        if ([CatalogType.Overview, CatalogType.Recycle].includes(menuId as CatalogType)) {
          const { title } = API_MENU_CONFIG[menuId as CatalogType]

          addTabItem({
            key: menuId,
            label: title,
            contentType: menuId as TabContentType,
          })
        }
        else {
          if ('customData' in node) {
            const dataNode = node as CatalogDataNode
            const catalog = dataNode.customData.catalog

            if (
              catalog.type !== MenuItemType.ApiSchemaFolder
              && catalog.type !== MenuItemType.RequestFolder
            ) {
              addTabItem({
                key: menuId,
                label: catalog.name,
                contentType: catalog.type,
                data: {
                  tabStatus: catalog.__isDraft ? PageTabStatus.Create : PageTabStatus.Update,
                },
              })
            }
          }
        }
      }
    }
  })

  const { styles } = useStyles(({ token }) => ({
    menuTree: css({
      '.ant-tree-treenode': {
        '::before': {
          borderRadius: token.borderRadiusSM,
        },

        '&.ant-tree-treenode-selected': {
          '::before, :hover::before': {
            backgroundColor: token.colorFillTertiary,
          },
        },

        ':hover': {
          '.ui-menu-controls': {
            display: 'inline-flex',
          },
        },
      },
    }),
  }))

  const handleDrop: TreeProps['onDrop'] = (info) => {
    if (batchMode) {
      return
    }

    const dropKey = info.node.key
    const dragKey = info.dragNode.key
    const dropPos = info.node.pos.split('-')
    const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1])

    if (
      typeof dragKey === 'string'
      && typeof dropKey === 'string'
      && (dropPosition === 0 || dropPosition === 1 || dropPosition === -1)
    ) {
      moveMenuItem({ dragKey, dropKey, dropPosition })
    }
  }

  const handleTreeCheck: TreeProps['onCheck'] = (keys) => {
    setCheckedKeys(Array.isArray(keys) ? keys : keys.checked)
  }

  return (
    <ConfigProvider
      theme={{
        components: {
          Tree: {
            motionDurationMid: '0',
            motionDurationSlow: '0',
            colorBgTextHover: 'transparent',
            colorBgContainer: 'transparent',
            colorTextLightSolid: 'currentColor',
          },
        },
      }}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 px-1">
          <Space wrap size={8}>
            <Button
              size="small"
              type={batchMode ? 'primary' : 'default'}
              onClick={() => {
                if (batchMode) {
                  exitBatchMode()
                }
                else {
                  setBatchMode(true)
                  setCheckedKeys([])
                }
              }}
            >
              {batchMode ? '退出批量' : '批量选择'}
            </Button>
            {batchMode && (
              <Button danger size="small" type="primary" onClick={handleBatchDelete}>
                删除所选（{toDeletableMenuIds(checkedKeys, menuRawList).length}）
              </Button>
            )}
          </Space>
        </div>
        <div ref={treeContainerRef} className="min-h-0 flex-1 overflow-hidden">
          {!!menuTree && (
            <Tree.DirectoryTree
              blockNode
              showIcon
              allowDrop={({ dragNode, dropNode }) => {
                if (batchMode) {
                  return false
                }

                if (dropNode.className?.includes('top-folder')) {
                  return false
                }

                // 草稿节点（未入库）不可作为拖拽源或落点，避免触发数据库移动。
                if (
                  (dragNode as CatalogDataNode).customData.catalog.__isDraft
                  || (dropNode as CatalogDataNode).customData.catalog.__isDraft
                ) {
                  return false
                }

                return isMenuSameGroup(
                  (dragNode as CatalogDataNode).customData.catalog,
                  (dropNode as CatalogDataNode).customData.catalog,
                )
              }}
              checkable={batchMode}
              checkedKeys={batchMode ? checkedKeys : undefined}
              draggable={
                batchMode
                  ? false
                  : {
                      icon: false,
                      nodeDraggable: (node) => {
                        if (node.className?.includes('top-folder')) {
                          return false
                        }

                        // 草稿节点禁止拖拽。
                        if ((node as unknown as CatalogDataNode).customData.catalog.__isDraft) {
                          return false
                        }

                        return true
                      },
                    }
              }
              expandedKeys={expandedMenuKeys}
              height={treeViewportHeight}
              rootClassName={styles.menuTree}
              selectedKeys={selectedKeys}
              switcherIcon={(node) => {
                const nodeData = node.data as CatalogDataNode | undefined
                const hasChildren = nodeData?.children?.length

                if (hasChildren) {
                  return (
                    <SwitcherIcon
                      onClick={() => {
                        const menuId = nodeData.key

                        if (typeof menuId === 'string') {
                          switchExpandedKeys(menuId)
                        }
                      }}
                    />
                  )
                }

                return null
              }}
              treeData={menuTree}
              onCheck={batchMode ? handleTreeCheck : undefined}
              onDoubleClick={(_, node) => {
                if (batchMode) {
                  return
                }

                const menuId = node.key

                if (typeof menuId === 'string' && !node.isLeaf) {
                  switchExpandedKeys(menuId)
                }
              }}
              onDrop={handleDrop}
              onSelect={handleMenuSelect}
            />
          )}
        </div>
      </div>
    </ConfigProvider>
  )
}
