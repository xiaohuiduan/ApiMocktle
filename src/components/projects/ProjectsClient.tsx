'use client'

import { useEffect, useState } from 'react'

import { Button, Card, Form, Input, Modal, Space, Spin, Typography, message, theme } from 'antd'
import { useNavigate } from 'react-router'

import { ParticleCanvas } from '@/components/ParticleCanvas'
import { UserMenu } from '@/components/UserMenu'

import { useAuth } from '@/contexts/auth'
import { ICON_OPTIONS, ProjectIcon } from '@/components/ProjectIcon'
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
      <div className="relative z-10 mx-auto max-w-5xl px-6 py-10">
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <Card
              key={project.id}
              extra={project.role === 'owner'
                ? (
                    <Space
                      onClick={(event) => {
                        event.stopPropagation()
                      }}
                    >
                      <Button
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
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation()
                          confirmDeleteProject(project)
                        }}
                      >
                        删除
                      </Button>
                    </Space>
                  )
                : null}
              hoverable
              onClick={() => {
                navigate(`/projects/${project.id}/home`)
              }}
            >
              <div className="flex items-center gap-3">
                <ProjectIcon icon={project.icon} size={40} />
                <div>
                  <Typography.Title level={5} className="!mb-0">{project.name}</Typography.Title>
                  <Typography.Text type="secondary">
                    角色：{roleText[project.role]}
                  </Typography.Text>
                </div>
              </div>
            </Card>
          ))}
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
