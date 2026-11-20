import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { Button, Dropdown, Input, type MenuProps, theme, Typography } from 'antd'
import { CheckIcon, ChevronDownIcon, FolderIcon } from 'lucide-react'

import {
  ApiRequestError,
  type ProjectItem,
  requestProjects,
} from '@/components/projects/project-api'
import { useAuth } from '@/contexts/auth'
import { useProjectTabsContext } from '@/contexts/project-tabs'

type DropdownItem = Required<MenuProps>['items'][number]

function getProjectMark(name: string) {
  return name.trim().charAt(0).toUpperCase()
}

export function ProjectQuickSwitch() {
  const { t } = useTranslation()
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const { sessionId } = useAuth()
  const { activeProjectId, openProject } = useProjectTabsContext()
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [error, setError] = useState<string>()
  const [searchText, setSearchText] = useState('')

  const roleText = useMemo<Record<ProjectItem['role'], string>>(
    () => ({
      owner: t('app.projects.role.owner'),
      editor: t('app.projects.role.editor'),
      viewer: t('app.projects.role.viewer'),
    }),
    [t],
  )

  useEffect(() => {
    if (!sessionId) {
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
  }, [navigate, sessionId])

  const currentProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId),
    [activeProjectId, projects],
  )

  const filteredProjects = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()

    if (!keyword) { return projects }

    return projects.filter((p) => p.name.toLowerCase().includes(keyword))
  }, [projects, searchText])

  const items = useMemo<DropdownItem[]>(() => {
    const result: DropdownItem[] = filteredProjects.map((project) => ({
      key: project.id,
      label: (
        <div className="flex min-w-[240px] items-center gap-3 py-1">
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-bg-hover,#eef0f4)] text-xs font-semibold">
            {getProjectMark(project.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{project.name}</div>
            <div className="truncate text-xs opacity-60">{t('app.projects.quickSwitch.roleLine', { role: roleText[project.role] })}</div>
          </div>
          {activeProjectId === project.id && <CheckIcon size={14} />}
        </div>
      ),
      onClick: () => {
        openProject({
          projectId: project.id,
          name: project.name,
          icon: project.icon,
          role: project.role,
        })
      },
    }))

    if (error) {
      result.unshift({
        key: 'error',
        disabled: true,
        label: <Typography.Text type="danger">{error}</Typography.Text>,
      })
    }

    if (result.length > 0) {
      result.push({ type: 'divider' })
    }

    result.push({
      key: 'projects',
      icon: <FolderIcon size={14} />,
      label: t('app.projects.quickSwitch.viewList'),
      onClick: () => {
        navigate('/projects')
      },
    })

    return result
  }, [t, filteredProjects, error, activeProjectId, openProject, navigate, roleText])

  return (
    <Dropdown
      dropdownRender={(menu) => (
        <div>
          <div className="px-2 py-1.5">
            <Input
              allowClear
              placeholder={t('app.projects.quickSwitch.searchPlaceholder')}
              size="small"
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value) }}
            />
          </div>
          <div className="max-h-[320px] overflow-auto">{menu}</div>
        </div>
      )}
      menu={{ items }}
      trigger={['click']}
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
            {getProjectMark(currentProject?.name ?? '') || t('app.projects.quickSwitch.fallbackMark')}
          </span>
          <Typography.Text ellipsis className="!mb-0 max-w-[120px]">
            {currentProject?.name ?? t('app.projects.quickSwitch.placeholder')}
          </Typography.Text>
        </span>
        <ChevronDownIcon size={14} />
      </Button>
    </Dropdown>
  )
}
