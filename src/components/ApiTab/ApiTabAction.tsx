import { useMemo } from 'react'

import { Button, Dropdown, type MenuProps } from 'antd'
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { nanoid } from 'nanoid'

import { IconText } from '@/components/IconText'

import { useMenuTabContext, useMenuTabHelpers } from '../../contexts/menu-tab-settings'

export function useApiTabActions() {
  const { removeAllTabItems, removeOtherTabItems } = useMenuTabHelpers()
  const { tabItems, activeTabKey, setTabItems } = useMenuTabContext()

  const activeIndex = tabItems.findIndex((item) => item.key === activeTabKey)

  const moveActiveTab = (direction: -1 | 1) => {
    if (activeIndex < 0) { return }

    const target = activeIndex + direction

    if (target < 0 || target >= tabItems.length) { return }

    const newItems = [...tabItems]
    const [moved] = newItems.splice(activeIndex, 1)
    newItems.splice(target, 0, moved)
    setTabItems(newItems)
  }

  const menuItems = useMemo<MenuProps['items']>(
    () => [
      {
        key: 'moveLeft',
        label: '左移标签',
        disabled: activeIndex <= 0,
        onClick: () => {
          moveActiveTab(-1)
        },
      },
      {
        key: 'moveRight',
        label: '右移标签',
        disabled: activeIndex < 0 || activeIndex >= tabItems.length - 1,
        onClick: () => {
          moveActiveTab(1)
        },
      },
      {
        type: 'divider',
      },
      {
        key: 'closeAll',
        label: '关闭所有标签页',
        onClick: () => {
          removeAllTabItems()
        },
      },
      {
        key: 'closeOthers',
        label: '关闭其他标签页',
        onClick: () => {
          removeOtherTabItems()
        },
      },
    ],
    [activeIndex, tabItems.length, removeAllTabItems, removeOtherTabItems],
  )

  return {
    menuItems,
  }
}

export function ApiTabAction() {
  const { addTabItem } = useMenuTabHelpers()

  const { menuItems } = useApiTabActions()

  return (
    <div className="ml-2 flex gap-x-1">
      <Button
        size="small"
        type="text"
        onClick={() => {
          addTabItem({
            key: nanoid(6),
            label: '新建...',
            contentType: 'blank',
          })
        }}
      >
        <IconText icon={<PlusIcon size={16} />} />
      </Button>

      <Dropdown
        menu={{
          items: menuItems,
        }}
      >
        <Button size="small" type="text">
          <IconText icon={<MoreHorizontalIcon size={16} />} />
        </Button>
      </Dropdown>
    </div>
  )
}
