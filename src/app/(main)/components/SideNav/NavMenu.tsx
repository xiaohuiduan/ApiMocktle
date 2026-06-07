import { Space } from 'antd'
import { Link, useLocation } from 'react-router'

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
          active={pathname === homePath}
          icon={(
            <svg
              aria-hidden="true"
              className="size-6"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                clipRule="evenodd"
                d="M20 10H4v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8ZM9 13v-1h6v1c0 .6-.4 1-1 1h-4a1 1 0 0 1-1-1Z"
                fillRule="evenodd"
              />
              <path d="M2 6c0-1.1.9-2 2-2h16a2 2 0 1 1 0 4H4a2 2 0 0 1-2-2Z" />
            </svg>
          )}
          name="接口管理"
        />
      </Link>

      <Link to={testsPath}>
        <NavItem
          active={pathname.startsWith(testsPath)}
          icon={(
            <svg
              aria-hidden="true"
              className="size-6"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                clipRule="evenodd"
                d="M12 2a1 1 0 0 1 .707.293l7 7a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414-1.414L17.586 12l-6.293-6.293A1 1 0 0 1 12 2ZM5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a1 1 0 1 1 2 0v7a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4h7a1 1 0 1 1 0 2H5Z"
                fillRule="evenodd"
              />
            </svg>
          )}
          name="自测"
        />
      </Link>

      <Link to={settingsPath}>
        <NavItem
          active={pathname === settingsPath}
          icon={(
            <svg
              aria-hidden="true"
              className="size-6"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                clipRule="evenodd"
                d="M9.6 2.6A2 2 0 0 1 11 2h2a2 2 0 0 1 2 2l.5.3a2 2 0 0 1 2.9 0l1.4 1.3a2 2 0 0 1 0 2.9l.1.5h.1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2l-.3.5a2 2 0 0 1 0 2.9l-1.3 1.4a2 2 0 0 1-2.9 0l-.5.1v.1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2l-.5-.3a2 2 0 0 1-2.9 0l-1.4-1.3a2 2 0 0 1 0-2.9l-.1-.5H4a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2l.3-.5a2 2 0 0 1 0-2.9l1.3-1.4a2 2 0 0 1 2.9 0l.5-.1V4c0-.5.2-1 .6-1.4ZM8 12a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
                fillRule="evenodd"
              />
            </svg>
          )}
          name="项目配置"
        />
      </Link>
    </Space>
  )
}
