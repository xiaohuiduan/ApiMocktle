'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
    children: [
      { key: SettingsSectionKey.ImportApi, label: '导入导出接口' },
      { key: SettingsSectionKey.Share, label: '文档分享' },
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

  if (section === SettingsSectionKey.Share) {
    return {
      title: '文档分享',
      description: '分享当前项目文档，生成带密码的局域网访问链接，供同局域网用户只读查看。',
    }
  }

  return {
    title: '导入导出接口',
    description: '导入导出 OpenAPI 或 Swagger 文档，并静默合并到当前项目资源。',
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
  const currentSectionMeta = sectionMeta(selectedSection)

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
              <Tag bordered={false}>项目：{project?.name ?? '-'}</Tag>
              {projectRole ? <Tag color="blue">{roleText(projectRole)}</Tag> : <Tag>-</Tag>}
            </Space>
          </div>

          {isMembersSection
            ? (
                <>
                  {!canManageMembers && (
                    <Alert
                      className="mb-4"
                      message="你当前是查看者，仅项目拥有者可以添加或移除成员、调整角色。"
                      showIcon
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
