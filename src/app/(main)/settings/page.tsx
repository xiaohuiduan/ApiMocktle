'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  ConfigProvider,
  Menu,
  type MenuProps,
  Space,
  Tag,
  theme,
  Typography,
  message,
} from 'antd'
import { LayersIcon, SettingsIcon } from 'lucide-react'
import { useLocation } from 'react-router'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'
import { ProjectEnvironmentsPanel } from '@/components/project-settings/ProjectEnvironmentsPanel'
import { ApiTransferPanel } from '@/components/project-settings/ApiTransferPanel'
import { ExportPanel } from '@/components/project-settings/ExportPanel'
import { TokenPanel } from '@/components/project-settings/TokenPanel'
import {
  ProjectMembersSection,
  type MemberItem,
  type Role,
} from '@/components/project-settings/ProjectMembersSection'

import { PanelLayout } from '../components/PanelLayout'

type MenuItem = Required<MenuProps>['items'][number]

const enum SettingsSectionKey {
  Members = 'members',
  Environments = 'environments',
  ImportApi = 'import-api',
  ShareApi = 'share-api',
  TokenConfig = 'token-config',
}

interface ProjectInfo {
  id: string
  name: string
  ownerId: string
  createdAt: string
}

const items: MenuItem[] = [
  {
    key: 'g1',
    label: (
      <div className="flex items-center gap-2">
        <SettingsIcon size={16} />
        通用设置
      </div>
    ),
    type: 'group',
    children: [
      { key: SettingsSectionKey.Members, label: '成员管理' },
      { key: SettingsSectionKey.Environments, label: '环境管理' },
      { key: SettingsSectionKey.TokenConfig, label: '同步配置' },
    ],
  },
  {
    key: 'g2',
    label: (
      <div className="flex items-center gap-2">
        <LayersIcon size={16} />
        项目资源
      </div>
    ),
    type: 'group',
    children: [{ key: SettingsSectionKey.ImportApi, label: '导入导出接口' }],
  },
  {
    key: 'g3',
    label: (
      <div className="flex items-center gap-2">
        <LayersIcon size={16} />
        协同共享
      </div>
    ),
    type: 'group',
    children: [
      { key: SettingsSectionKey.ShareApi, label: '接口分享' },
    ],
  },
]

function sectionMeta(section: SettingsSectionKey) {
  if (section === SettingsSectionKey.Members) {
    return {
      title: '成员管理',
      description: '管理项目成员及角色权限。',
    }
  }

  if (section === SettingsSectionKey.Environments) {
    return {
      title: '环境管理',
      description: '统一维护项目环境、前置 URL、全局变量与密钥。',
    }
  }

  if (section === SettingsSectionKey.ShareApi) {
    return {
      title: '接口分享',
      description: '选择接口导出为 MARKDOWN 文档，可离线查看完整的 API 接口文档。',
    }
  }

  return {
    title: '导入导出接口',
    description: '导入导出 OpenAPI 或 Postman 文档，并静默合并到当前项目资源。',
  }
}

function tokenSectionMeta() {
  return {
    title: '同步配置',
    description: '管理项目 API Token，用于 EasyAPI 等第三方插件的接口导入。',
  }
}

function roleText(role: Role) {
  if (role === 'owner') {
    return '拥有者'
  }

  if (role === 'editor') {
    return '编辑者'
  }

  return '查看者'
}

export default function SettingsPage() {
  const { token } = theme.useToken()
  const { pathname, search } = useLocation()
  const { sessionId } = useAuth()
  const [msgApi, contextHolder] = message.useMessage()
  const [loading, setLoading] = useState(false)
  const [selectedSection, setSelectedSection] = useState<SettingsSectionKey>(() => {
    const params = new URLSearchParams(search)
    const section = params.get('section')

    if (section === SettingsSectionKey.Environments) {
      return SettingsSectionKey.Environments
    }

    if (section === SettingsSectionKey.ImportApi) {
      return SettingsSectionKey.ImportApi
    }

    if (section === SettingsSectionKey.ShareApi) {
      return SettingsSectionKey.ShareApi
    }

    if (section === SettingsSectionKey.TokenConfig) {
      return SettingsSectionKey.TokenConfig
    }

    return SettingsSectionKey.Members
  })
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
  const currentSectionMeta = selectedSection === SettingsSectionKey.TokenConfig
    ? tokenSectionMeta()
    : sectionMeta(selectedSection)

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

  useEffect(() => {
    const params = new URLSearchParams(search)
    const section = params.get('section')

    if (section === SettingsSectionKey.Environments) {
      setSelectedSection(SettingsSectionKey.Environments)
      return
    }

    if (section === SettingsSectionKey.ImportApi) {
      setSelectedSection(SettingsSectionKey.ImportApi)
      return
    }

    if (section === SettingsSectionKey.ShareApi) {
      setSelectedSection(SettingsSectionKey.ShareApi)
      return
    }

    if (section === SettingsSectionKey.TokenConfig) {
      setSelectedSection(SettingsSectionKey.TokenConfig)
      return
    }

    setSelectedSection(SettingsSectionKey.Members)
  }, [search])

  return (
    <PanelLayout
      layoutName="项目设置"
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
                setSelectedSection(key as SettingsSectionKey)
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
            <Space size={8} wrap>
              <Tag bordered={false}>项目：{project?.name ?? '-'}</Tag>
              {projectRole ? <Tag color="blue">{roleText(projectRole)}</Tag> : <Tag>-</Tag>}
            </Space>
          </div>

          {isMembersSection
            ? (
                <ProjectMembersSection
                  canManageMembers={canManageMembers}
                  loading={loading}
                  members={members}
                  projectId={projectId}
                  projectOwnerId={project?.ownerId}
                  onRefresh={fetchData}
                />
              )
            : isEnvironmentsSection
              ? (
                  <ProjectEnvironmentsPanel editable={canManageEnvironments} />
                )
              : selectedSection === SettingsSectionKey.ImportApi
                ? (
                <ApiTransferPanel />
                  )
                : selectedSection === SettingsSectionKey.ShareApi
                  ? (
                      <ExportPanel projectId={projectId} />
                    )
                  : selectedSection === SettingsSectionKey.TokenConfig
                    ? (
                        <TokenPanel projectId={projectId} />
                      )
                    : null}
        </div>
      )}
    />
  )
}
