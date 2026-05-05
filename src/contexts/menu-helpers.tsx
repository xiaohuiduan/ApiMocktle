import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'

import type { ApiMenuData } from '@/components/ApiMenu'
import { normalizeMenuRawList } from '@/components/JsonSchema/schema-normalizer'
import {
  createGlobalParameters,
  EMPTY_PROJECT_ENVIRONMENT_CONFIG,
} from '@/project-environment-utils'
import type {
  ApiEnvironment,
  Creator,
  ProjectEnvironmentConfig,
  RecycleCatalogType,
  RecycleData,
  RecycleDataItem,
} from '@/types'
import { api } from '@/api-client'
import { CatalogType, MenuItemType } from '@/enums'
import { useAuth } from '@/contexts/auth'

interface MenuHelpers {
  addMenuItem: (menuData: ApiMenuData) => void
  removeMenuItem: (menuData: Pick<ApiMenuData, 'id'>) => void
  removeMenuItems: (menuIds: ApiMenuData['id'][]) => Promise<void>
  updateMenuItem: (menuData: Partial<ApiMenuData> & Pick<ApiMenuData, 'id'>) => Promise<void>
  restoreMenuItem: (menuData: { restoreId: RecycleDataItem['id'] }) => void
  restoreMenuItems: (recycleIds: RecycleDataItem['id'][]) => void
  deleteRecycleItems: (recycleIds: RecycleDataItem['id'][]) => void
  moveMenuItem: (moveInfo: {
    dragKey: ApiMenuData['id']
    dropKey: ApiMenuData['id']
    dropPosition: 0 | -1 | 1
  }) => void
  updateProjectEnvironmentConfig: (config: ProjectEnvironmentConfig) => Promise<void>
  applyServerState: (state: ProjectStateSnapshot) => void
  reloadState: () => Promise<void>
}

interface MenuHelpersContextData extends MenuHelpers {
  menuRawList?: ApiMenuData[]
  recyleRawData?: RecycleData
  projectEnvironments: ApiEnvironment[]
  projectEnvironmentConfig: ProjectEnvironmentConfig
  currentProjectEnvironmentId?: string
  setCurrentProjectEnvironmentId: React.Dispatch<React.SetStateAction<string | undefined>>
  menuSearchWord?: string
  setMenuSearchWord?: React.Dispatch<React.SetStateAction<MenuHelpersContextData['menuSearchWord']>>
  apiDetailDisplay: 'name' | 'path'
  setApiDetailDisplay: React.Dispatch<
    React.SetStateAction<MenuHelpersContextData['apiDetailDisplay']>
  >
}

export interface ProjectStateSnapshot {
  menuRawList: ApiMenuData[]
  recyleRawData: RecycleData
  projectEnvironments: ApiEnvironment[]
  projectEnvironmentConfig: ProjectEnvironmentConfig
}

type StatePayload = ProjectStateSnapshot

const MenuHelpersContext = createContext({} as MenuHelpersContextData)
const getStateCacheKey = (projectId: string) => `project-state:${projectId}`
const getEnvironmentCacheKey = (projectId: string) => `project-environment:${projectId}`

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeEnvironmentConfigShape(input: unknown): ProjectEnvironmentConfig {
  if (!isRecord(input)) {
    return EMPTY_PROJECT_ENVIRONMENT_CONFIG
  }

  const globalParameters = Array.isArray(input.globalParameters)
    ? createGlobalParameters()
    : {
        ...createGlobalParameters(),
        ...(isRecord(input.globalParameters) ? input.globalParameters : {}),
      }

  return {
    ...EMPTY_PROJECT_ENVIRONMENT_CONFIG,
    ...input,
    globalParameters,
    legacyGlobalParameters: Array.isArray(input.globalParameters)
      ? input.globalParameters as ProjectEnvironmentConfig['legacyGlobalParameters']
      : Array.isArray(input.legacyGlobalParameters)
        ? input.legacyGlobalParameters as ProjectEnvironmentConfig['legacyGlobalParameters']
        : [],
  }
}

interface RawRecycleDataItem {
  id: string
  catalogType: string
  deletedItemJson: ApiMenuData
  creatorJson: { id: string; username: string }
  expiresAt: number
}

const MENU_ITEM_TYPE_TO_CATALOG: Record<string, RecycleCatalogType> = {
  [MenuItemType.ApiDetail]: CatalogType.Http,
  [MenuItemType.ApiDetailFolder]: CatalogType.Http,
  [MenuItemType.Doc]: CatalogType.Http,
  [MenuItemType.ApiSchema]: CatalogType.Schema,
  [MenuItemType.ApiSchemaFolder]: CatalogType.Schema,
  [MenuItemType.HttpRequest]: CatalogType.Request,
  [MenuItemType.RequestFolder]: CatalogType.Request,
}

function normalizeRecycleData(raw: unknown): RecycleData {
  const empty: RecycleData = {
    [CatalogType.Http]: { list: [] },
    [CatalogType.Schema]: { list: [] },
    [CatalogType.Request]: { list: [] },
  }

  if (!Array.isArray(raw)) {
    if (!raw || typeof raw !== 'object') {
      return empty
    }

    const obj = raw as Record<string, unknown>

    return {
      [CatalogType.Http]: { list: Array.isArray((obj[CatalogType.Http] as { list?: unknown })?.list) ? (obj[CatalogType.Http] as { list: RecycleDataItem[] }).list : [] },
      [CatalogType.Schema]: { list: Array.isArray((obj[CatalogType.Schema] as { list?: unknown })?.list) ? (obj[CatalogType.Schema] as { list: RecycleDataItem[] }).list : [] },
      [CatalogType.Request]: { list: Array.isArray((obj[CatalogType.Request] as { list?: unknown })?.list) ? (obj[CatalogType.Request] as { list: RecycleDataItem[] }).list : [] },
    }
  }

  const list = raw as RawRecycleDataItem[]

  for (const item of list) {
    const ct = MENU_ITEM_TYPE_TO_CATALOG[item.catalogType]
    if (!ct) continue

    const days = Math.ceil((item.expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
    const expiredAt = `${Math.max(0, days)}天`

    const creator: Creator = {
      id: item.creatorJson.id,
      name: item.creatorJson.username,
      username: item.creatorJson.username,
    }

    empty[ct].list!.push({
      id: item.id,
      deletedItem: item.deletedItemJson,
      creator,
      expiredAt,
    })
  }

  return empty
}

function normalizeStatePayload(state: StatePayload): StatePayload {
  return {
    ...state,
    recyleRawData: normalizeRecycleData(state.recyleRawData),
    projectEnvironments: Array.isArray(state.projectEnvironments) ? state.projectEnvironments : [],
    projectEnvironmentConfig: normalizeEnvironmentConfigShape(state.projectEnvironmentConfig),
  }
}

function readCachedState(projectId: string): StatePayload | undefined {
  try {
    const raw = window.sessionStorage.getItem(getStateCacheKey(projectId))

    if (!raw) {
      return undefined
    }

    return normalizeStatePayload(JSON.parse(raw) as StatePayload)
  }
  catch {
    return undefined
  }
}

function writeCachedState(projectId: string, state: StatePayload) {
  try {
    window.sessionStorage.setItem(getStateCacheKey(projectId), JSON.stringify(state))
  }
  catch {
    // ignore storage write errors
  }
}

function readCachedEnvironmentId(projectId: string) {
  try {
    return window.localStorage.getItem(getEnvironmentCacheKey(projectId)) ?? undefined
  }
  catch {
    return undefined
  }
}

function writeCachedEnvironmentId(projectId: string, environmentId?: string) {
  try {
    if (environmentId) {
      window.localStorage.setItem(getEnvironmentCacheKey(projectId), environmentId)

      return
    }

    window.localStorage.removeItem(getEnvironmentCacheKey(projectId))
  }
  catch {
    // ignore storage write errors
  }
}

function useProjectId() {
  const { pathname } = useLocation()
  const parts = pathname.split('/').filter(Boolean)

  if (parts[0] === 'projects' && parts[1]) {
    return parts[1]
  }

  return undefined
}

export function MenuHelpersContextProvider(props: React.PropsWithChildren) {
  const { children } = props

  const projectId = useProjectId()
  const { sessionId } = useAuth()
  const [menuRawList, setMenuRawList] = useState<ApiMenuData[]>()
  const [recyleRawData, setRecyleRawData] = useState<RecycleData>()
  const [projectEnvironments, setProjectEnvironments] = useState<ApiEnvironment[]>([])
  const [projectEnvironmentConfig, setProjectEnvironmentConfig]
    = useState<ProjectEnvironmentConfig>(EMPTY_PROJECT_ENVIRONMENT_CONFIG)
  const [currentProjectEnvironmentId, setCurrentProjectEnvironmentId] = useState<string>()
  const [menuSearchWord, setMenuSearchWord] = useState<string>()
  const [apiDetailDisplay, setApiDetailDisplay]
    = useState<MenuHelpersContextData['apiDetailDisplay']>('name')

  const applyState = useCallback((state: StatePayload) => {
    const normalizedState = normalizeStatePayload(state)

    // 统一归一化所有 JSON Schema（外部格式 → 内部格式），后续所有组件直接使用
    normalizedState.menuRawList = normalizeMenuRawList(normalizedState.menuRawList) as ApiMenuData[]

    setMenuRawList(normalizedState.menuRawList)
    setRecyleRawData(normalizedState.recyleRawData)
    setProjectEnvironments(normalizedState.projectEnvironments)
    setProjectEnvironmentConfig(normalizedState.projectEnvironmentConfig)

    if (projectId) {
      writeCachedState(projectId, normalizedState)
    }
  }, [projectId])

  const applyServerState = useCallback((state: ProjectStateSnapshot) => {
    applyState(state)
  }, [applyState])

  const reloadState = useCallback(async () => {
    if (!projectId || !sessionId) {
      setMenuRawList(undefined)
      setRecyleRawData(undefined)
      setProjectEnvironments([])
      setProjectEnvironmentConfig(EMPTY_PROJECT_ENVIRONMENT_CONFIG)

      return
    }

    try {
      const state = await api<StatePayload>('get_project_state', {
        sessionId,
        projectId,
      })
      applyState(state)
    }
    catch (error) {
      console.error(error)
    }
  }, [projectId, sessionId, applyState])

  useEffect(() => {
    if (projectId) {
      const cachedState = readCachedState(projectId)

      if (cachedState) {
        applyState(cachedState)
      }

      setCurrentProjectEnvironmentId(readCachedEnvironmentId(projectId))
    }

    void reloadState()
  }, [applyState, projectId, reloadState])

  useEffect(() => {
    if (!projectId) {
      setCurrentProjectEnvironmentId(undefined)

      return
    }

    if (currentProjectEnvironmentId) {
      const exists = projectEnvironments.some(({ id }) => id === currentProjectEnvironmentId)

      if (exists) {
        writeCachedEnvironmentId(projectId, currentProjectEnvironmentId)

        return
      }
    }

    const fallbackId = projectEnvironments.at(0)?.id
    setCurrentProjectEnvironmentId(fallbackId)
    writeCachedEnvironmentId(projectId, fallbackId)
  }, [currentProjectEnvironmentId, projectEnvironments, projectId])

  const menuHelpers = useMemo<MenuHelpers>(() => {
    const guardProject = () => {
      if (!projectId) {
        console.error(new Error('当前不在项目页面'))

        return undefined
      }

      if (!sessionId) {
        return undefined
      }

      return projectId
    }

    const mutateRecycleItems = (method: 'DELETE' | 'POST', recycleIds: string[]) => {
      const id = guardProject()

      if (!id || recycleIds.length === 0 || !sessionId) {
        return
      }

      if (method === 'POST') {
        // Restore each item
        void Promise.all(
          recycleIds.map((recycleId) =>
            api<unknown>('restore_recycle_item', {
              sessionId,
              projectId: id,
              recycleId,
            }),
          ),
        )
          .then(() => reloadState())
          .catch((error: unknown) => {
            console.error(error)
          })
      } else {
        void api<unknown>('delete_recycle_items', {
          sessionId,
          projectId: id,
          payload: { recycleIds },
        })
          .then(() => reloadState())
          .catch((error: unknown) => {
            console.error(error)
          })
      }
    }

    return {
      applyServerState,
      reloadState,
      addMenuItem: (menuData) => {
        const id = guardProject()

        if (!id || !sessionId) {
          return
        }

        void api<unknown>('create_menu_item', {
          sessionId,
          projectId: id,
          payload: menuData,
        })
          .then(() => reloadState())
          .catch((error: unknown) => {
            console.error(error)
          })
      },
      removeMenuItem: ({ id: menuId }) => {
        const id = guardProject()

        if (!id || !sessionId) {
          return
        }

        void api<unknown>('delete_menu_item', {
          sessionId,
          projectId: id,
          menuId,
        })
          .then(() => reloadState())
          .catch((error: unknown) => {
            console.error(error)
          })
      },
      removeMenuItems: async (menuIds) => {
        const id = guardProject()

        if (!id || menuIds.length === 0 || !sessionId) {
          return
        }

        await api<unknown>('batch_delete_menu_items', {
          sessionId,
          projectId: id,
          payload: { menuIds },
        })
        await reloadState()
      },
      updateMenuItem: async ({ id: menuId, ...rest }) => {
        const id = guardProject()

        if (!id || !sessionId) {
          return
        }

        await api<unknown>('update_menu_item', {
          sessionId,
          projectId: id,
          menuId,
          payload: rest,
        })
        await reloadState()
      },
      restoreMenuItem: ({ restoreId }) => {
        mutateRecycleItems('POST', [restoreId])
      },
      restoreMenuItems: (recycleIds) => {
        mutateRecycleItems('POST', recycleIds)
      },
      deleteRecycleItems: (recycleIds) => {
        mutateRecycleItems('DELETE', recycleIds)
      },
      moveMenuItem: ({ dragKey, dropKey, dropPosition }) => {
        const id = guardProject()

        if (!id || !sessionId) {
          return
        }

        void api<unknown>('move_menu_items', {
          sessionId,
          projectId: id,
          payload: { dragKey, dropKey, dropPosition },
        })
          .then(() => reloadState())
          .catch((error: unknown) => {
            console.error(error)
          })
      },
      updateProjectEnvironmentConfig: async (config) => {
        const id = guardProject()

        if (!id || !sessionId) {
          return
        }

        const state = await api<StatePayload>('save_project_environments', {
          sessionId,
          projectId: id,
          payload: { config },
        })
        applyState(state)
      },
    }
  }, [applyServerState, projectId, sessionId, reloadState, applyState])

  return (
    <MenuHelpersContext.Provider
      value={{
        menuRawList,
        recyleRawData,
        projectEnvironments,
        projectEnvironmentConfig,
        currentProjectEnvironmentId,
        setCurrentProjectEnvironmentId,
        menuSearchWord,
        setMenuSearchWord,
        apiDetailDisplay,
        setApiDetailDisplay,
        ...menuHelpers,
      }}
    >
      {children}
    </MenuHelpersContext.Provider>
  )
}

export const useMenuHelpersContext = () => useContext(MenuHelpersContext)
