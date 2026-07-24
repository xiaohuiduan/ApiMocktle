import { createContext, useCallback, useContext, useMemo } from 'react'
import { useEvent } from 'react-use-event-hook'

import type { ApiTabItem, EditStatus } from '@/components/ApiTab'
import type { PageTabStatus } from '@/components/ApiTab/ApiTab.enum'
import { API_MENU_CONFIG } from '@/configs/static'
import { CatalogType } from '@/enums'
import { useProjectTabsContext } from '@/contexts/project-tabs'

function createDefaultTabItems(): ApiTabItem[] {
  return [
    {
      key: CatalogType.Overview,
      label: API_MENU_CONFIG[CatalogType.Overview].title,
      contentType: CatalogType.Overview,
    },
  ]
}

interface MenuTabContextData {
  /** 当前在 Tabs 中打开的所有页签。 */
  tabItems: ApiTabItem[]
  setTabItems: React.Dispatch<React.SetStateAction<ApiTabItem[]>>

  /** 当前激活的页签。 */
  activeTabKey: ApiTabItem['key'] | undefined
  setActiveTabKey: React.Dispatch<React.SetStateAction<ApiTabItem['key'] | undefined>>

  /** 上一次被激活的页签。 */
  lastActiveTabKey: ApiTabItem['key'] | undefined
  setLastActiveTabKey: React.Dispatch<React.SetStateAction<ApiTabItem['key'] | undefined>>
}

const MenuTabContext = createContext({} as MenuTabContextData)

export function MenuTabProvider(props: React.PropsWithChildren) {
  const { children } = props
  const { activeProjectId, activeTabState, updateProjectTabState } = useProjectTabsContext()

  // ----- 从 ProjectTabsContext 派生 -----
  const tabItems = activeTabState?.tabItems ?? createDefaultTabItems()
  const activeTabKey = activeTabState?.activeTabKey
  const lastActiveTabKey = activeTabState?.lastActiveTabKey

  // ----- Setters 包装器（写入 ProjectTabsContext） -----
  const setTabItems = useCallback(
    (value: ApiTabItem[] | ((prev: ApiTabItem[]) => ApiTabItem[])) => {
      if (!activeProjectId) return
      updateProjectTabState(activeProjectId, (prev) => {
        const newItems = typeof value === 'function' ? value(prev.tabItems) : value
        return { ...prev, tabItems: newItems }
      })
    },
    [activeProjectId, updateProjectTabState],
  )

  const setActiveTabKey = useCallback(
    (value: ApiTabItem['key'] | undefined | ((prev: ApiTabItem['key'] | undefined) => ApiTabItem['key'] | undefined)) => {
      if (!activeProjectId) return
      updateProjectTabState(activeProjectId, (prev) => ({
        ...prev,
        activeTabKey: typeof value === 'function' ? value(prev.activeTabKey) : value,
      }))
    },
    [activeProjectId, updateProjectTabState],
  )

  const setLastActiveTabKey = useCallback(
    (value: ApiTabItem['key'] | undefined | ((prev: ApiTabItem['key'] | undefined) => ApiTabItem['key'] | undefined)) => {
      if (!activeProjectId) return
      updateProjectTabState(activeProjectId, (prev) => ({
        ...prev,
        lastActiveTabKey: typeof value === 'function' ? value(prev.lastActiveTabKey) : value,
      }))
    },
    [activeProjectId, updateProjectTabState],
  )

  const value = useMemo<MenuTabContextData>(
    () => ({
      tabItems,
      setTabItems,
      activeTabKey,
      setActiveTabKey,
      lastActiveTabKey,
      setLastActiveTabKey,
    }),
    [tabItems, setTabItems, activeTabKey, setActiveTabKey, lastActiveTabKey, setLastActiveTabKey],
  )

  return (
    <MenuTabContext.Provider value={value}>
      {children}
    </MenuTabContext.Provider>
  )
}

export const useMenuTabContext = () => useContext(MenuTabContext)

interface MenuTabHelpers {
  /** 激活指定的页签。 */
  activeTabItem: (payload: Pick<ApiTabItem, 'key'>) => void
  /** 获取指定的页签项。 */
  getTabItem: (payload: Pick<ApiTabItem, 'key'>) => ApiTabItem | undefined
  /** 添加新的页签。 */
  addTabItem: (
    payload: ApiTabItem,
    config?: { autoActive?: boolean, replaceTab?: ApiTabItem['key'] }
  ) => void
  /** 移除页签。 */
  removeTabItem: (payload: Pick<ApiTabItem, 'key'>) => void
  /** 移除所有页签。 */
  removeAllTabItems: () => void
  /** 移除所有页签，除了当前激活的页签。 */
  removeOtherTabItems: () => void
  setTabItemEditStatus: (payload: Pick<ApiTabItem, 'key'>, editStatus: EditStatus) => void
  /** 更新页签的 tabStatus（如保存后由 Create 升级为 Update，避免重复新建）。 */
  setTabItemStatus: (payload: Pick<ApiTabItem, 'key'>, tabStatus: PageTabStatus) => void
}

export function useMenuTabHelpers(): MenuTabHelpers {
  const {
    tabItems,
    setTabItems,
    activeTabKey,
    setActiveTabKey,
    lastActiveTabKey,
    setLastActiveTabKey,
  } = useMenuTabContext()

  const activeTabItem = useEvent<MenuTabHelpers['activeTabItem']>((payload) => {
    setLastActiveTabKey(() => activeTabKey)

    if (tabItems.length > 0) {
      setActiveTabKey(() => payload.key)
    }
  })

  const getTabItem = useEvent<MenuTabHelpers['getTabItem']>((payload) => {
    return tabItems.find((item) => item.key === payload.key)
  })

  const addTabItem = useEvent<MenuTabHelpers['addTabItem']>(
    (payload, { autoActive = true, replaceTab } = {}) => {
      const isSameTabPresent = tabItems.some((item) => item.key === payload.key)

      if (isSameTabPresent) {
        throw new Error('已存在相同的页签。')
      }
      else {
        if (replaceTab) {
          setTabItems((items) => items.map((it) => (it.key === replaceTab ? payload : it)))
        }
        else {
          setTabItems((items) => [...items, payload])
        }

        if (autoActive) {
          activeTabItem({ key: payload.key })
        }
      }
    },
  )

  const removeTabItem = useEvent<MenuTabHelpers['removeTabItem']>((payload) => {
    setTabItems((items) => {
      const newItems = items.filter((item) => item.key !== payload.key)

      if (activeTabKey === payload.key) {
        setActiveTabKey(() => undefined)

        const valideTabKey
          = lastActiveTabKey && newItems.findIndex((item) => item.key === lastActiveTabKey) !== -1

        if (valideTabKey) {
          activeTabItem({ key: lastActiveTabKey })
        }
        else {
          setLastActiveTabKey(() => undefined)

          const lastTabKey = newItems.at(-1)?.key

          if (lastTabKey) {
            activeTabItem({ key: lastTabKey })
          }
        }
      }

      return newItems
    })
  })

  const removeAllPageTabItems = useEvent<MenuTabHelpers['removeAllTabItems']>(() => {
    setActiveTabKey(() => undefined)
    setTabItems(() => [])
  })

  const removeOtherTabItems = useEvent<MenuTabHelpers['removeOtherTabItems']>(() => {
    if (activeTabKey) {
      setTabItems((items) => items.filter((item) => item.key === activeTabKey))
    }
  })

  const setTabItemEditStatus = useEvent<MenuTabHelpers['setTabItemEditStatus']>(
    (payload, editStatus) => {
      setTabItems((items) => {
        return items.map((item) => {
          if (item.key === payload.key) {
            return { ...item, data: { ...item.data, editStatus } }
          }

          return item
        })
      })
    },
  )

  const setTabItemStatus = useEvent<MenuTabHelpers['setTabItemStatus']>(
    (payload, tabStatus) => {
      setTabItems((items) => {
        return items.map((item) => {
          if (item.key === payload.key) {
            return { ...item, data: { ...item.data, tabStatus } }
          }

          return item
        })
      })
    },
  )

  return {
    activeTabItem,
    getTabItem,
    addTabItem,
    removeTabItem,
    removeAllTabItems: removeAllPageTabItems,
    removeOtherTabItems,
    setTabItemEditStatus,
    setTabItemStatus,
  }
}
