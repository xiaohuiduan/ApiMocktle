import { useEffect, useState } from 'react'

import dayjs from 'dayjs'

import {
  Button,
  Form,
  Select,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'

export type Role = 'owner' | 'editor' | 'viewer'

export interface MemberItem {
  userId: string
  username: string
  role: Role
  createdAt: string
}

interface UserItem {
  id: string
  username: string
}

interface ProjectMembersSectionProps {
  projectId?: string
  projectOwnerId?: string
  canManageMembers: boolean
  members: MemberItem[]
  loading: boolean
  onRefresh: () => Promise<void>
}

const memberRoleOptions = [
  { label: '查看者', value: 'viewer' },
  { label: '编辑者', value: 'editor' },
]

function roleText(role: Role) {
  if (role === 'owner') return '拥有者'
  if (role === 'editor') return '编辑者'
  return '查看者'
}

export function ProjectMembersSection(props: ProjectMembersSectionProps) {
  const { projectId, projectOwnerId, canManageMembers, members, loading, onRefresh } = props
  const { sessionId } = useAuth()
  const [msgApi, contextHolder] = message.useMessage()
  const [addForm] = Form.useForm<{ userId: string, role: string }>()
  const [submitting, setSubmitting] = useState(false)
  const [allUsers, setAllUsers] = useState<UserItem[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  useEffect(() => {
    if (canManageMembers && sessionId) {
      setLoadingUsers(true)
      api<UserItem[]>('list_all_users', { sessionId })
        .then(setAllUsers)
        .catch(() => {})
        .finally(() => setLoadingUsers(false))
    }
  }, [canManageMembers, sessionId])

  const existingUserIds = new Set(members.map(m => m.userId))
  const availableUsers = allUsers.filter(u => !existingUserIds.has(u.id))

  const handleAddMember = async (values: { userId: string, role: string }) => {
    if (!projectId || !sessionId) return
    setSubmitting(true)
    try {
      const username = availableUsers.find(u => u.id === values.userId)?.username ?? values.userId
      await api('add_project_member', {
        sessionId,
        projectId,
        payload: { username, role: values.role },
      })
      msgApi.success('已添加成员')
      addForm.resetFields()
      await onRefresh()
    } catch (error) {
      msgApi.error((error as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleMemberRoleChange = async (userId: string, nextRole: string) => {
    if (!projectId || !sessionId) return
    try {
      await api('update_member_role', { sessionId, projectId, userId, payload: { role: nextRole } } as any)
      msgApi.success('角色已更新')
      await onRefresh()
    } catch (error) {
      msgApi.error((error as Error).message)
    }
  }

  const handleMemberDelete = async (userId: string) => {
    if (!projectId || !sessionId) return
    try {
      await api('remove_project_member', { sessionId, projectId, userId })
      msgApi.success('已移除成员')
      await onRefresh()
    } catch (error) {
      msgApi.error((error as Error).message)
    }
  }

  return (
    <>
      {contextHolder}

      {canManageMembers && (
        <>
          <Typography.Title level={5}>添加成员</Typography.Title>
          <Form
            className="mb-4"
            form={addForm}
            layout="inline"
            onFinish={handleAddMember}
          >
            <Form.Item name="userId" rules={[{ required: true, message: '请选择用户' }]}>
              <Select
                showSearch
                filterOption={(input, option) =>
                  (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                }
                loading={loadingUsers}
                options={availableUsers.map(u => ({ label: u.username, value: u.id }))}
                placeholder="搜索用户"
                style={{ width: 200 }}
              />
            </Form.Item>

            <Form.Item name="role" rules={[{ required: true, message: '请选择角色' }]}>
              <Select options={memberRoleOptions} placeholder="选择权限" style={{ width: 120 }} />
            </Form.Item>

            <Form.Item>
              <Button htmlType="submit" loading={submitting} type="primary">
                添加
              </Button>
            </Form.Item>
          </Form>
        </>
      )}

      <Table<MemberItem>
        columns={[
          { title: '用户名', dataIndex: 'username' },
          {
            title: '角色',
            dataIndex: 'role',
            render: (value: Role, record) => {
              if (!canManageMembers || record.userId === projectOwnerId || value === 'owner') {
                return <Tag>{roleText(value)}</Tag>
              }
              return (
                <Select
                  options={memberRoleOptions}
                  style={{ width: 130 }}
                  value={value}
                  onChange={(nextRole) => void handleMemberRoleChange(record.userId, nextRole)}
                />
              )
            },
          },
          {
            title: '加入时间',
            dataIndex: 'createdAt',
            render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '操作',
            render: (_, record) => {
              if (!canManageMembers || record.userId === projectOwnerId) return '-'
              return (
                <Button danger size="small" onClick={() => void handleMemberDelete(record.userId)}>
                  移除
                </Button>
              )
            },
          },
        ]}
        dataSource={members}
        loading={loading}
        pagination={false}
        rowKey="userId"
      />
    </>
  )
}
