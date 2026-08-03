import { useEffect, useMemo, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useNavigate, useParams } from 'react-router'

import { Button, Dropdown, Empty, Form, Input, message, Modal, Popconfirm, Space, Switch, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { Folder, FolderPlus, ListTodo, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'

import { useTestFolders, useTestTask } from '@/hooks/useTestTask'
import type { CreateTestTaskPayload, TestFolder, TestTask, UpdateTestTaskPayload } from '@/types'

const ALL_KEY = '__all__'
const DEFAULT_KEY = '__default__'

export default function TestTaskListPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const {
    tasks, loading: tasksLoading, fetchTasks, createTask, updateTask, deleteTask, moveTaskToFolder,
  } = useTestTask(projectId ?? '')
  const {
    folders, fetchFolders, createFolder, renameFolder, deleteFolder,
  } = useTestFolders(projectId ?? '')

  const [selectedFolderKey, setSelectedFolderKey] = useState<string>(ALL_KEY)

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TestTask | null>(null)
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [folderForm] = Form.useForm<{ name: string }>()

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
    const items: { key: string, label: string, count: number, icon?: React.ReactNode }[] = [
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
    if (selectedFolderKey === ALL_KEY) { return tasks }

    if (selectedFolderKey === DEFAULT_KEY) { return tasks.filter((t) => !t.folderId) }

    return tasks.filter((t) => t.folderId === selectedFolderKey)
  }, [tasks, selectedFolderKey])

  // ===== Task CRUD =====
  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      const payload: CreateTestTaskPayload = {
        projectId: projectId!,
        name: values.name,
        description: values.description ?? '',
        failFast: values.failFast ?? true,
        folderId: selectedFolderKey === ALL_KEY || selectedFolderKey === DEFAULT_KEY ? null : selectedFolderKey,
      }
      const task = await createTask(payload)

      if (task) {
        message.success('测试任务创建成功')
        setCreateModalOpen(false)
        createForm.resetFields()
      }
    }
    catch {
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
    if (!editingTask) { return }

    try {
      const values = await editForm.validateFields()
      const payload: UpdateTestTaskPayload = {
        name: values.name,
        description: values.description ?? '',
        failFast: values.failFast ?? true,
      }
      const updated = await updateTask(editingTask.id, payload)

      if (updated) {
        message.success('任务信息已更新')
        setEditModalOpen(false)
        setEditingTask(null)
        editForm.resetFields()
      }
    }
    catch {
      // validation error
    }
  }

  const handleDelete = async (taskId: string) => {
    const success = await deleteTask(taskId)

    if (success) { message.success('删除成功') }
  }

  // ===== Folder CRUD =====
  const handleAddFolder = () => {
    folderForm.resetFields()
    setFolderModalOpen(true)
  }

  const handleCreateFolder = async () => {
    try {
      const values = await folderForm.validateFields()
      const folder = await createFolder(values.name.trim())

      if (folder) {
        message.success('文件夹已创建')
        setFolderModalOpen(false)
        folderForm.resetFields()
      }
    }
    catch {
      // validation error
    }
  }

  const handleRenameFolder = async (folderId: string) => {
    if (!editingFolderName.trim()) { return }

    await renameFolder(folderId, editingFolderName.trim())
    setEditingFolderId(null)
    setEditingFolderName('')
  }

  const handleDeleteFolder = async (folderId: string) => {
    const ok = await deleteFolder(folderId)

    if (ok) {
      message.success('文件夹已删除，其中的任务已移回默认')

      if (selectedFolderKey === folderId) { setSelectedFolderKey(ALL_KEY) }
    }
  }

  const handleMoveToFolder = async (taskId: string, folderId: string | null) => {
    const result = await moveTaskToFolder(taskId, folderId)

    if (result) { message.success('已移动') }
  }

  // ===== Status Tag =====
  const getStatusTag = (status: TestTask['status']) => {
    const statusMap: Record<TestTask['status'], { color: string, text: string }> = {
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
        <a onClick={() => { void navigate(`/projects/${projectId}/tests/${record.id}`) }}>
          {text}
        </a>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text}>{text || '-'}</Tooltip>
      ),
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
      render: (text: string) => (text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_, record) => (
        <Space size="small">
          <Button
            icon={<Pencil size={14} />}
            size="small"
            type="link"
            onClick={() => { openEditModal(record) }}
          >
            编辑
          </Button>
          <Dropdown menu={getMoveMenuItems(record)} trigger={['click']}>
            <Button icon={<Folder size={14} />} size="small" type="link">
              移动
            </Button>
          </Dropdown>
          <Popconfirm
            cancelText="取消"
            okText="确定"
            title="确定要删除这个测试任务吗？"
            onConfirm={() => { void handleDelete(record.id) }}
          >
            <Button danger icon={<Trash2 size={14} />} size="small" type="link">
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
    if (selectedFolderKey === ALL_KEY) { return '自动化测试' }

    if (selectedFolderKey === DEFAULT_KEY) { return '默认' }

    const folder = folders.find((f) => f.id === selectedFolderKey)

    return folder?.name ?? '自动化测试'
  }, [selectedFolderKey, folders])

  return (
    <div className="flex h-full">
      <PanelGroup autoSaveId="tests-folder-sidebar" direction="horizontal">
        {/* Left: Folder sidebar */}
        <Panel defaultSize={20} maxSize={35} minSize={15}>
          <div className="flex h-full flex-col border-r border-[color:var(--ds-panel-border)] bg-[color:var(--ds-panel-bg)]">
            <div className="flex items-center justify-between border-b border-[color:var(--ds-divider-color)] px-3 py-2">
              <span className="text-xs font-medium text-[color:var(--ds-node-text-secondary)]">文件夹</span>
              <Button
                icon={<FolderPlus size={14} />}
                size="small"
                type="text"
                onClick={handleAddFolder}
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {menuItems.map((item) => {
                const isFolder = item.key !== ALL_KEY && item.key !== DEFAULT_KEY
                const isEditing = editingFolderId === item.key
                const isSelected = selectedFolderKey === item.key

                return (
                  <div
                    key={item.key}
                    className={`group flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm transition-colors ${
                      isSelected ? 'font-medium' : 'hover:bg-[color:var(--ds-bg-elevated)]'
                    }`}
                    style={{
                      background: isSelected ? 'var(--ds-highlight-selected)' : undefined,
                      color: isSelected ? '#fff' : 'var(--ds-node-text-primary)',
                    }}
                    onClick={() => {
                      if (!isEditing) { setSelectedFolderKey(item.key) }
                    }}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      {isFolder
                        ? (
                            <Folder className="shrink-0" size={14} style={{ color: 'var(--ds-warning-color)' }} />
                          )
                        : item.key === ALL_KEY
                          ? (
                              <ListTodo className="shrink-0" size={14} style={{ color: 'var(--ds-node-text-muted)' }} />
                            )
                          : (
                              <Folder className="shrink-0" size={14} style={{ color: 'var(--ds-node-text-muted)' }} />
                            )}
                      {isEditing
                        ? (
                            <Input
                              autoFocus
                              className="text-xs"
                              size="small"
                              value={editingFolderName}
                              onBlur={() => { void handleRenameFolder(item.key) }}
                              onChange={(e) => { setEditingFolderName(e.target.value) }}
                              onClick={(e) => { e.stopPropagation() }}
                              onPressEnter={() => { void handleRenameFolder(item.key) }}
                            />
                          )
                        : (
                            <Tooltip mouseEnterDelay={0.5} placement="right" title={item.label}>
                              <span className="truncate">{item.label}</span>
                            </Tooltip>
                          )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-[color:var(--ds-node-text-muted)]">{item.count}</span>
                      {isFolder && !isEditing && (
                        <Dropdown menu={getFolderMenuItems(folders.find((f) => f.id === item.key)!)} trigger={['click']}>
                          <Button
                            className="!h-4 !w-4 !text-[11px] opacity-0 group-hover:opacity-100"
                            icon={<MoreHorizontal size={12} />}
                            size="small"
                            type="text"
                            onClick={(e) => { e.stopPropagation() }}
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

        <PanelResizeHandle className="w-px bg-[color:var(--ds-divider-color)] transition-colors hover:bg-[color:var(--ds-highlight-selected)]" />

        {/* Right: Task table */}
        <Panel>
          <div className="h-full overflow-auto p-6">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-2xl font-bold">{pageTitle}</h1>
              <Space>
                <Button
                  icon={<FolderPlus size={14} />}
                  onClick={handleAddFolder}
                >
                  新建文件夹
                </Button>
                <Button
                  icon={<Plus size={14} />}
                  type="primary"
                  onClick={() => { setCreateModalOpen(true) }}
                >
                  创建测试任务
                </Button>
              </Space>
            </div>

            {filteredTasks.length === 0 && !tasksLoading
              ? (
                  <Empty
                    description="暂无测试任务"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  >
                    <Button
                      icon={<Plus size={14} />}
                      type="primary"
                      onClick={() => { setCreateModalOpen(true) }}
                    >
                      创建第一个测试任务
                    </Button>
                  </Empty>
                )
              : (
                  <Table
                    columns={columns}
                    dataSource={filteredTasks}
                    loading={tasksLoading}
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
                    rowKey="id"
                  />
                )}
          </div>
        </Panel>
      </PanelGroup>

      {/* Create Modal */}
      <Modal
        cancelText="取消"
        okText="创建"
        open={createModalOpen}
        title="创建测试任务"
        onCancel={() => {
          setCreateModalOpen(false)
          createForm.resetFields()
        }}
        onOk={() => { void handleCreate() }}
      >
        <Form
          form={createForm}
          initialValues={{ failFast: true }}
          layout="vertical"
        >
          <Form.Item
            label="任务名称"
            name="name"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="请输入任务名称" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea placeholder="请输入任务描述" rows={3} />
          </Form.Item>
          <Form.Item label="失败即停" name="failFast" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        cancelText="取消"
        okText="保存"
        open={editModalOpen}
        title="编辑测试任务"
        onCancel={() => {
          setEditModalOpen(false)
          setEditingTask(null)
          editForm.resetFields()
        }}
        onOk={() => { void handleEdit() }}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            label="任务名称"
            name="name"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="请输入任务名称" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea placeholder="请输入任务描述" rows={3} />
          </Form.Item>
          <Form.Item label="失败即停" name="failFast" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新建文件夹 Modal */}
      <Modal
        cancelText="取消"
        okText="创建"
        open={folderModalOpen}
        title="新建文件夹"
        onCancel={() => {
          setFolderModalOpen(false)
          folderForm.resetFields()
        }}
        onOk={() => { void handleCreateFolder() }}
      >
        <Form form={folderForm} layout="vertical">
          <Form.Item
            label="文件夹名称"
            name="name"
            rules={[{ required: true, whitespace: true, message: '请输入文件夹名称' }]}
          >
            <Input autoFocus placeholder="请输入文件夹名称" onPressEnter={() => { void handleCreateFolder() }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
