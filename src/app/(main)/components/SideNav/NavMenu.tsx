import { Link, useLocation } from 'react-router'

import { Space } from 'antd'
import { FileStack, FlaskConical, Settings } from 'lucide-react'

import { useStyles } from '@/hooks/useStyle'

import { css } from '@emotion/css'

interface NavItemProps {
  active?: boolean
  name: string
  icon: React.ReactNode
}

function NavItem(props: NavItemProps) {
  const { active, name, icon } = props

  const { styles } = useStyles(({ token }) => {
    return {
      item: css({
        color: active ? token.colorPrimary : token.colorTextSecondary,

        '&:hover': {
          backgroundColor: token.colorFillTertiary,
        },
      }),
    }
  })

  return (
    <div
      className={`flex cursor-pointer flex-col items-center gap-1 rounded-md p-2 ${styles.item}`}
    >
      {icon}

      <span className="text-xs">{name}</span>
    </div>
  )
}

const enum NavPath {
  Projects = '/projects',
}

export function NavMenu() {
  const { pathname } = useLocation()
  const pathList = pathname.split('/').filter(Boolean)
  const projectId = pathList.at(0) === 'projects' ? pathList.at(1) : undefined
  const homePath = projectId ? `/projects/${projectId}/home` : NavPath.Projects
  const settingsPath = projectId ? `/projects/${projectId}/settings` : NavPath.Projects
  const testsPath = projectId ? `/projects/${projectId}/tests` : NavPath.Projects

  return (
    <Space direction="vertical" size={14}>
      <Link to={homePath}>
        <NavItem
          active={projectId
            ? pathname === `/projects/${projectId}` || pathname.startsWith(homePath)
            : pathname === NavPath.Projects}
          icon={<FileStack className="size-6" />}
          name="接口管理"
        />
      </Link>

      <Link to={testsPath}>
        <NavItem
          active={pathname.startsWith(testsPath)}
          icon={<FlaskConical className="size-6" />}
          name="自动测试"
        />
      </Link>

      <Link to={settingsPath}>
        <NavItem
          active={pathname.startsWith(settingsPath)}
          icon={<Settings className="size-6" />}
          name="项目配置"
        />
      </Link>
    </Space>
  )
}
