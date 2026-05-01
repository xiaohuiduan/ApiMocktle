import { useEffect, useMemo, useState } from 'react'

import { Button, Dropdown, theme, Typography, type MenuProps } from 'antd'
import { CheckIcon, ChevronDownIcon, FolderIcon } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'

import { useAuth } from '@/contexts/auth'
import {
  ApiRequestError,
  requestProjects,
  type ProjectItem,
} from '@/components/projects/project-api'

type DropdownItem = Required<MenuProps>['items'][number]
const roleText: Record<ProjectItem['role'], string> = {
  owner: '拥有者',
  editor: '编辑者',
  viewer: '查看者',
}

function resolveProjectId(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  return parts.at(0) === 'projects' ? parts.at(1) : undefined
}

function getProjectMark(name: string) {
  return name.trim().charAt(0).toUpperCase() || '项'
}

function buildProjectItems(payload: {
  currentProjectId?: string
  error?: string
  navigate: ReturnType<typeof useNavigate>
  projects: ProjectItem[]
}) {
  const items: DropdownItem[] = payload.projects.map((project) => ({
    key: project.id,
    label: (
      <div className="flex min-w-[240px] items-center gap-3 py-1">
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-black/5 text-xs font-semibold">
          {getProjectMark(project.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{project.name}</div>
          <div className="truncate text-xs opacity-60">角色：{roleText[project.role]}</div>
        </div>
        {payload.currentProjectId === project.id && <CheckIcon size={14} />}
      </div>
    ),
    onClick: () => {
      payload.navigate(`/projects/${project.id}/home`)
    },
  }))

  if (payload.error) {
    items.unshift({
      key: 'error',
      disabled: true,
      label: <Typography.Text type="danger">{payload.error}</Typography.Text>,
    })
  }

  if (items.length > 0) {
    items.push({ type: 'divider' })
  }

  items.push({
    key: 'projects',
    icon: <FolderIcon size={14} />,
    label: '查看项目列表',
    onClick: () => {
      payload.navigate('/projects')
    },
  })

  return items
}

export function ProjectQuickSwitch() {
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { sessionId } = useAuth()
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [error, setError] = useState<string>()
  const projectId = useMemo(() => resolveProjectId(pathname), [pathname])

  useEffect(() => {
    if (!projectId || !sessionId) {
      setProjects([])
      setError(undefined)
      return
    }

    let cancelled = false

    const loadProjects = async () => {
      try {
        const nextProjects = await requestProjects(sessionId)

        if (cancelled) {
          return
        }

        setProjects(nextProjects)
        setError(undefined)
      }
      catch (error) {
        if (cancelled) {
          return
        }

        if (error instanceof ApiRequestError && error.status === 401) {
          navigate('/login', { replace: true })
          return
        }

        console.error(error)
        setProjects([])
        setError((error as Error).message)
      }
    }

    void loadProjects()

    return () => {
      cancelled = true
    }
  }, [navigate, projectId, sessionId])

  const currentProject = useMemo(
    () => projects.find((project) => project.id === projectId),
    [projectId, projects],
  )

  if (!projectId) {
    return null
  }

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: buildProjectItems({
          currentProjectId: projectId,
          error,
          navigate,
          projects,
        }),
      }}
    >
      <Button
        className="min-w-[160px] justify-between"
        style={{
          height: 32,
          borderColor: token.colorBorderSecondary,
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
            style={{
              color: token.colorPrimary,
              backgroundColor: token.colorPrimaryBg,
            }}
          >
            {getProjectMark(currentProject?.name ?? '项')}
          </span>
          <Typography.Text ellipsis className="max-w-[120px] !mb-0">
            {currentProject?.name ?? '快速切换项目'}
          </Typography.Text>
        </span>
        <ChevronDownIcon size={14} />
      </Button>
    </Dropdown>
  )
}
