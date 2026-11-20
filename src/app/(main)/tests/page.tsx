import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
      { key: ALL_KEY, label: t('app.tests.allTasks'), count: tasks.length },
      { key: DEFAULT_KEY, label: t('app.tests.defaultFolder'), count: defaultCount },
    ]
    folders.forEach((f) => {
      items.push({
        key: f.id,
        label: f.name,
        count: tasks.filter((t) => t.folderId === f.id).length,
      })
    })

    return items
  }, [t, tasks, folders])

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
        message.success(t('app.tests.created'))
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
        message.success(t('app.tests.updated'))
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

    if (success) { message.success(t('app.tests.deleted')) }
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
        message.success(t('app.tests.folderCreated'))
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
      message.success(t('app.tests.folderDeleted'))

      if (selectedFolderKey === folderId) { setSelectedFolderKey(ALL_KEY) }
    }
  }

  const handleMoveToFolder = async (taskId: string, folderId: string | null) => {
    const result = await moveTaskToFolder(taskId, folderId)

    if (result) { message.success(t('app.tests.moved')) }
  }

  // ===== Status Tag =====
  const getStatusTag = (status: TestTask['status']) => {
    const statusMap: Record<TestTask['status'], { color: string, text: string }> = {
      idle: { color: 'default', text: t('app.tests.statusLabel.idle') },
      running: { color: 'processing', text: t('app.tests.statusLabel.running') },
      passed: { color: 'success', text: t('app.tests.statusLabel.passed') },
      failed: { color: 'error', text: t('app.tests.statusLabel.failed') },
      aborted: { color: 'warning', text: t('app.tests.statusLabel.aborted') },
    }
    const { color, text } = statusMap[status] || { color: 'default', text: status }

    return <Tag color={color}>{text}</Tag>
  }

  // Build folder move submenu for task context
  const getMoveMenuItems = (record: TestTask) => {
    const items = [
      { key: '__default__', label: t('app.tests.defaultFolder') },
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
      title: t('app.tests.taskName'),
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <a onClick={() => { void navigate(`/projects/${projectId}/tests/${record.id}`) }}>
          {text}
        </a>
      ),
    },
    {
      title: t('app.tests.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text}>{text || '-'}</Tooltip>
      ),
    },
    {
      title: t('app.tests.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: TestTask['status']) => getStatusTag(status),
    },
    {
      title: t('app.tests.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => (text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: t('app.tests.action'),
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
            {t('app.tests.edit')}
          </Button>
          <Dropdown menu={getMoveMenuItems(record)} trigger={['click']}>
            <Button icon={<Folder size={14} />} size="small" type="link">
              {t('app.tests.move')}
            </Button>
          </Dropdown>
          <Popconfirm
            cancelText={t('common.cancel')}
            okText={t('common.ok')}
            title={t('app.tests.deleteConfirm')}
            onConfirm={() => { void handleDelete(record.id) }}
          >
            <Button danger icon={<Trash2 size={14} />} size="small" type="link">
              {t('app.tests.delete')}
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
        label: t('app.tests.rename'),
        onClick: () => {
          setEditingFolderId(folder.id)
          setEditingFolderName(folder.name)
        },
      },
      {
        key: 'delete',
        label: t('app.tests.delete'),
        danger: true,
        onClick: () => {
          Modal.confirm({
            title: t('app.tests.deleteFolderTitle'),
            content: t('app.tests.deleteFolderContent', { name: folder.name }),
            okText: t('common.delete'),
            okButtonProps: { danger: true },
            onOk: () => handleDeleteFolder(folder.id),
          })
        },
      },
    ],
  })

  // Compute dynamic title based on selected folder
  const pageTitle = useMemo(() => {
    if (selectedFolderKey === ALL_KEY) { return t('app.tests.title') }

    if (selectedFolderKey === DEFAULT_KEY) { return t('app.tests.defaultFolder') }

    const folder = folders.find((f) => f.id === selectedFolderKey)

    return folder?.name ?? t('app.tests.title')
  }, [selectedFolderKey, folders, t])

  return (
    <div className="flex h-full">
      <PanelGroup autoSaveId="tests-folder-sidebar" direction="horizontal">
        {/* Left: Folder sidebar */}
        <Panel defaultSize={20} maxSize={35} minSize={15}>
          <div className="flex h-full flex-col border-r border-[color:var(--ds-panel-border)] bg-[color:var(--ds-panel-bg)]">
            <div className="flex items-center justify-between border-b border-[color:var(--ds-divider-color)] px-3 py-2">
              <span className="text-xs font-medium text-[color:var(--ds-node-text-secondary)]">{t('app.tests.folderLabel')}</span>
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
                      color: isSelected ? 'var(--ds-highlight-selected-text)' : 'var(--ds-node-text-primary)',
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
                  {t('app.tests.newFolder')}
                </Button>
                <Button
                  icon={<Plus size={14} />}
                  type="primary"
                  onClick={() => { setCreateModalOpen(true) }}
                >
                  {t('app.tests.createTask')}
                </Button>
              </Space>
            </div>

            {filteredTasks.length === 0 && !tasksLoading
              ? (
                  <Empty
                    description={t('app.tests.empty')}
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  >
                    <Button
                      icon={<Plus size={14} />}
                      type="primary"
                      onClick={() => { setCreateModalOpen(true) }}
                    >
                      {t('app.tests.createFirstTask')}
                    </Button>
                  </Empty>
                )
              : (
                  <Table
                    columns={columns}
                    dataSource={filteredTasks}
                    loading={tasksLoading}
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => t('app.tests.total', { total }) }}
                    rowKey="id"
                  />
                )}
          </div>
        </Panel>
      </PanelGroup>

      {/* Create Modal */}
      <Modal
        cancelText={t('common.cancel')}
        okText={t('app.tests.confirmCreate')}
        open={createModalOpen}
        title={t('app.tests.createTask')}
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
            label={t('app.tests.taskName')}
            name="name"
            rules={[{ required: true, message: t('app.tests.taskNameRequired') }]}
          >
            <Input placeholder={t('app.tests.taskNamePlaceholder')} />
          </Form.Item>
          <Form.Item label={t('app.tests.description')} name="description">
            <Input.TextArea placeholder={t('app.tests.descriptionPlaceholder')} rows={3} />
          </Form.Item>
          <Form.Item label={t('app.tests.failFast')} name="failFast" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        cancelText={t('common.cancel')}
        okText={t('common.save')}
        open={editModalOpen}
        title={t('app.tests.editTitle')}
        onCancel={() => {
          setEditModalOpen(false)
          setEditingTask(null)
          editForm.resetFields()
        }}
        onOk={() => { void handleEdit() }}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            label={t('app.tests.taskName')}
            name="name"
            rules={[{ required: true, message: t('app.tests.taskNameRequired') }]}
          >
            <Input placeholder={t('app.tests.taskNamePlaceholder')} />
          </Form.Item>
          <Form.Item label={t('app.tests.description')} name="description">
            <Input.TextArea placeholder={t('app.tests.descriptionPlaceholder')} rows={3} />
          </Form.Item>
          <Form.Item label={t('app.tests.failFast')} name="failFast" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新建文件夹 Modal */}
      <Modal
        cancelText={t('common.cancel')}
        okText={t('app.tests.confirmCreate')}
        open={folderModalOpen}
        title={t('app.tests.newFolder')}
        onCancel={() => {
          setFolderModalOpen(false)
          folderForm.resetFields()
        }}
        onOk={() => { void handleCreateFolder() }}
      >
        <Form form={folderForm} layout="vertical">
          <Form.Item
            label={t('app.tests.folderName')}
            name="name"
            rules={[{ required: true, whitespace: true, message: t('app.tests.folderNameRequired') }]}
          >
            <Input autoFocus placeholder={t('app.tests.folderNamePlaceholder')} onPressEnter={() => { void handleCreateFolder() }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
