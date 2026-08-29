import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { listen } from '@tauri-apps/api/event'
import { Button, message, notification } from 'antd'

import { api } from '@/api-client'
import type { ApiMenuData } from '@/components/ApiMenu'
import { normalizeMenuRawList } from '@/components/JsonSchema/schema-normalizer'
import { useAuth } from '@/contexts/auth'
import {
  mergeDraftsIntoList,
  removeDraftById,
  upsertDraft,
} from '@/contexts/menu-drafts'
import { useProjectTabsContext } from '@/contexts/project-tabs'
import { CatalogType, MenuItemType } from '@/enums'
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
import {
  buildYapiPushNotificationContent,
  getYapiPushNotificationKey,
  YAPI_PUSH_DEBOUNCE_MS,
  YAPI_PUSH_EVENT,
  type YapiPushPayload,
} from '@/utils/yapi-push-notify'

interface MenuHelpers {
  addMenuItem: (menuData: ApiMenuData) => Promise<boolean>
  removeMenuItem: (menuData: Pick<ApiMenuData, 'id'>) => Promise<boolean>
  removeMenuItems: (menuIds: ApiMenuData['id'][]) => Promise<boolean>
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
  /** 写入/更新一条草稿到 localStorage 并刷新合并列表（isNew=true 新建草稿，false 为已入库项的未保存修改覆盖层）。 */
  saveDraft: (menuData: ApiMenuData, isNew: boolean) => void
  /** 丢弃指定 id 的草稿并刷新合并列表。 */
  discardDraft: (id: string) => void
}

interface MenuHelpersContextData extends MenuHelpers {
  menuRawList?: ApiMenuData[]
  /** 仅数据库的菜单列表（不含草稿），用于草稿写入前的“是否变更”比较。 */
  dbMenuRawList?: ApiMenuData[]
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
  creatorJson: { id: string, username: string }
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

    if (!ct) { continue }

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

export function MenuHelpersContextProvider(props: React.PropsWithChildren) {
  const { children } = props

  const { sessionId } = useAuth()
  const {
    activeProjectId,
    activeTabState,
    updateProjectHelpersState,
    openProject,
    isProjectOpen,
    setActiveProjectId,
  } = useProjectTabsContext()

  // ----- 从 ProjectTabsContext 派生状态 -----
  const dbMenuRawList = activeTabState?.projectState.menuRawList
  const recyleRawData = activeTabState?.projectState.recyleRawData
  const projectEnvironments = activeTabState?.projectState.projectEnvironments ?? []
  const projectEnvironmentConfig = activeTabState?.projectState.projectEnvironmentConfig ?? EMPTY_PROJECT_ENVIRONMENT_CONFIG
  const currentProjectEnvironmentId = activeTabState?.projectState.currentProjectEnvironmentId
  const menuSearchWord = activeTabState?.projectState.menuSearchWord
  const apiDetailDisplay = activeTabState?.projectState.apiDetailDisplay ?? 'name'

  // ----- 草稿合并：DB 列表 + localStorage 草稿 → 单一数据源 menuRawList -----
  // draftsTick 仅用于在草稿写入/丢弃后触发合并列表重算。
  const [draftsTick, setDraftsTick] = useState(0)

  const menuRawList = useMemo(() => {
    if (!activeProjectId) {
      return dbMenuRawList
    }

    return mergeDraftsIntoList(activeProjectId, dbMenuRawList)
    // draftsTick 作为显式依赖用于强制重算，忽略 exhaustive-deps 警告
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, dbMenuRawList, draftsTick])

  const saveDraft = useCallback((menuData: ApiMenuData, isNew: boolean) => {
    if (!activeProjectId) { return }

    upsertDraft(activeProjectId, menuData, isNew)
    setDraftsTick((t) => t + 1)
  }, [activeProjectId])

  const discardDraft = useCallback((id: string) => {
    if (!activeProjectId) { return }

    removeDraftById(activeProjectId, id)
    setDraftsTick((t) => t + 1)
  }, [activeProjectId])

  // ----- Setters 包装器（写入 ProjectTabsContext） -----
  const setCurrentProjectEnvironmentId = useCallback(
    (value: string | undefined | ((prev: string | undefined) => string | undefined)) => {
      if (!activeProjectId) { return }

      updateProjectHelpersState(activeProjectId, (prev) => ({
        ...prev,
        currentProjectEnvironmentId:
          typeof value === 'function'
            ? (value as (prev: string | undefined) => string | undefined)(prev.currentProjectEnvironmentId)
            : value,
      }))
    },
    [activeProjectId, updateProjectHelpersState],
  )

  const setMenuSearchWord = useCallback(
    (value: string | undefined | ((prev: string | undefined) => string | undefined)) => {
      if (!activeProjectId) { return }

      updateProjectHelpersState(activeProjectId, (prev) => ({
        ...prev,
        menuSearchWord:
          typeof value === 'function'
            ? (value as (prev: string | undefined) => string | undefined)(prev.menuSearchWord)
            : value,
      }))
    },
    [activeProjectId, updateProjectHelpersState],
  )

  const setApiDetailDisplay = useCallback(
    (value: 'name' | 'path' | ((prev: 'name' | 'path') => 'name' | 'path')) => {
      if (!activeProjectId) { return }

      updateProjectHelpersState(activeProjectId, (prev) => ({
        ...prev,
        apiDetailDisplay:
          typeof value === 'function'
            ? (value as (prev: 'name' | 'path') => 'name' | 'path')(prev.apiDetailDisplay ?? 'name')
            : value,
      }))
    },
    [activeProjectId, updateProjectHelpersState],
  )

  // ----- applyState：归一化并写入 ProjectTabsContext -----
  const applyState = useCallback((projectId: string, state: StatePayload) => {
    const normalizedState = normalizeStatePayload(state)
    // 统一归一化所有 JSON Schema（外部格式 → 内部格式）
    normalizedState.menuRawList = normalizeMenuRawList(normalizedState.menuRawList) as ApiMenuData[]

    updateProjectHelpersState(projectId, (prev) => ({
      ...prev,
      menuRawList: normalizedState.menuRawList,
      recyleRawData: normalizedState.recyleRawData,
      projectEnvironments: normalizedState.projectEnvironments,
      projectEnvironmentConfig: normalizedState.projectEnvironmentConfig,
    }))

    writeCachedState(projectId, normalizedState)
  }, [updateProjectHelpersState])

  const applyServerState = useCallback((state: ProjectStateSnapshot) => {
    if (activeProjectId) {
      applyState(activeProjectId, state)
    }
  }, [applyState, activeProjectId])

  // ----- reloadState -----
  const reloadState = useCallback(async () => {
    if (!activeProjectId || !sessionId) {
      return
    }

    try {
      const state = await api<StatePayload>('get_project_state', {
        sessionId,
        projectId: activeProjectId,
      })
      applyState(activeProjectId, state)
    }
    catch (error) {
      console.error(error)
    }
  }, [activeProjectId, sessionId, applyState])

  // ----- YAPI 推送通知：右上角常驻，合并防抖 -----
  const [notificationApi, notificationHolder] = notification.useNotification({ placement: 'topRight' })
  const pendingRef = useRef<Map<string, { projectName: string, count: number, timer: number }>>(new Map())
  const visibleRef = useRef<Map<string, number>>(new Map())
  const activeProjectIdRef = useRef(activeProjectId)
  const reloadStateRef = useRef(reloadState)
  const openProjectRef = useRef(openProject)
  const isProjectOpenRef = useRef(isProjectOpen)
  const setActiveProjectIdRef = useRef(setActiveProjectId)

  useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])
  useEffect(() => { reloadStateRef.current = reloadState }, [reloadState])
  useEffect(() => { openProjectRef.current = openProject }, [openProject])
  useEffect(() => { isProjectOpenRef.current = isProjectOpen }, [isProjectOpen])
  useEffect(() => { setActiveProjectIdRef.current = setActiveProjectId }, [setActiveProjectId])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    const flush = (projectId: string) => {
      const entry = pendingRef.current.get(projectId)

      if (!entry) { return }

      pendingRef.current.delete(projectId)
      const { projectName, count } = entry
      const prevVisible = visibleRef.current.get(projectId) ?? 0
      const total = prevVisible > 0 ? prevVisible + count : count
      visibleRef.current.set(projectId, total)
      const isActive = activeProjectIdRef.current === projectId
      const key = getYapiPushNotificationKey(projectId)
      const { title, description } = buildYapiPushNotificationContent(projectName, total)
      notificationApi.info({
        key,
        message: title,
        description,
        duration: 0,
        btn: (
          <Button
            size="small"
            type="primary"
            onClick={() => {
              notificationApi.destroy(key)
              visibleRef.current.delete(projectId)

              if (isActive) {
                void reloadStateRef.current()
              }
              else {
                const targetId = projectId
                const name = projectName

                if (isProjectOpenRef.current(targetId)) {
                  setActiveProjectIdRef.current(targetId)
                }
                else {
                  openProjectRef.current({ projectId: targetId, name, role: 'viewer' })
                }
              }
            }}
          >
            {isActive ? '立即刷新' : '去查看'}
          </Button>
        ),
        onClose: () => {
          visibleRef.current.delete(projectId)
        },
      })
    }

    const setup = async () => {
      try {
        unlisten = await listen<YapiPushPayload>(YAPI_PUSH_EVENT, (event) => {
          const payload = event.payload

          if (!payload?.projectId) { return }

          const existing = pendingRef.current.get(payload.projectId)

          if (existing) {
            window.clearTimeout(existing.timer)
            const newCount = existing.count + (payload.count || 1)
            const timer = window.setTimeout(() => { flush(payload.projectId) }, YAPI_PUSH_DEBOUNCE_MS)
            pendingRef.current.set(payload.projectId, { projectName: payload.projectName || existing.projectName, count: newCount, timer: timer as unknown as number })
          }
          else {
            const timer = window.setTimeout(() => { flush(payload.projectId) }, YAPI_PUSH_DEBOUNCE_MS)
            pendingRef.current.set(payload.projectId, { projectName: payload.projectName || payload.projectId, count: payload.count || 1, timer: timer as unknown as number })
          }
        })

        if (cancelled && unlisten) {
          unlisten()
          unlisten = undefined
        }
      }
      catch (error) {
        console.error('[yapi-push] listen failed', error)
      }
    }

    void setup()

    return () => {
      cancelled = true

      if (unlisten) { unlisten() }

      pendingRef.current.forEach((v) => { window.clearTimeout(v.timer) })
      pendingRef.current.clear()
    }
  }, [notificationApi])

  // ----- 当 activeProjectId 变化时：自动打开未在标签栏中的项目，加载缓存 + 刷新 -----
  useEffect(() => {
    // 如果 activeProjectId 有值但不在 ProjectTabsContext 中（例如直接输入 URL），自动打开
    if (activeProjectId && !activeTabState) {
      openProject({
        projectId: activeProjectId,
        name: 'Loading...',
        role: 'viewer',
      })

      return
    }

    if (activeProjectId) {
      const cachedState = readCachedState(activeProjectId)

      if (cachedState) {
        applyState(activeProjectId, cachedState)
      }

      // 恢复缓存的 environmentId
      const cachedEnvId = readCachedEnvironmentId(activeProjectId)

      if (cachedEnvId) {
        updateProjectHelpersState(activeProjectId, (prev) => {
          if (!prev.currentProjectEnvironmentId) {
            return { ...prev, currentProjectEnvironmentId: cachedEnvId }
          }

          return prev
        })
      }
    }

    void reloadState()
    // 只在 activeProjectId 变化时触发（activeTabState 会随 openTabs 变化而变化，
    // 但这里只需要检测「是否有值」，不需要在它变化时重新执行）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId])

  // ----- Environment ID fallback -----
  useEffect(() => {
    if (!activeProjectId) { return }

    if (currentProjectEnvironmentId) {
      const exists = projectEnvironments.some(({ id }) => id === currentProjectEnvironmentId)

      if (exists) {
        writeCachedEnvironmentId(activeProjectId, currentProjectEnvironmentId)

        return
      }
    }

    const fallbackId = projectEnvironments.at(0)?.id

    if (fallbackId === undefined && currentProjectEnvironmentId === undefined) { return }

    if (fallbackId !== currentProjectEnvironmentId) {
      setCurrentProjectEnvironmentId(fallbackId)

      if (fallbackId) {
        writeCachedEnvironmentId(activeProjectId, fallbackId)
      }
    }
  }, [activeProjectId, currentProjectEnvironmentId, projectEnvironments, setCurrentProjectEnvironmentId])

  // ----- MenuHelpers（mutation 辅助方法） -----
  const menuHelpers = useMemo<MenuHelpers>(() => {
    const guardProject = () => {
      if (!activeProjectId) {
        console.error(new Error('当前不在项目页面'))

        return undefined
      }

      if (!sessionId) {
        return undefined
      }

      return activeProjectId
    }

    const mutateRecycleItems = (method: 'DELETE' | 'POST', recycleIds: string[]) => {
      const id = guardProject()

      if (!id || recycleIds.length === 0 || !sessionId) {
        return
      }

      if (method === 'POST') {
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
            message.error('还原失败,请重试')
            console.error(error)
          })
      }
      else {
        void api<unknown>('delete_recycle_items', {
          sessionId,
          projectId: id,
          payload: { recycleIds },
        })
          .then(() => reloadState())
          .catch((error: unknown) => {
            message.error('删除失败,请重试')
            console.error(error)
          })
      }
    }

    return {
      applyServerState,
      reloadState,
      saveDraft,
      discardDraft,
      addMenuItem: async (menuData) => {
        const id = guardProject()

        if (!id || !sessionId) {
          return false
        }

        try {
          await api<unknown>('create_menu_item', {
            sessionId,
            projectId: id,
            payload: menuData,
          })
          await reloadState()

          return true
        }
        catch (error: unknown) {
          message.error('新增失败,请重试')
          console.error(error)

          return false
        }
      },
      removeMenuItem: async ({ id: menuId }) => {
        const id = guardProject()

        if (!id || !sessionId) {
          return false
        }

        try {
          await api<unknown>('delete_menu_item', {
            sessionId,
            projectId: id,
            menuId,
          })
          await reloadState()

          return true
        }
        catch (error: unknown) {
          message.error('删除失败,请重试')
          console.error(error)

          return false
        }
      },
      removeMenuItems: async (menuIds) => {
        const id = guardProject()

        if (!id || menuIds.length === 0 || !sessionId) {
          return false
        }

        try {
          await api<unknown>('batch_delete_menu_items', {
            sessionId,
            projectId: id,
            payload: { menuIds },
          })
          await reloadState()

          return true
        }
        catch (error: unknown) {
          message.error('删除失败,请重试')
          console.error(error)

          return false
        }
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
            message.error(typeof error === 'object' && error !== null && 'message' in error && String((error as Error).message).includes('不能将') ? (error as Error).message : '移动失败,请重试')
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
        applyState(id, state)
      },
    }
  }, [applyServerState, activeProjectId, sessionId, reloadState, applyState, saveDraft, discardDraft])

  return (
    <MenuHelpersContext.Provider
      value={{
        menuRawList,
        dbMenuRawList,
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
      {notificationHolder}
    </MenuHelpersContext.Provider>
  )
}

export const useMenuHelpersContext = () => useContext(MenuHelpersContext)
