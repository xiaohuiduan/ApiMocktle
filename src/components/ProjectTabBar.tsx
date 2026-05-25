import { useCallback, useMemo, useState } from 'react'

import { Button, Dropdown, theme } from 'antd'
import { ArrowLeftIcon, CopyIcon, PlusIcon, RefreshCw, XIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import type { MenuProps } from 'antd'

import { ProjectIcon, getIconColor } from '@/components/ProjectIcon'
import { ProjectQuickSwitch } from '@/components/ProjectQuickSwitch'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useProjectTabsContext } from '@/contexts/project-tabs'
import type { ProjectTabState } from '@/contexts/project-tabs'

/* ------------------------------------------------------------------ */
/*  TabItem — 单个标签（含右键菜单）                                     */
/* ------------------------------------------------------------------ */

interface TabItemProps {
  tab: ProjectTabState
  index: number
  total: number
  isActive: boolean
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
  onSelect,
  onClose,
  onCloseOthers,
  onCloseRight,
  onCloseAll,
  token,
}: TabItemProps) {
  const handleCopyName = useCallback(() => {
    navigator.clipboard.writeText(tab.info.name).catch(() => {})
  }, [tab.info.name])

  const menuItems = useMemo<MenuProps['items']>(
    () => [
      {
        key: 'close',
        label: '关闭标签页',
        icon: <XIcon size={14} />,
        onClick: onClose,
      },
      {
        key: 'closeOthers',
        label: '关闭其他标签页',
        icon: <XIcon size={14} />,
        disabled: total <= 1,
        onClick: onCloseOthers,
      },
      {
        key: 'closeRight',
        label: '关闭右侧标签页',
        icon: <XIcon size={14} />,
        disabled: index >= total - 1,
        onClick: onCloseRight,
      },
      { type: 'divider' },
      {
        key: 'closeAll',
        label: '全部关闭',
        icon: <XIcon size={14} />,
        onClick: onCloseAll,
      },
      { type: 'divider' },
      {
        key: 'copyName',
        label: '复制项目名称',
        icon: <CopyIcon size={14} />,
        onClick: handleCopyName,
      },
    ],
    [onClose, onCloseOthers, onCloseRight, onCloseAll, handleCopyName, total, index],
  )

  const iconColor = getIconColor(tab.info.icon || '')

  return (
    <Dropdown trigger={['contextMenu']} menu={{ items: menuItems }}>
      <div
        className="group relative flex shrink-0 cursor-pointer items-center gap-1.5 select-none"
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
        onClick={onSelect}
        onAuxClick={(e) => {
          if (e.button === 1) onClose()
        }}
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

        {/* 关闭按钮：活跃标签始终显示，不活跃标签 hover 时显示 */}
        <span
          className={`flex size-4 shrink-0 items-center justify-center rounded transition-all duration-100 ${
            isActive ? '' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{
            color: isActive ? token.colorTextTertiary : token.colorTextQuaternary,
            backgroundColor: 'transparent',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(0,0,0,0.06)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
          }}
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          role="button"
          tabIndex={-1}
        >
          <XIcon size={12} />
        </span>
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
  const [refreshing, setRefreshing] = useState(false)
  const { reloadState } = useMenuHelpersContext()
  const {
    openTabs,
    activeProjectId,
    setActiveProjectId,
    closeProject,
    closeOtherProjects,
    closeRightProjects,
    closeAllProjects,
  } = useProjectTabsContext()

  if (openTabs.length === 0) return null

  return (
    <div
      className="flex shrink-0 items-stretch overflow-hidden"
      style={{
        height: 38,
        backgroundColor: token.colorFillAlter,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
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

          return (
            <TabItem
              key={tab.info.projectId}
              tab={tab}
              index={index}
              total={openTabs.length}
              isActive={isActive}
              onSelect={() => setActiveProjectId(tab.info.projectId)}
              onClose={() => closeProject(tab.info.projectId)}
              onCloseOthers={() => closeOtherProjects(tab.info.projectId)}
              onCloseRight={() => closeRightProjects(tab.info.projectId)}
              onCloseAll={closeAllProjects}
              token={token}
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
        onClick={() => navigate('/projects')}
        title="打开项目"
      >
        <PlusIcon size={16} />
      </button>

      {/* 右侧工具栏 */}
      <div className="ml-auto flex shrink-0 items-center gap-1 px-2">
        <ProjectQuickSwitch />
        <Button
          icon={<RefreshCw size={14} />}
          size="small"
          loading={refreshing}
          onClick={async () => {
            setRefreshing(true)
            await reloadState()
            setRefreshing(false)
          }}
        >
          刷新
        </Button>
        <Button icon={<ArrowLeftIcon size={14} />} size="small" onClick={() => navigate('/projects')}>
          项目列表
        </Button>
      </div>
    </div>
  )
}
