import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { Table, Button, Space, Tag, Modal, Form, Input, Switch, message, Popconfirm, Empty } from 'antd'
import { PlusOutlined, PlayCircleOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

import { useTestTask } from '@/hooks/useTestTask'
import type { TestTask, CreateTestTaskPayload } from '@/types'

export default function TestTaskListPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { tasks, loading, fetchTasks, createTask, deleteTask } = useTestTask(projectId || '')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    if (projectId) {
      fetchTasks()
    }
  }, [projectId, fetchTasks])

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      const payload: CreateTestTaskPayload = {
        projectId: projectId!,
        name: values.name,
        description: values.description || '',
        failFast: values.failFast ?? true,
      }
      const task = await createTask(payload)
      if (task) {
        message.success('测试任务创建成功')
        setCreateModalOpen(false)
        form.resetFields()
      }
    } catch (err) {
      console.error('Validation failed:', err)
    }
  }

  const handleDelete = async (taskId: string) => {
    const success = await deleteTask(taskId)
    if (success) {
      message.success('删除成功')
    }
  }

  const getStatusTag = (status: TestTask['status']) => {
    const statusMap: Record<TestTask['status'], { color: string; text: string }> = {
      idle: { color: 'default', text: '待执行' },
      running: { color: 'processing', text: '执行中' },
      passed: { color: 'success', text: '通过' },
      failed: { color: 'error', text: '失败' },
      aborted: { color: 'warning', text: '已中止' },
    }
    const { color, text } = statusMap[status] || { color: 'default', text: status }
    return <Tag color={color}>{text}</Tag>
  }

  const columns: ColumnsType<TestTask> = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <a onClick={() => navigate(`/projects/${projectId}/tests/${record.id}`)}>
          {text}
        </a>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: TestTask['status']) => getStatusTag(status),
    },
    {
      title: '快速失败',
      dataIndex: 'failFast',
      key: 'failFast',
      render: (failFast: boolean) => failFast ? '是' : '否',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text) => new Date(text).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => navigate(`/projects/${projectId}/tests/${record.id}`)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个测试任务吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">自动化测试</h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateModalOpen(true)}
        >
          创建测试任务
        </Button>
      </div>

      {tasks.length === 0 && !loading ? (
        <Empty
          description="暂无测试任务"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
          >
            创建第一个测试任务
          </Button>
        </Empty>
      ) : (
        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
        />
      )}

      <Modal
        title="创建测试任务"
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalOpen(false)
          form.resetFields()
        }}
        okText="创建"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ failFast: true }}
        >
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="请输入任务名称" />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
          >
            <Input.TextArea placeholder="请输入任务描述" rows={3} />
          </Form.Item>
          <Form.Item
            name="failFast"
            label="快速失败"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
