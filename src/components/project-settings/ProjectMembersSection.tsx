import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Button,
  Form,
  message,
  Select,
  Table,
  Tag,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import type { TFunction } from 'i18next'

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

/** 可分配的角色选项（拥有者不可通过此下拉分配）。 */
function createMemberRoleOptions(t: TFunction) {
  return [
    { label: t('settings.members.roleViewer'), value: 'viewer' },
    { label: t('settings.members.roleEditor'), value: 'editor' },
  ]
}

function roleText(t: TFunction, role: Role) {
  if (role === 'owner') {
    return t('settings.members.roleOwner')
  }

  if (role === 'editor') {
    return t('settings.members.roleEditor')
  }

  return t('settings.members.roleViewer')
}

export function ProjectMembersSection(props: ProjectMembersSectionProps) {
  const { t } = useTranslation()
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
        .catch(() => undefined)
        .finally(() => { setLoadingUsers(false) })
    }
  }, [canManageMembers, sessionId])

  const existingUserIds = new Set(members.map((m) => m.userId))
  const availableUsers = allUsers.filter((u) => !existingUserIds.has(u.id))

  // t 作为依赖：语言切换时 t 引用变化，触发角色选项文案重算
  const memberRoleOptions = useMemo(() => createMemberRoleOptions(t), [t])

  const handleAddMember = async (values: { userId: string, role: string }) => {
    if (!projectId || !sessionId) {
      return
    }

    setSubmitting(true)

    try {
      const username = availableUsers.find((u) => u.id === values.userId)?.username ?? values.userId
      await api('add_project_member', {
        sessionId,
        projectId,
        payload: { username, role: values.role },
      })
      msgApi.success(t('settings.members.added'))
      addForm.resetFields()
      await onRefresh()
    }
    catch (error) {
      msgApi.error((error as Error).message)
    }
    finally {
      setSubmitting(false)
    }
  }

  const handleMemberRoleChange = async (userId: string, nextRole: string) => {
    if (!projectId || !sessionId) {
      return
    }

    try {
      await api('update_member_role', { sessionId, projectId, userId, payload: { role: nextRole } } as any)
      msgApi.success(t('settings.members.roleUpdated'))
      await onRefresh()
    }
    catch (error) {
      msgApi.error((error as Error).message)
    }
  }

  const handleMemberDelete = async (userId: string) => {
    if (!projectId || !sessionId) {
      return
    }

    try {
      await api('remove_project_member', { sessionId, projectId, userId })
      msgApi.success(t('settings.members.removed'))
      await onRefresh()
    }
    catch (error) {
      msgApi.error((error as Error).message)
    }
  }

  return (
    <>
      {contextHolder}

      {canManageMembers && (
        <>
          <Typography.Title level={5}>{t('settings.members.addTitle')}</Typography.Title>
          <Form
            className="mb-4"
            form={addForm}
            layout="inline"
            onFinish={(values) => {
              void handleAddMember(values)
            }}
          >
            <Form.Item name="userId" rules={[{ required: true, message: t('settings.members.selectUser') }]}>
              <Select
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                loading={loadingUsers}
                options={availableUsers.map((u) => ({ label: u.username, value: u.id }))}
                placeholder={t('settings.members.searchUser')}
                style={{ width: 200 }}
              />
            </Form.Item>

            <Form.Item name="role" rules={[{ required: true, message: t('settings.members.selectRole') }]}>
              <Select options={memberRoleOptions} placeholder={t('settings.members.rolePlaceholder')} style={{ width: 120 }} />
            </Form.Item>

            <Form.Item>
              <Button htmlType="submit" loading={submitting} type="primary">
                {t('settings.members.add')}
              </Button>
            </Form.Item>
          </Form>
        </>
      )}

      <Table<MemberItem>
        columns={[
          { title: t('settings.members.username'), dataIndex: 'username' },
          {
            title: t('settings.members.role'),
            dataIndex: 'role',
            render: (value: Role, record) => {
              if (!canManageMembers || record.userId === projectOwnerId || value === 'owner') {
                return <Tag>{roleText(t, value)}</Tag>
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
            title: t('settings.members.joinedAt'),
            dataIndex: 'createdAt',
            render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: t('common.action'),
            render: (_, record) => {
              if (!canManageMembers || record.userId === projectOwnerId) {
                return '-'
              }

              return (
                <Button danger size="small" onClick={() => void handleMemberDelete(record.userId)}>
                  {t('settings.members.remove')}
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
