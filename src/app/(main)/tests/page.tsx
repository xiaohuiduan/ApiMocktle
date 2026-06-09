import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { Table, Button, Space, Tag, Modal, Form, Input, Switch, message, Popconfirm, Empty, Menu, Dropdown, Tooltip } from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  FolderOutlined, FolderAddOutlined, MoreOutlined,
} from '@ant-design/icons'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { ColumnsType } from 'antd/es/table'

import { useTestTask, useTestFolders } from '@/hooks/useTestTask'
import type { TestTask, TestFolder, CreateTestTaskPayload, UpdateTestTaskPayload } from '@/types'

const ALL_KEY = '__all__'
const DEFAULT_KEY = '__default__'

export default function TestTaskListPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const {
    tasks, loading: tasksLoading, fetchTasks, createTask, updateTask, deleteTask, moveTaskToFolder,
  } = useTestTask(projectId || '')
  const {
    folders, fetchFolders, createFolder, renameFolder, deleteFolder,
  } = useTestFolders(projectId || '')

  const [selectedFolderKey, setSelectedFolderKey] = useState<string>(ALL_KEY)

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TestTask | null>(null)
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()

  // Folder editing
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')

  useEffect(() => {
    if (projectId) {
      fetchTasks()
      fetchFolders()
    }
  }, [projectId, fetchTasks, fetchFolders])

  // Build sidebar menu items
  const menuItems = useMemo(() => {
    const defaultCount = tasks.filter((t) => !t.folderId).length
    const items: { key: string; label: string; count: number; icon?: React.ReactNode }[] = [
      { key: ALL_KEY, label: '全部任务', count: tasks.length },
      { key: DEFAULT_KEY, label: '默认', count: defaultCount },
    ]
    folders.forEach((f) => {
      items.push({
        key: f.id,
        label: f.name,
        count: tasks.filter((t) => t.folderId === f.id).length,
      })
    })
    return items
  }, [tasks, folders])

  // Filter tasks by selected folder
  const filteredTasks = useMemo(() => {
    if (selectedFolderKey === ALL_KEY) return tasks
    if (selectedFolderKey === DEFAULT_KEY) return tasks.filter((t) => !t.folderId)
    return tasks.filter((t) => t.folderId === selectedFolderKey)
  }, [tasks, selectedFolderKey])

  // ===== Task CRUD =====
  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      const payload: CreateTestTaskPayload = {
        projectId: projectId!,
        name: values.name,
        description: values.description || '',
        failFast: values.failFast ?? true,
        folderId: selectedFolderKey === ALL_KEY || selectedFolderKey === DEFAULT_KEY ? null : selectedFolderKey,
      }
      const task = await createTask(payload)
      if (task) {
        message.success('测试任务创建成功')
        setCreateModalOpen(false)
        createForm.resetFields()
      }
    } catch {
      // validation error
    }
  }

  const openEditModal = (task: TestTask) => {
    setEditingTask(task)
    editForm.setFieldsValue({
      name: task.name,
      description: task.description,
      failFast: task.failFast ?? true,
    })
    setEditModalOpen(true)
  }

  const handleEdit = async () => {
    if (!editingTask) return
    try {
      const values = await editForm.validateFields()
      const payload: UpdateTestTaskPayload = {
        name: values.name,
        description: values.description || '',
        failFast: values.failFast ?? true,
      }
      const updated = await updateTask(editingTask.id, payload)
      if (updated) {
        message.success('任务信息已更新')
        setEditModalOpen(false)
        setEditingTask(null)
        editForm.resetFields()
      }
    } catch {
      // validation error
    }
  }

  const handleDelete = async (taskId: string) => {
    const success = await deleteTask(taskId)
    if (success) message.success('删除成功')
  }

  // ===== Folder CRUD =====
  const handleAddFolder = async () => {
    const name = prompt('请输入文件夹名称')
    if (!name?.trim()) return
    const folder = await createFolder(name.trim())
    if (folder) message.success('文件夹已创建')
  }

  const handleRenameFolder = async (folderId: string) => {
    if (!editingFolderName.trim()) return
    await renameFolder(folderId, editingFolderName.trim())
    setEditingFolderId(null)
    setEditingFolderName('')
  }

  const handleDeleteFolder = async (folderId: string) => {
    const ok = await deleteFolder(folderId)
    if (ok) {
      message.success('文件夹已删除，其中的任务已移回默认')
      if (selectedFolderKey === folderId) setSelectedFolderKey(ALL_KEY)
    }
  }

  const handleMoveToFolder = async (taskId: string, folderId: string | null) => {
    const result = await moveTaskToFolder(taskId, folderId)
    if (result) message.success('已移动')
  }

  // ===== Status Tag =====
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

  // Build folder move submenu for task context
  const getMoveMenuItems = (record: TestTask) => {
    const items = [
      { key: '__default__', label: '默认' },
      ...folders.map((f) => ({ key: f.id, label: f.name })),
    ]
    return {
      items,
      onClick: ({ key }: { key: string }) => {
        handleMoveToFolder(record.id, key === '__default__' ? null : key)
      },
    }
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
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text) => new Date(text).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            编辑
          </Button>
          <Dropdown menu={getMoveMenuItems(record)} trigger={['click']}>
            <Button type="link" size="small" icon={<FolderOutlined />}>
              移动
            </Button>
          </Dropdown>
          <Popconfirm
            title="确定要删除这个测试任务吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // Folder context menu
  const getFolderMenuItems = (folder: TestFolder) => ({
    items: [
      {
        key: 'rename',
        label: '重命名',
        onClick: () => {
          setEditingFolderId(folder.id)
          setEditingFolderName(folder.name)
        },
      },
      {
        key: 'delete',
        label: '删除',
        danger: true,
        onClick: () => {
          Modal.confirm({
            title: '删除文件夹',
            content: `确定删除「${folder.name}」？其中的任务将移回默认。`,
            okText: '删除',
            okButtonProps: { danger: true },
            onOk: () => handleDeleteFolder(folder.id),
          })
        },
      },
    ],
  })

  // Compute dynamic title based on selected folder
  const pageTitle = useMemo(() => {
    if (selectedFolderKey === ALL_KEY) return '自动化测试'
    if (selectedFolderKey === DEFAULT_KEY) return '默认'
    const folder = folders.find((f) => f.id === selectedFolderKey)
    return folder?.name || '自动化测试'
  }, [selectedFolderKey, folders])

  return (
    <div className="flex h-full">
      <PanelGroup direction="horizontal" autoSaveId="tests-folder-sidebar">
        {/* Left: Folder sidebar */}
        <Panel defaultSize={20} minSize={15} maxSize={35}>
          <div className="h-full border-r border-gray-200 bg-gray-50/50 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
              <span className="text-xs font-medium text-gray-500">文件夹</span>
              <Button
                type="text"
                size="small"
                icon={<FolderAddOutlined />}
                onClick={handleAddFolder}
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {menuItems.map((item) => {
                const isFolder = item.key !== ALL_KEY && item.key !== DEFAULT_KEY
                const isEditing = editingFolderId === item.key
                return (
                  <div
                    key={item.key}
                    className={`group flex items-center justify-between px-3 py-1.5 cursor-pointer text-sm transition-colors ${
                      selectedFolderKey === item.key
                        ? 'bg-blue-50 text-blue-600 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    onClick={() => {
                      if (!isEditing) setSelectedFolderKey(item.key)
                    }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {isFolder ? (
                        <FolderOutlined className="text-yellow-500 text-xs shrink-0" />
                      ) : item.key === ALL_KEY ? (
                        <span className="text-xs shrink-0">📋</span>
                      ) : (
                        <FolderOutlined className="text-gray-400 text-xs shrink-0" />
                      )}
                      {isEditing ? (
                        <Input
                          size="small"
                          value={editingFolderName}
                          onChange={(e) => setEditingFolderName(e.target.value)}
                          onPressEnter={() => handleRenameFolder(item.key)}
                          onBlur={() => handleRenameFolder(item.key)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                          className="text-xs"
                        />
                      ) : (
                        <Tooltip title={item.label} placement="right" mouseEnterDelay={0.5}>
                          <span className="truncate">{item.label}</span>
                        </Tooltip>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-400">{item.count}</span>
                      {isFolder && !isEditing && (
                        <Dropdown menu={getFolderMenuItems(folders.find((f) => f.id === item.key)!)} trigger={['click']}>
                          <Button
                            type="text"
                            size="small"
                            icon={<MoreOutlined />}
                            className="opacity-0 group-hover:opacity-100 !w-4 !h-4 !text-[10px]"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Dropdown>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-px bg-gray-200 hover:bg-blue-400 transition-colors" />

        {/* Right: Task table */}
        <Panel>
          <div className="h-full p-6 overflow-auto">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">{pageTitle}</h1>
          <Space>
            <Button
              icon={<FolderAddOutlined />}
              onClick={handleAddFolder}
            >
              新建文件夹
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalOpen(true)}
            >
              创建测试任务
            </Button>
          </Space>
        </div>

        {filteredTasks.length === 0 && !tasksLoading ? (
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
            dataSource={filteredTasks}
            rowKey="id"
            loading={tasksLoading}
          />
        )}
          </div>
        </Panel>
      </PanelGroup>

      {/* Create Modal */}
      <Modal
        title="创建测试任务"
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalOpen(false)
          createForm.resetFields()
        }}
        okText="创建"
        cancelText="取消"
      >
        <Form
          form={createForm}
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
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="请输入任务描述" rows={3} />
          </Form.Item>
          <Form.Item name="failFast" label="失败即停" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title="编辑测试任务"
        open={editModalOpen}
        onOk={handleEdit}
        onCancel={() => {
          setEditModalOpen(false)
          setEditingTask(null)
          editForm.resetFields()
        }}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="请输入任务名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="请输入任务描述" rows={3} />
          </Form.Item>
          <Form.Item name="failFast" label="失败即停" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
