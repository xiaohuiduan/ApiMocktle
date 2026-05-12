'use client'

import { useEffect, useState } from 'react'

import { Button, Card, Form, Input, Modal, Space, Spin, Typography, message, theme } from 'antd'
import { useNavigate } from 'react-router'

import { ParticleCanvas } from '@/components/ParticleCanvas'
import { UserMenu } from '@/components/UserMenu'

import { useAuth } from '@/contexts/auth'
import { ICON_OPTIONS, ICON_MAP, ProjectIcon, getIconColor } from '@/components/ProjectIcon'
import {
  ApiRequestError,
  requestCreateProject,
  requestDeleteProject,
  requestProjects,
  requestUpdateProject,
  type ProjectItem,
} from '@/components/projects/project-api'

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
  return (
    <div className="flex flex-wrap gap-2">
      {ICON_OPTIONS.map((name) => (
        <button
          key={name}
          type="button"
          className="flex size-10 cursor-pointer items-center justify-center rounded-lg border-2 transition-colors"
          style={{
            borderColor: value === name ? '#1677ff' : 'transparent',
            backgroundColor: value === name ? '#e6f4ff' : '#f5f5f5',
          }}
          onClick={() => onChange?.(value === name ? '' : name)}
          title={name}
        >
          <ProjectIcon icon={name} size={28} />
        </button>
      ))}
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
  const navigate = useNavigate()
  const { sessionId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [dialog, setDialog] = useState<ProjectDialogState>(null)
  const [form] = Form.useForm<ProjectFormValues>()
  const [messageApi, contextHolder] = message.useMessage()

  const fetchProjects = async () => {
    if (!sessionId) return
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
    if (!sessionId) return
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
      navigate(`/projects/${project.id}/home`)
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
        if (!sessionId) return
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
      <ParticleCanvas variant="embedded" preset="projects" primaryColor={token.colorPrimary} />
      <div className="relative z-10 px-8 py-10">
      {contextHolder}

      <div className="mb-6 flex items-center">
        <Typography.Title level={3} style={{ margin: 0 }}>
          项目列表
        </Typography.Title>

        <Space className="ml-auto">
          <UserMenu />
          <Button type="primary" onClick={openCreateDialog}>
            新建项目
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {projects.map((project) => {
            const iconColor = getIconColor(project.icon || '')
            const IconComp = ICON_MAP[project.icon || '']

            return (
              <Card
                key={project.id}
                hoverable
                className="group"
                styles={{ body: { padding: '16px' } }}
                style={{
                  backgroundColor: `${iconColor}12`,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = `${iconColor}20`
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = `${iconColor}12`
                }}
                onClick={() => {
                  navigate(`/projects/${project.id}/home`)
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
                      className="absolute right-0 top-0 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(event) => { event.stopPropagation() }}
                    >
                      <Button
                        size="small"
                        className="!rounded-md"
                        onClick={(event) => {
                          event.stopPropagation()
                          openEditDialog(project)
                        }}
                      >
                        编辑
                      </Button>
                      <Button
                        danger
                        size="small"
                        className="!rounded-md"
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
                      level={5}
                      className="!mb-0 !mt-1 truncate text-center"
                      style={{ maxWidth: '100%' }}
                      title={project.name}
                    >
                      {project.name}
                    </Typography.Title>
                    <Typography.Text type="secondary" className="text-xs">
                      {roleText[project.role]}
                    </Typography.Text>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
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
