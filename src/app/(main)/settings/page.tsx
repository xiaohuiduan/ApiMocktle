'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  Button,
  Card,
  ConfigProvider,
  Form,
  InputNumber,
  Menu,
  type MenuProps,
  Space,
  Switch,
  Tag,
  theme,
  Typography,
  message,
  Alert,
} from 'antd'
import { Copy, LayersIcon, Play, SettingsIcon, Square } from 'lucide-react'
import { useLocation } from 'react-router'
import { invoke } from '@tauri-apps/api/core'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'
import { ProjectEnvironmentsPanel } from '@/components/project-settings/ProjectEnvironmentsPanel'
import { ApiTransferPanel } from '@/components/project-settings/ApiTransferPanel'
import { ExportPanel } from '@/components/project-settings/ExportPanel'
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
  McpServer = 'mcp-server',
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
  {
    key: 'g4',
    label: (
      <div className="flex items-center gap-2">
        <Play size={16} />
        MCP 服务
      </div>
    ),
    type: 'group',
    children: [
      { key: SettingsSectionKey.McpServer, label: 'MCP 服务配置' },
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

  if (section === SettingsSectionKey.McpServer) {
    return {
      title: 'MCP 服务配置',
      description: '配置 Model Context Protocol 服务，让 AI 工具（如 Claude Desktop）可以调用自动化测试功能。',
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
                  : selectedSection === SettingsSectionKey.McpServer
                    ? (
                        <McpServerPanel />
                      )
                    : null}
        </div>
      )}
    />
  )
}

// ==================== MCP Server Panel ====================

interface McpServerStatus {
  running: boolean
  port: number
}

interface McpServerConfig {
  enabled: boolean
  port: number
  auto_start: boolean
}

function McpServerPanel() {
  const [status, setStatus] = useState<McpServerStatus>({ running: false, port: 0 })
  const [config, setConfig] = useState<McpServerConfig>({ enabled: false, port: 14203, auto_start: false })
  const [loading, setLoading] = useState(false)
  const [msgApi, contextHolder] = message.useMessage()

  const fetchStatus = useCallback(async () => {
    try {
      const result = await invoke<{ ok: boolean; data?: McpServerStatus }>('get_mcp_server_status')
      if (result.ok && result.data) {
        setStatus(result.data)
      }
    } catch (err) {
      console.error('Failed to fetch MCP status:', err)
    }
  }, [])

  const fetchConfig = useCallback(async () => {
    try {
      const result = await invoke<{ ok: boolean; data?: McpServerConfig }>('get_mcp_server_config')
      if (result.ok && result.data) {
        setConfig(result.data)
      }
    } catch (err) {
      console.error('Failed to fetch MCP config:', err)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchConfig()
    // Poll status every 5 seconds
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [fetchStatus, fetchConfig])

  const handleStart = async () => {
    setLoading(true)
    try {
      const result = await invoke<{ ok: boolean; data?: McpServerStatus }>('start_mcp_server', {
        port: config.port,
      })
      if (result.ok && result.data) {
        setStatus(result.data)
        msgApi.success('MCP 服务已启动')
      }
    } catch (err) {
      msgApi.error('启动失败: ' + String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)
    try {
      const result = await invoke<{ ok: boolean; data?: McpServerStatus }>('stop_mcp_server')
      if (result.ok && result.data) {
        setStatus(result.data)
        msgApi.success('MCP 服务已停止')
      }
    } catch (err) {
      msgApi.error('停止失败: ' + String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleSaveConfig = async () => {
    try {
      await invoke('save_mcp_server_config', { config })
      msgApi.success('配置已保存')
    } catch (err) {
      msgApi.error('保存失败: ' + String(err))
    }
  }

  const handleCopyConfig = () => {
    const mcpConfig = {
      mcpServers: {
        apimocktle: {
          url: `http://localhost:${status.port}`,
        },
      },
    }
    navigator.clipboard.writeText(JSON.stringify(mcpConfig, null, 2))
    msgApi.success('配置已复制到剪贴板')
  }

  return (
    <div>
      {contextHolder}

      <Card title="服务状态" className="mb-4">
        <div className="mb-4 flex items-center justify-between">
          <Space>
            <Tag color={status.running ? 'success' : 'default'}>
              {status.running ? '运行中' : '已停止'}
            </Tag>
            {status.running && (
              <Tag>端口: {status.port}</Tag>
            )}
          </Space>
          <Space>
            {status.running ? (
              <Button
                danger
                icon={<Square />}
                onClick={handleStop}
                loading={loading}
              >
                停止服务
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<Play />}
                onClick={handleStart}
                loading={loading}
              >
                启动服务
              </Button>
            )}
          </Space>
        </div>

        {status.running && (
          <Alert
            type="success"
            showIcon
            message="MCP 服务运行中"
            description={
              <div>
                <p>服务地址: <code>http://localhost:{status.port}</code></p>
                <Button
                  icon={<Copy />}
                  size="small"
                  onClick={handleCopyConfig}
                >
                  复制 MCP 配置
                </Button>
              </div>
            }
          />
        )}
      </Card>

      <Card title="服务配置">
        <Form layout="vertical">
          <Form.Item label="启用 MCP 服务">
            <Switch
              checked={config.enabled}
              onChange={(checked) => setConfig({ ...config, enabled: checked })}
            />
          </Form.Item>
          <Form.Item label="端口号">
            <InputNumber
              value={config.port}
              onChange={(value) => setConfig({ ...config, port: value || 14203 })}
              min={1024}
              max={65535}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item label="随应用启动">
            <Switch
              checked={config.auto_start}
              onChange={(checked) => setConfig({ ...config, auto_start: checked })}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleSaveConfig}>
              保存配置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="使用说明" className="mt-4">
        <Typography.Paragraph>
          MCP (Model Context Protocol) 服务允许 AI 工具（如 Claude Desktop）调用自动化测试功能。
        </Typography.Paragraph>
        <Typography.Paragraph>
          <ol>
            <li>点击"启动服务"开启 MCP 服务</li>
            <li>点击"复制 MCP 配置"获取配置信息</li>
            <li>将配置粘贴到 Claude Desktop 的配置文件中</li>
            <li>重启 Claude Desktop 即可使用</li>
          </ol>
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          配置文件位置: <code>~/.claude/claude_desktop_config.json</code>
        </Typography.Paragraph>
      </Card>
    </div>
  )
}
