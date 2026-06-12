import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

import type { ApiTabItem } from '@/components/ApiTab'
import type { ApiMenuData } from '@/components/ApiMenu'
import type {
  ApiEnvironment,
  ProjectEnvironmentConfig,
  RecycleData,
} from '@/types'
import { CatalogType } from '@/enums'
import { API_MENU_CONFIG } from '@/configs/static'

/* ------------------------------------------------------------------ */
/*  Data types                                                         */
/* ------------------------------------------------------------------ */

export interface ProjectTabInfo {
  projectId: string
  name: string
  icon?: string
  role: 'owner' | 'editor' | 'viewer'
}

export interface ProjectFullState {
  menuRawList?: ApiMenuData[]
  recyleRawData?: RecycleData
  projectEnvironments: ApiEnvironment[]
  projectEnvironmentConfig: ProjectEnvironmentConfig
  currentProjectEnvironmentId?: string
  menuSearchWord?: string
  apiDetailDisplay?: 'name' | 'path'
}

export interface ProjectTabState {
  info: ProjectTabInfo
  projectState: ProjectFullState
  tabItems: ApiTabItem[]
  activeTabKey?: ApiTabItem['key']
  lastActiveTabKey?: ApiTabItem['key']
  /** 最近一次子页面路徑，如 "/home" "/tests" "/settings" */
  lastSubPath: string
}

/* ------------------------------------------------------------------ */
/*  Helper: default tab items                                          */
/* ------------------------------------------------------------------ */

function createDefaultTabItems(): ApiTabItem[] {
  return [
    {
      key: CatalogType.Overview,
      label: API_MENU_CONFIG[CatalogType.Overview].title,
      contentType: CatalogType.Overview,
    },
  ]
}

/* ------------------------------------------------------------------ */
/*  Context interface                                                  */
/* ------------------------------------------------------------------ */

export interface ProjectTabsContextData {
  /** 所有已打开的项目列表。 */
  openTabs: ProjectTabState[]
  /** 当前激活的项目 ID。 */
  activeProjectId: string | null
  /** 设置当前激活的项目（会同步更新 URL）。 */
  setActiveProjectId: (id: string | null) => void
  /** 判断某个项目是否已打开。 */
  isProjectOpen: (id: string) => boolean
  /** 打开（或切换到）一个项目。 */
  openProject: (info: ProjectTabInfo) => void
  /** 关闭指定项目标签。 */
  closeProject: (id: string) => void
  /** 关闭除指定项目外的所有标签。 */
  closeOtherProjects: (id: string) => void
  /** 关闭指定项目右侧的所有标签。 */
  closeRightProjects: (id: string) => void
  /** 关闭所有项目标签。 */
  closeAllProjects: () => void

  /** 更新指定项目的 ProjectFullState。 */
  updateProjectHelpersState: (
    projectId: string,
    updater: (prev: ProjectFullState) => ProjectFullState,
  ) => void
  /** 更新指定项目的标签状态。 */
  updateProjectTabState: (
    projectId: string,
    updater: (
      prev: Pick<ProjectTabState, 'tabItems' | 'activeTabKey' | 'lastActiveTabKey'>,
    ) => Pick<ProjectTabState, 'tabItems' | 'activeTabKey' | 'lastActiveTabKey'>,
  ) => void

  /** 当前激活项目的完整状态（派生值）。 */
  activeTabState: ProjectTabState | undefined
}

/* ------------------------------------------------------------------ */
/*  Cache helpers                                                      */
/* ------------------------------------------------------------------ */

const OPEN_TABS_KEY = 'project-open-tabs'
const getStateCacheKey = (projectId: string) => `project-state:${projectId}`

function saveOpenTabInfoList(tabs: ProjectTabState[]) {
  try {
    const info = tabs.map((t) => ({
      projectId: t.info.projectId,
      name: t.info.name,
      icon: t.info.icon,
      role: t.info.role,
    }))
    sessionStorage.setItem(OPEN_TABS_KEY, JSON.stringify(info))
  } catch {
    // ignore
  }
}

function loadOpenTabInfoList(): ProjectTabInfo[] {
  try {
    const raw = sessionStorage.getItem(OPEN_TABS_KEY)
    return raw ? (JSON.parse(raw) as ProjectTabInfo[]) : []
  } catch {
    return []
  }
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const ProjectTabsContext = createContext({} as ProjectTabsContextData)

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function ProjectTabsProvider(props: React.PropsWithChildren) {
  const { children } = props

  const navigate = useNavigate()
  const { pathname } = useLocation()
  const prevPathRef = useRef(pathname)

  const [openTabs, setOpenTabs] = useState<ProjectTabState[]>(() => {
    // 页面刷新时尝试从 sessionStorage 恢复已打开的项目标签
    const savedInfos = loadOpenTabInfoList()
    if (savedInfos.length === 0) return []
    return savedInfos.map((info) => ({
      info,
      projectState: {
        projectEnvironments: [],
        projectEnvironmentConfig: {} as ProjectEnvironmentConfig,
        apiDetailDisplay: 'name' as const,
      },
      tabItems: [],
      activeTabKey: undefined,
      lastActiveTabKey: undefined,
      lastSubPath: '/home',
    }))
  })

  // 初始 activeProjectId 从 URL 解析
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(() => {
    const parts = pathname.split('/').filter(Boolean)
    return parts[0] === 'projects' && parts[1] ? parts[1] : null
  })

  /* ---- URL 同步 ---- */

  const setActiveProjectId = useCallback(
    (id: string | null) => {
      setActiveProjectIdState(id)
      if (id) {
        const tab = openTabs.find((t) => t.info.projectId === id)
        const subPath = tab?.lastSubPath || '/home'
        navigate(`/projects/${id}${subPath}`, { replace: true })
      } else {
        navigate('/projects', { replace: true })
      }
    },
    [navigate, openTabs],
  )

  // 监听 URL 变化：跟踪子页面路由 + 同步 activeProjectId
  useEffect(() => {
    const prevPath = prevPathRef.current
    prevPathRef.current = pathname

    const parts = pathname.split('/').filter(Boolean)
    const urlProjectId = parts[0] === 'projects' ? parts[1] : null
    const urlSubPath = parts[0] === 'projects' && parts.length >= 3
      ? '/' + parts.slice(2).join('/')
      : null

    // 跟踪当前项目的子页面路径
    if (urlProjectId && urlSubPath) {
      setOpenTabs((prev) =>
        prev.map((tab) =>
          tab.info.projectId === urlProjectId
            ? { ...tab, lastSubPath: urlSubPath }
            : tab,
        ),
      )
    }

    if (pathname === prevPath) return

    if (urlProjectId !== activeProjectId) {
      setActiveProjectIdState(urlProjectId)
    }
  }, [pathname, activeProjectId])

  /* ---- Core state updaters ---- */

  const updateProjectHelpersState = useCallback(
    (projectId: string, updater: (prev: ProjectFullState) => ProjectFullState) => {
      setOpenTabs((prev) =>
        prev.map((tab) =>
          tab.info.projectId === projectId
            ? { ...tab, projectState: updater(tab.projectState) }
            : tab,
        ),
      )
    },
    [],
  )

  const updateProjectTabState = useCallback(
    (
      projectId: string,
      updater: (
        prev: Pick<ProjectTabState, 'tabItems' | 'activeTabKey' | 'lastActiveTabKey'>,
      ) => Pick<ProjectTabState, 'tabItems' | 'activeTabKey' | 'lastActiveTabKey'>,
    ) => {
      setOpenTabs((prev) =>
        prev.map((tab) => {
          if (tab.info.projectId !== projectId) return tab
          const updated = updater({
            tabItems: tab.tabItems,
            activeTabKey: tab.activeTabKey,
            lastActiveTabKey: tab.lastActiveTabKey,
          })
          return { ...tab, ...updated }
        }),
      )
    },
    [],
  )

  /* ---- Open / Close ---- */

  const isProjectOpen = useCallback(
    (id: string) => openTabs.some((t) => t.info.projectId === id),
    [openTabs],
  )

  const openProject = useCallback(
    (info: ProjectTabInfo) => {
      setOpenTabs((prev) => {
        // 如果项目已经打开，不重复添加
        if (prev.some((t) => t.info.projectId === info.projectId)) {
          return prev
        }
        return [
          ...prev,
          {
            info,
            projectState: {
              projectEnvironments: [],
              projectEnvironmentConfig: {} as ProjectEnvironmentConfig,
              apiDetailDisplay: 'name' as const,
            },
            tabItems: createDefaultTabItems(),
            activeTabKey: CatalogType.Overview,
            lastActiveTabKey: undefined,
            lastSubPath: '/home',
          },
        ]
      })
      setActiveProjectId(info.projectId)
    },
    [setActiveProjectId],
  )

  const closeProject = useCallback(
    (id: string) => {
      setOpenTabs((prev) => prev.filter((t) => t.info.projectId !== id))
      if (activeProjectId === id) {
        const remaining = openTabs.filter((t) => t.info.projectId !== id)
        if (remaining.length > 0) {
          setActiveProjectId(remaining[0].info.projectId)
        } else {
          setActiveProjectId(null)
        }
      }
    },
    [activeProjectId, openTabs, setActiveProjectId],
  )

  const closeOtherProjects = useCallback(
    (id: string) => {
      setOpenTabs((prev) => prev.filter((t) => t.info.projectId === id))
      setActiveProjectId(id)
    },
    [setActiveProjectId],
  )

  const closeRightProjects = useCallback(
    (id: string) => {
      setOpenTabs((prev) => {
        const idx = prev.findIndex((t) => t.info.projectId === id)
        if (idx === -1) return prev
        return prev.slice(0, idx + 1)
      })
      setActiveProjectId(id)
    },
    [setActiveProjectId],
  )

  const closeAllProjects = useCallback(() => {
    setOpenTabs([])
    setActiveProjectId(null)
  }, [setActiveProjectId])

  /* ---- 持久化 openTabs 列表到 sessionStorage ---- */

  useEffect(() => {
    saveOpenTabInfoList(openTabs)
  }, [openTabs])

  /* ---- Derived value ---- */

  const activeTabState = useMemo(
    () => openTabs.find((t) => t.info.projectId === activeProjectId),
    [openTabs, activeProjectId],
  )

  const value = useMemo<ProjectTabsContextData>(
    () => ({
      openTabs,
      activeProjectId,
      setActiveProjectId,
      isProjectOpen,
      openProject,
      closeProject,
      closeOtherProjects,
      closeRightProjects,
      closeAllProjects,
      updateProjectHelpersState,
      updateProjectTabState,
      activeTabState,
    }),
    [
      openTabs,
      activeProjectId,
      setActiveProjectId,
      isProjectOpen,
      openProject,
      closeProject,
      closeOtherProjects,
      closeRightProjects,
      closeAllProjects,
      updateProjectHelpersState,
      updateProjectTabState,
      activeTabState,
    ],
  )

  return (
    <ProjectTabsContext.Provider value={value}>
      {children}
    </ProjectTabsContext.Provider>
  )
}

export const useProjectTabsContext = () => useContext(ProjectTabsContext)
