'use client'

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { SearchOutlined } from '@ant-design/icons'
import { show } from '@ebay/nice-modal-react'
import { Button, Card, Empty, Form, Input, message, Modal, Space, Spin, theme, Tooltip, Typography } from 'antd'
import { SettingsIcon } from 'lucide-react'

import { ModalSettings } from '@/components/modals/ModalSettings'
import { ParticleCanvas } from '@/components/ParticleCanvas'
import { getIconColor, ICON_CATEGORIES, ICON_MAP, ICON_OPTIONS, kebabToPascal, ProjectIcon } from '@/components/ProjectIcon'
import {
  ApiRequestError,
  type ProjectItem,
  requestCreateProject,
  requestDeleteProject,
  requestProjects,
  requestUpdateProject,
} from '@/components/projects/project-api'
import { UserMenu } from '@/components/UserMenu'
import { useAuth } from '@/contexts/auth'
import { useProjectTabsContext } from '@/contexts/project-tabs'
import { useDesignStyle } from '@/hooks/useDesignStyle'

interface ProjectFormValues {
  name: string
  icon?: string
}

type ProjectDialogState
  = | { mode: 'create' }
    | { mode: 'edit', project: ProjectItem }
    | null

const roleText: Record<ProjectItem['role'], string> = {
  owner: '拥有者',
  editor: '编辑者',
  viewer: '查看者',
}

function IconPicker({ value, onChange }: { value?: string, onChange?: (val: string) => void }) {
  const [category, setCategory] = useState('全部')
  const [searchText, setSearchText] = useState('')

  const filteredCategories = useMemo(() => {
    if (!searchText) { return ICON_CATEGORIES }

    const t = searchText.toLowerCase()

    return ICON_CATEGORIES.filter((c) => c.label.includes(t) || c.icons.some((name) => name.toLowerCase().includes(t)))
  }, [searchText])

  const shownIcons = useMemo(() => {
    if (category === '全部') { return ICON_OPTIONS }

    const cat = ICON_CATEGORIES.find((c) => c.label === category)

    if (!cat) { return [] }

    return cat.icons
      .map(kebabToPascal)
      .filter((name) => name in ICON_MAP)
  }, [category])

  return (
    <div className="flex gap-3" style={{ minHeight: 300 }}>
      {/* 左侧分类列表 */}
      <div className="flex shrink-0 flex-col" style={{ width: 140 }}>
        <div className="mb-1.5 px-1">
          <Input
            placeholder="搜索..."
            prefix={<SearchOutlined style={{ color: 'var(--ds-node-text-muted)' }} />}
            size="small"
            style={{ background: 'var(--ds-bg-elevated)', borderRadius: 6, padding: '0 8px' }}
            value={searchText}
            variant="borderless"
            onChange={(e) => { setSearchText(e.target.value) }}
          />
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-1" style={{ scrollbarWidth: 'thin' }}>
          <button
            style={{
              display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '6px 10px',
              textAlign: 'left', fontSize: 12, transition: 'background 0.15s',
              background: category === '全部' ? 'color-mix(in srgb, var(--ds-highlight-selected) 15%, transparent)' : 'transparent',
              color: category === '全部' ? 'var(--ds-highlight-selected)' : 'var(--ds-node-text-secondary)',
              fontWeight: category === '全部' ? 600 : 400,
              border: 'none', cursor: 'pointer', borderRadius: 4,
            }}
            type="button"
            onClick={() => { setCategory('全部'); setSearchText('') }}
            onMouseEnter={(e) => { if (category !== '全部') { e.currentTarget.style.background = 'var(--ds-bg-elevated)' } }}
            onMouseLeave={(e) => { if (category !== '全部') { e.currentTarget.style.background = 'transparent' } }}
          >
            <span style={{ flex: 1 }}>全部</span>
            <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'var(--ds-node-text-muted)' }}>
              {ICON_OPTIONS.length}
            </span>
          </button>
          {filteredCategories.map((cat) => {
            const availableInMap = category === cat.label
              ? shownIcons.length
              : cat.icons.map(kebabToPascal).filter((n) => n in ICON_MAP).length

            return (
              <button
                key={cat.label}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '6px 10px',
                  textAlign: 'left', fontSize: 12, transition: 'background 0.15s',
                  background: category === cat.label ? 'color-mix(in srgb, var(--ds-highlight-selected) 15%, transparent)' : 'transparent',
                  color: category === cat.label ? 'var(--ds-highlight-selected)' : 'var(--ds-node-text-secondary)',
                  fontWeight: category === cat.label ? 600 : 400,
                  border: 'none', cursor: 'pointer', borderRadius: 4,
                }}
                type="button"
                onClick={() => { setCategory(cat.label) }}
                onMouseEnter={(e) => { if (category !== cat.label) { e.currentTarget.style.background = 'var(--ds-bg-elevated)' } }}
                onMouseLeave={(e) => { if (category !== cat.label) { e.currentTarget.style.background = 'transparent' } }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.label}</span>
                <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'var(--ds-node-text-muted)' }}>
                  {availableInMap}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 右侧图标网格 */}
      <div className="flex-1 rounded-lg p-2.5" style={{ minHeight: 260, maxHeight: 340, background: 'var(--ds-bg-elevated)' }}>
        {shownIcons.length === 0
          ? (
              <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--ds-node-text-muted)' }}>暂无图标</div>
            )
          : (
              <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                <div className="flex flex-wrap gap-1.5">
                  {shownIcons.map((name) => {
                    const isSelected = value === name
                    const iconColor = getIconColor(name)

                    return (
                      <button
                        key={name}
                        className="relative flex size-9 cursor-pointer items-center justify-center rounded-lg border-2 transition-all duration-150 hover:scale-110 hover:shadow-md"
                        style={{
                          borderColor: isSelected ? iconColor : 'transparent',
                          backgroundColor: isSelected ? `${iconColor}0f` : 'var(--ds-node-bg)',
                        }}
                        title={name}
                        type="button"
                        onClick={() => onChange?.(isSelected ? '' : name)}
                      >
                        <ProjectIcon icon={name} size={22} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
      </div>
    </div>
  )
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiRequestError && error.status === 401
}

function getDialogTitle(dialog: ProjectDialogState) {
  return dialog?.mode === 'edit' ? '编辑项目' : '新建项目'
}

function getSubmitErrorTitle(dialog: ProjectDialogState) {
  return dialog?.mode === 'edit' ? '更新失败' : '创建失败'
}

export function ProjectsClient() {
  const { token } = theme.useToken()
  const { isGlassStyle, isNeumorphism, isSkeuomorphism } = useDesignStyle()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { sessionId } = useAuth()
  const { openProject } = useProjectTabsContext()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [dialog, setDialog] = useState<ProjectDialogState>(() => {
    return searchParams.get('create') === '1' ? { mode: 'create' } : null
  })
  const [form] = Form.useForm<ProjectFormValues>()
  const [messageApi, contextHolder] = message.useMessage()

  const fetchProjects = async () => {
    if (!sessionId) { return }

    setLoading(true)

    try {
      setProjects(await requestProjects(sessionId))
    }
    catch (error) {
      if (isUnauthorized(error)) {
        navigate('/login', { replace: true })

        return
      }

      Modal.error({
        title: '加载失败',
        content: (error as Error).message,
      })
    }
    finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchProjects()
  }, [sessionId])

  const closeDialog = () => {
    setDialog(null)
    form.resetFields()
  }

  const openCreateDialog = () => {
    form.resetFields()
    setDialog({ mode: 'create' })
  }

  const openEditDialog = (project: ProjectItem) => {
    form.setFieldsValue({ name: project.name, icon: project.icon })
    setDialog({ mode: 'edit', project })
  }

  const submitProject = async (values: ProjectFormValues) => {
    if (!sessionId) { return }

    setSubmitting(true)

    try {
      if (dialog?.mode === 'edit') {
        await requestUpdateProject(sessionId, dialog.project.id, values)
        closeDialog()
        await fetchProjects()
        messageApi.success('项目已更新')

        return
      }

      const project = await requestCreateProject(sessionId, values)

      closeDialog()
      await fetchProjects()
      openProject({
        projectId: project.id,
        name: project.name,
        icon: project.icon,
        role: 'owner',
      })
    }
    catch (error) {
      if (isUnauthorized(error)) {
        navigate('/login', { replace: true })

        return
      }

      Modal.error({
        title: getSubmitErrorTitle(dialog),
        content: (error as Error).message,
      })
    }
    finally {
      setSubmitting(false)
    }
  }

  const confirmDeleteProject = (project: ProjectItem) => {
    Modal.confirm({
      title: `删除项目"${project.name}"？`,
      content: '项目下的成员、接口、环境和回收站数据都会被彻底删除。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      maskClosable: true,
      onOk: async () => {
        if (!sessionId) { return }

        try {
          await requestDeleteProject(sessionId, project.id)
          await fetchProjects()
          messageApi.success('项目已删除')
        }
        catch (error) {
          if (isUnauthorized(error)) {
            navigate('/login', { replace: true })

            return
          }

          Modal.error({
            title: '删除失败',
            content: (error as Error).message,
          })
        }
      },
    })
  }

  return (
    <div className="relative" style={{ minHeight: '100%', backgroundColor: token.colorFillTertiary }}>
      <ParticleCanvas preset="projects" primaryColor={token.colorPrimary} variant="embedded" />
      <div className="relative z-10 px-8 py-10">
        {contextHolder}

        <div className="mb-6 flex items-center">
          <Typography.Title level={3} style={{ margin: 0 }}>
            项目列表
          </Typography.Title>

          <Space className="ml-auto">
            <Tooltip title="全局设置">
              <Button
                icon={<SettingsIcon size={16} />}
                type="text"
                onClick={() => void show(ModalSettings)}
              />
            </Tooltip>
            <UserMenu />
            <Button type="primary" onClick={openCreateDialog}>
              新建项目
            </Button>
          </Space>
        </div>

        <Spin spinning={loading}>
          {!loading && projects.length === 0
            ? (
                <div className="flex flex-col items-center gap-4 py-20">
                  <Empty description="还没有项目" />
                  <Button type="primary" onClick={openCreateDialog}>
                    新建项目
                  </Button>
                </div>
              )
            : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {projects.map((project) => {
                    const iconColor = getIconColor(project.icon ?? '')
                    const IconComp = ICON_MAP[project.icon ?? '']

                    const cardBaseStyle: React.CSSProperties = isGlassStyle
                      ? {
                          backgroundColor: `color-mix(in srgb, ${iconColor} 10%, var(--ds-node-bg))`,
                          backdropFilter: 'blur(var(--ds-blur)) saturate(var(--ds-saturate))',
                          WebkitBackdropFilter: 'blur(var(--ds-blur)) saturate(var(--ds-saturate))',
                          border: 'var(--ds-border-subtle)',
                          boxShadow: 'var(--ds-shadow-md)',
                        }
                      : isNeumorphism
                        ? {
                            backgroundColor: token.colorBgContainer,
                            boxShadow: 'var(--ds-shadow-md)',
                            border: 'none',
                          }
                        : isSkeuomorphism
                          ? {
                              backgroundColor: `${iconColor}12`,
                              boxShadow: 'var(--ds-shadow-md)',
                            }
                          : {
                              backgroundColor: `${iconColor}12`,
                            }

                    return (
                      <Card
                        key={project.id}
                        hoverable
                        className="group"
                        style={{
                          ...cardBaseStyle,
                          transition: 'all 0.2s',
                        }}
                        styles={{ body: { padding: '16px' } }}
                        onClick={() => {
                          openProject({
                            projectId: project.id,
                            name: project.name,
                            icon: project.icon,
                            role: project.role,
                          })
                        }}
                        onMouseEnter={(e) => {
                          if (!isNeumorphism) {
                            (e.currentTarget as HTMLElement).style.backgroundColor = isGlassStyle
                              ? `color-mix(in srgb, ${iconColor} 15%, rgba(255,255,255,0.15))`
                              : `${iconColor}20`
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isNeumorphism) {
                            (e.currentTarget as HTMLElement).style.backgroundColor = isGlassStyle
                              ? `color-mix(in srgb, ${iconColor} 10%, var(--ds-node-bg))`
                              : `${iconColor}12`
                          }
                        }}
                      >
                        <div className="relative">
                          {/* 水印图标 */}
                          {IconComp && (
                            <div className="pointer-events-none absolute -bottom-2 -right-2 opacity-[0.06]">
                              <IconComp size={90} strokeWidth={0.8} />
                            </div>
                          )}

                          {/* 操作按钮 */}
                          {project.role === 'owner' && (
                            <div
                              className="absolute right-0 top-0 z-10 flex gap-1 opacity-70 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
                              onClick={(event) => { event.stopPropagation() }}
                            >
                              <Button
                                className="!rounded-md"
                                size="small"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openEditDialog(project)
                                }}
                              >
                                编辑
                              </Button>
                              <Button
                                danger
                                className="!rounded-md"
                                size="small"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  confirmDeleteProject(project)
                                }}
                              >
                                删除
                              </Button>
                            </div>
                          )}

                          {/* 内容区 */}
                          <div className="flex flex-col items-center gap-2 pt-1">
                            <ProjectIcon icon={project.icon} size={36} />
                            <Typography.Title
                              className="!mb-0 !mt-1 truncate text-center"
                              level={5}
                              style={{ maxWidth: '100%' }}
                              title={project.name}
                            >
                              {project.name}
                            </Typography.Title>
                            <Typography.Text className="text-xs" type="secondary">
                              {roleText[project.role]}
                            </Typography.Text>
                            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--ds-node-text-muted)' }}>
                              <span>API {project.apiCount}</span>
                              <span style={{ color: 'var(--ds-divider-color)' }}>|</span>
                              <span>模型 {project.schemaCount}</span>
                              <span style={{ color: 'var(--ds-divider-color)' }}>|</span>
                              <span>快捷请求 {project.requestCount}</span>
                              <span style={{ color: 'var(--ds-divider-color)' }}>|</span>
                              <span>自测 {project.testCount}</span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
        </Spin>

        <Modal
          confirmLoading={submitting}
          open={dialog !== null}
          title={getDialogTitle(dialog)}
          onCancel={closeDialog}
          onOk={() => {
            void form.validateFields().then(submitProject).catch(() => undefined)
          }}
        >
          <Form form={form} layout="vertical">
            <Form.Item
              label="项目名称"
              name="name"
              rules={[{ required: true, message: '请输入项目名称' }]}
            >
              <Input placeholder="请输入项目名称" />
            </Form.Item>
            <Form.Item label="项目图标" name="icon">
              <IconPicker />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  )
}
