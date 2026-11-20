'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useSearchParams } from 'react-router'

import {
  Alert,
  ConfigProvider,
  Menu,
  type MenuProps,
  message,
  Space,
  Tag,
  theme,
  Typography,
} from 'antd'
import type { TFunction } from 'i18next'
import { LayersIcon, SettingsIcon } from 'lucide-react'

import { api } from '@/api-client'
import { ApiTransferPanel } from '@/components/project-settings/ApiTransferPanel'
import { ProjectEnvironmentsPanel } from '@/components/project-settings/ProjectEnvironmentsPanel'
import {
  type MemberItem,
  ProjectMembersSection,
  type Role,
} from '@/components/project-settings/ProjectMembersSection'
import { ProjectSharePanel } from '@/components/project-settings/ProjectSharePanel'
import { useAuth } from '@/contexts/auth'

import { PanelLayout } from '../components/PanelLayout'

type MenuItem = Required<MenuProps>['items'][number]

const enum SettingsSectionKey {
  Members = 'members',
  Environments = 'environments',
  ImportApi = 'import-api',
  Share = 'share',
}

interface ProjectInfo {
  id: string
  name: string
  ownerId: string
  createdAt: string
}

/**
 * 项目设置左侧菜单。
 *
 * 必须是函数：分组与条目文案随语言变化，模块顶层求值会在加载时固定住。
 * 消费方在渲染期用 `useMemo(() => createItems(t), [t])`。
 */
function createItems(t: TFunction): MenuItem[] {
  return [
    {
      key: 'g1',
      label: (
        <div className="flex items-center gap-2">
          <SettingsIcon size={16} />
          {t('settings.page.groupGeneral')}
        </div>
      ),
      type: 'group',
      children: [
        { key: SettingsSectionKey.Members, label: t('settings.page.members') },
        { key: SettingsSectionKey.Environments, label: t('settings.page.environments') },
      ],
    },
    {
      key: 'g2',
      label: (
        <div className="flex items-center gap-2">
          <LayersIcon size={16} />
          {t('settings.page.groupResources')}
        </div>
      ),
      type: 'group',
      children: [
        { key: SettingsSectionKey.ImportApi, label: t('settings.page.transfer') },
        { key: SettingsSectionKey.Share, label: t('settings.page.share') },
      ],
    },
  ]
}

function sectionMeta(t: TFunction, section: SettingsSectionKey) {
  if (section === SettingsSectionKey.Members) {
    return {
      title: t('settings.page.members'),
      description: t('settings.page.membersDescription'),
    }
  }

  if (section === SettingsSectionKey.Environments) {
    return {
      title: t('settings.page.environments'),
      description: t('settings.page.environmentsDescription'),
    }
  }

  if (section === SettingsSectionKey.Share) {
    return {
      title: t('settings.page.share'),
      description: t('settings.page.shareDescription'),
    }
  }

  return {
    title: t('settings.page.transfer'),
    description: t('settings.page.transferDescription'),
  }
}

function roleText(t: TFunction, role: Role) {
  if (role === 'owner') {
    return t('settings.members.roleOwner')
  }

  if (role === 'editor') {
    return t('settings.members.roleEditor')
  }

  return t('settings.members.roleViewer')
}

export default function SettingsPage() {
  const { t } = useTranslation()
  const { token } = theme.useToken()
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { sessionId } = useAuth()
  const [msgApi, contextHolder] = message.useMessage()
  const [loading, setLoading] = useState(false)

  // 分区以 URL ?section= 为单一数据源:深链接直达任意分区,菜单点击回写 URL(刷新/后退不丢)
  const selectedSection = useMemo<SettingsSectionKey>(() => {
    const section = searchParams.get('section')

    if (
      section === SettingsSectionKey.Environments
      || section === SettingsSectionKey.ImportApi
      || section === SettingsSectionKey.Share
    ) {
      return section
    }

    return SettingsSectionKey.Members
  }, [searchParams])
  const [members, setMembers] = useState<MemberItem[]>([])
  const [project, setProject] = useState<ProjectInfo>()
  const [projectRole, setProjectRole] = useState<Role>()
  const [currentUserId, setCurrentUserId] = useState<string>()

  const projectId = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean)

    return parts.at(0) === 'projects' ? parts.at(1) : undefined
  }, [pathname])

  const canManageMembers = Boolean(currentUserId && project?.ownerId === currentUserId)
  const canManageEnvironments = projectRole === 'owner' || projectRole === 'editor'
  const isMembersSection = selectedSection === SettingsSectionKey.Members
  const isEnvironmentsSection = selectedSection === SettingsSectionKey.Environments
  const isShareSection = selectedSection === SettingsSectionKey.Share
  const currentSectionMeta = sectionMeta(t, selectedSection)
  // t 作为依赖：语言切换时 t 引用变化，触发菜单与分区文案重算
  const items = useMemo(() => createItems(t), [t])

  const fetchData = useCallback(async () => {
    if (!projectId || !sessionId) {
      return
    }

    setLoading(true)

    try {
      const payload = await api<{
        currentUserId: string
        project: ProjectInfo
        role: Role
        members?: MemberItem[]
      }>('get_project', {
        sessionId,
        projectId,
      })

      setProject(payload.project)
      setProjectRole(payload.role)
      setCurrentUserId(payload.currentUserId)
      setMembers(payload.members ?? [])
    }
    catch (error) {
      msgApi.error((error as Error).message)
    }
    finally {
      setLoading(false)
    }
  }, [msgApi, projectId, sessionId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  return (
    <PanelLayout
      layoutName={t('settings.page.layoutName')}
      left={(
        <div>
          <ConfigProvider
            theme={{
              components: {
                Menu: {
                  activeBarBorderWidth: 0,
                  itemHeight: 32,
                  itemSelectedBg: token.colorBgTextHover,
                  itemActiveBg: token.colorBgTextHover,
                  itemSelectedColor: token.colorText,
                },
              },
            }}
          >
            <Menu
              items={items}
              mode="inline"
              selectedKeys={[selectedSection]}
              onClick={({ key }) => {
                setSearchParams(
                  key === SettingsSectionKey.Members ? {} : { section: key },
                  { replace: true },
                )
              }}
            />
          </ConfigProvider>
        </div>
      )}
      right={(
        <div className="p-5">
          {contextHolder}

          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <Typography.Title level={4}>{currentSectionMeta.title}</Typography.Title>
              <Typography.Paragraph className="!mb-0" type="secondary">
                {currentSectionMeta.description}
              </Typography.Paragraph>
            </div>
            <Space wrap size={8}>
              <Tag bordered={false}>{t('settings.page.projectTag', { name: project?.name ?? '-' })}</Tag>
              {projectRole ? <Tag color="blue">{roleText(t, projectRole)}</Tag> : <Tag>-</Tag>}
            </Space>
          </div>

          {isMembersSection
            ? (
                <>
                  {!canManageMembers && (
                    <Alert
                      showIcon
                      className="mb-4"
                      message={t('settings.page.viewerAlert')}
                      type="info"
                    />
                  )}
                  <ProjectMembersSection
                    canManageMembers={canManageMembers}
                    loading={loading}
                    members={members}
                    projectId={projectId}
                    projectOwnerId={project?.ownerId}
                    onRefresh={fetchData}
                  />
                </>
              )
            : isEnvironmentsSection
              ? (
                  <ProjectEnvironmentsPanel editable={canManageEnvironments} />
                )
              : isShareSection
                ? (
                    <ProjectSharePanel projectId={projectId ?? ''} />
                  )
                : <ApiTransferPanel />}
        </div>
      )}
    />
  )
}
