import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { Button, Dropdown, type MenuProps, Modal, Select, theme, Tooltip } from 'antd'
import { ArrowLeftIcon, CopyIcon, PlusIcon, RefreshCw, Settings2Icon, XIcon } from 'lucide-react'

import { PageTabStatus } from '@/components/ApiTab/ApiTab.enum'
import { ProjectIcon } from '@/components/ProjectIcon'
import { ProjectQuickSwitch } from '@/components/ProjectQuickSwitch'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { type ProjectTabState, useProjectTabsContext } from '@/contexts/project-tabs'
import { useDesignStyle } from '@/hooks/useDesignStyle'
import { getPrimaryEnvironmentUrl } from '@/project-environment-utils'

/* ------------------------------------------------------------------ */
/*  TabItem — 单个标签（含右键菜单）                                     */
/* ------------------------------------------------------------------ */

interface TabItemProps {
  tab: ProjectTabState
  index: number
  total: number
  isActive: boolean
  hasUnsaved: boolean
  othersHaveDirty: boolean
  rightHaveDirty: boolean
  /** 本项目未保存的标签名称列表（用于关闭确认弹窗展示） */
  dirtyItemNames: string[]
  onSelect: () => void
  onClose: () => void
  onCloseOthers: () => void
  onCloseRight: () => void
  onCloseAll: () => void
  token: ReturnType<typeof theme.useToken>['token']
}

function TabItem({
  tab,
  index,
  total,
  isActive,
  hasUnsaved,
  othersHaveDirty,
  rightHaveDirty,
  dirtyItemNames,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseRight,
  onCloseAll,
  token,
}: TabItemProps) {
  const handleCopyName = useCallback(() => {
    void navigator.clipboard.writeText(tab.info.name).catch(() => undefined)
  }, [tab.info.name])

  const confirmIfDirty = useCallback((title: string, dirty: boolean, action: () => void, dirtyItemNames?: string[]) => {
    if (!dirty) {
      action()

      return
    }

    Modal.confirm({
      title,
      content: (
        <div>
          <p>该项目存在未保存的修改。关闭后内容会保留为草稿，重新打开项目时可继续编辑。</p>
          {dirtyItemNames && dirtyItemNames.length > 0 && (
            <div className="mt-2">
              <span className="font-medium">未保存内容：</span>
              <span className="text-[color:var(--ant-color-text-secondary)]">{dirtyItemNames.join('、')}</span>
            </div>
          )}
        </div>
      ),
      okText: '关闭',
      cancelText: '取消',
      onOk: action,
    })
  }, [])

  const menuItems = useMemo<MenuProps['items']>(
    () => [
      {
        key: 'close',
        label: '关闭标签页',
        icon: <XIcon size={14} />,
        onClick: () => {
          confirmIfDirty(`关闭项目“${tab.info.name}”？`, hasUnsaved, onClose, dirtyItemNames)
        },
      },
      {
        key: 'closeOthers',
        label: '关闭其他标签页',
        icon: <XIcon size={14} />,
        disabled: total <= 1,
        onClick: () => {
          confirmIfDirty('关闭其他项目？', othersHaveDirty, onCloseOthers)
        },
      },
      {
        key: 'closeRight',
        label: '关闭右侧标签页',
        icon: <XIcon size={14} />,
        disabled: index >= total - 1,
        onClick: () => {
          confirmIfDirty('关闭右侧项目？', rightHaveDirty, onCloseRight)
        },
      },
      { type: 'divider' },
      {
        key: 'closeAll',
        label: '全部关闭',
        icon: <XIcon size={14} />,
        onClick: () => {
          confirmIfDirty('关闭全部项目？', hasUnsaved || othersHaveDirty, onCloseAll, dirtyItemNames)
        },
      },
      { type: 'divider' },
      {
        key: 'copyName',
        label: '复制项目名称',
        icon: <CopyIcon size={14} />,
        onClick: handleCopyName,
      },
    ],
    [
      onClose,
      onCloseOthers,
      onCloseRight,
      onCloseAll,
      handleCopyName,
      dirtyItemNames,
      confirmIfDirty,
      tab.info.name,
      hasUnsaved,
      othersHaveDirty,
      rightHaveDirty,
      total,
      index,
    ],
  )

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
      <div
        className="group relative flex shrink-0 cursor-pointer select-none items-center gap-1.5"
        style={{
          height: 38,
          padding: '0 10px',
          backgroundColor: isActive ? token.colorBgContainer : 'transparent',
          borderBottom: isActive ? `2px solid ${token.colorPrimary}` : '2px solid transparent',
          color: isActive ? token.colorText : token.colorTextQuaternary,
          fontWeight: isActive ? 500 : 400,
          borderTopLeftRadius: isActive ? 6 : 0,
          borderTopRightRadius: isActive ? 6 : 0,
          marginBottom: isActive ? -1 : 0,
          transition: 'color 0.12s, background-color 0.12s',
        }}
        onAuxClick={(e) => {
          if (e.button === 1) {
            confirmIfDirty(`关闭项目“${tab.info.name}”？`, hasUnsaved, onClose, dirtyItemNames)
          }
        }}
        onClick={onSelect}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = token.colorFillTertiary
            e.currentTarget.style.color = token.colorTextSecondary
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = token.colorTextQuaternary
          }
        }}
      >
        <ProjectIcon icon={tab.info.icon} size={14} />

        <span className="max-w-[120px] truncate text-sm">{tab.info.name}</span>

        {hasUnsaved && (
          <span
            aria-label="有未保存修改"
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: token.colorWarning }}
          />
        )}

        {/* 关闭按钮：活跃标签始终显示，不活跃标签 hover 时显示 */}
        <button
          aria-label="关闭标签页"
          className={`flex size-8 shrink-0 items-center justify-center rounded transition-all duration-100 ${
            isActive ? '' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
          }`}
          style={{
            color: isActive ? token.colorTextTertiary : token.colorTextSecondary,
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            confirmIfDirty(`关闭项目“${tab.info.name}”？`, hasUnsaved, onClose, dirtyItemNames)
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = token.colorBgTextHover
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
          }}
        >
          <XIcon size={28} />
        </button>
      </div>
    </Dropdown>
  )
}

/* ------------------------------------------------------------------ */
/*  ProjectTabBar                                                      */
/* ------------------------------------------------------------------ */

export function ProjectTabBar() {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const { isGlassStyle } = useDesignStyle()
  const [refreshing, setRefreshing] = useState(false)
  const { reloadState, projectEnvironments, currentProjectEnvironmentId, setCurrentProjectEnvironmentId } = useMenuHelpersContext()
  const {
    openTabs,
    activeProjectId,
    setActiveProjectId,
    closeProject,
    closeOtherProjects,
    closeRightProjects,
    closeAllProjects,
  } = useProjectTabsContext()

  if (openTabs.length === 0) { return null }

  const hasUnsavedTab = (tab: ProjectTabState) => {
    return tab.tabItems.some((item) => {
      return item.data?.editStatus === 'changed' || item.data?.tabStatus === PageTabStatus.Create
    })
  }

  /** 项目内未保存的标签名称列表（用于关闭确认弹窗） */
  const dirtyTabNames = (tab: ProjectTabState): string[] => {
    return tab.tabItems
      .filter((item) => {
        return item.data?.editStatus === 'changed' || item.data?.tabStatus === PageTabStatus.Create
      })
      .map((item) => (typeof item.label === 'string' ? item.label : item.key))
  }

  return (
    <div
      className="flex shrink-0 items-stretch overflow-hidden"
      style={{
        height: 38,
        backgroundColor: isGlassStyle ? 'var(--ds-bg-surface)' : token.colorFillAlter,
        backdropFilter: isGlassStyle ? 'blur(var(--ds-blur))' : undefined,
        WebkitBackdropFilter: isGlassStyle ? 'blur(var(--ds-blur))' : undefined,
        borderBottom: isGlassStyle
          ? 'var(--ds-border-subtle)'
          : `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      {/* 标签列表 */}
      <div
        className="flex flex-1 items-stretch overflow-x-auto"
        style={{
          maskImage:
            'linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
        }}
      >
        {openTabs.map((tab, index) => {
          const isActive = tab.info.projectId === activeProjectId
          const dirtyNames = dirtyTabNames(tab)
          const dirty = dirtyNames.length > 0
          const othersDirty = openTabs.some(
            (t) => t.info.projectId !== tab.info.projectId && hasUnsavedTab(t),
          )
          const rightDirty = openTabs.slice(index + 1).some((t) => hasUnsavedTab(t))

          return (
            <TabItem
              key={tab.info.projectId}
              dirtyItemNames={dirtyNames}
              hasUnsaved={dirty}
              index={index}
              isActive={isActive}
              othersHaveDirty={othersDirty}
              rightHaveDirty={rightDirty}
              tab={tab}
              token={token}
              total={openTabs.length}
              onClose={() => { closeProject(tab.info.projectId) }}
              onCloseAll={closeAllProjects}
              onCloseOthers={() => { closeOtherProjects(tab.info.projectId) }}
              onCloseRight={() => { closeRightProjects(tab.info.projectId) }}
              onSelect={() => { setActiveProjectId(tab.info.projectId) }}
            />
          )
        })}
      </div>

      {/* 新建项目按钮 */}
      <button
        className="flex shrink-0 cursor-pointer items-center justify-center transition-transform duration-150 hover:scale-110 active:scale-95"
        style={{
          width: 32,
          height: 32,
          margin: '3px 6px',
          alignSelf: 'center',
          color: token.colorTextSecondary,
          borderRadius: 6,
          border: 'none',
          backgroundColor: 'transparent',
        }}
        title="新建项目"
        onClick={() => { void navigate('/projects?create=1') }}
      >
        <PlusIcon size={16} />
      </button>

      {/* 右侧工具栏 */}
      <div className="ml-auto flex shrink-0 items-center gap-1 px-2">
        <ProjectQuickSwitch />
        <>
          <span className="shrink-0 text-xs" style={{ color: token.colorTextSecondary }}>环境</span>
          {projectEnvironments.length > 0 && (
            <Select
              className="min-w-[140px]"
              options={projectEnvironments.map((env) => ({
                value: env.id,
                label: (
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{env.name}</span>
                    {getPrimaryEnvironmentUrl(env) && (
                      <span className="truncate text-xs opacity-50">{getPrimaryEnvironmentUrl(env)}</span>
                    )}
                  </span>
                ),
              }))}
              placeholder="选择环境"
              size="small"
              value={currentProjectEnvironmentId}
              onChange={(envId) => { setCurrentProjectEnvironmentId(envId) }}
            />
          )}
          <Tooltip title="管理环境">
            <Button
              icon={<Settings2Icon size={14} />}
              size="small"
              onClick={() => {
                if (activeProjectId) {
                  navigate(`/projects/${activeProjectId}/settings?section=environments`)
                }
              }}
            />
          </Tooltip>
        </>
        <Button
          icon={<RefreshCw size={14} />}
          loading={refreshing}
          size="small"
          onClick={() => {
            void (async () => {
              setRefreshing(true)
              await reloadState()
              setRefreshing(false)
            })()
          }}
        >
          刷新
        </Button>
        <Button icon={<ArrowLeftIcon size={14} />} size="small" onClick={() => { void navigate('/projects') }}>
          项目列表
        </Button>
      </div>
    </div>
  )
}
