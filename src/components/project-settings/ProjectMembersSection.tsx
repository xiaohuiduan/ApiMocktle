import { useState } from 'react'

import dayjs from 'dayjs'

import {
  Button,
  Form,
  InputNumber,
  Select,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'

export type Role = 'owner' | 'editor' | 'viewer'
export type InviteRole = Exclude<Role, 'owner'>

export interface MemberItem {
  userId: string
  username: string
  role: Role
  createdAt: string
}

export interface InvitationItem {
  id: string
  projectId: string
  projectName: string
  inviterUserId: string
  inviterUsername: string
  role: InviteRole
  status: 'pending' | 'accepted' | 'revoked'
  createdAt: string
  expiresAt: string
  acceptedAt?: string
  acceptedByUserId?: string
  isExpired: boolean
}

interface ProjectMembersSectionProps {
  projectId?: string
  projectOwnerId?: string
  canManageMembers: boolean
  members: MemberItem[]
  invitations: InvitationItem[]
  loading: boolean
  onRefresh: () => Promise<void>
}

interface InviteFormValues {
  role: InviteRole
  expiresInHours: number
}

const memberRoleOptions = [
  { label: '查看者', value: 'viewer' },
  { label: '编辑者', value: 'editor' },
] satisfies Array<{ label: string, value: InviteRole }>

const MIN_INVITE_TTL_HOURS = 1
const MAX_INVITE_TTL_HOURS = 720
const DEFAULT_INVITE_TTL_HOURS = 24

function roleText(role: Role) {
  if (role === 'owner') {
    return '拥有者'
  }

  if (role === 'editor') {
    return '编辑者'
  }

  return '查看者'
}

function invitationStatusText(invitation: InvitationItem) {
  if (invitation.status === 'accepted') {
    return '已接受'
  }

  if (invitation.status === 'revoked') {
    return '已撤销'
  }

  if (invitation.isExpired) {
    return '已过期'
  }

  return '待接受'
}

function invitationStatusColor(invitation: InvitationItem) {
  if (invitation.status === 'accepted') {
    return 'green'
  }

  if (invitation.status === 'revoked') {
    return 'default'
  }

  if (invitation.isExpired) {
    return 'orange'
  }

  return 'blue'
}

function getInviteUrl(invitationId: string) {
  if (typeof window === 'undefined') {
    return `/invites/${invitationId}`
  }

  return `${window.location.origin}/#/invites/${invitationId}`
}

export function ProjectMembersSection(props: ProjectMembersSectionProps) {
  const {
    projectId,
    projectOwnerId,
    canManageMembers,
    members,
    invitations,
    loading,
    onRefresh,
  } = props
  const { sessionId } = useAuth()
  const [msgApi, contextHolder] = message.useMessage()
  const [inviteForm] = Form.useForm<InviteFormValues>()
  const [submittingInvite, setSubmittingInvite] = useState(false)

  const handleInviteCreate = async (values: InviteFormValues) => {
    if (!projectId || !sessionId) {
      return
    }

    try {
      setSubmittingInvite(true)
      await api('create_project_invitation', {
        sessionId,
        projectId,
        payload: { role: values.role, expiresInHours: values.expiresInHours },
      })
      msgApi.success('邀请链接已创建')
      inviteForm.resetFields()
      inviteForm.setFieldsValue({ role: 'viewer', expiresInHours: DEFAULT_INVITE_TTL_HOURS })
      await onRefresh()
    }
    catch (error) {
      msgApi.error((error as Error).message)
    }
    finally {
      setSubmittingInvite(false)
    }
  }

  const handleMemberRoleChange = async (userId: string, nextRole: InviteRole) => {
    if (!projectId || !sessionId) {
      return
    }

    try {
      await api('update_member_role', {
        sessionId,
        projectId,
        userId,
        payload: { role: nextRole },
      })
      msgApi.success('角色已更新')
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
      await api('remove_project_member', {
        sessionId,
        projectId,
        userId,
      })
      msgApi.success('已移除成员')
      await onRefresh()
    }
    catch (error) {
      msgApi.error((error as Error).message)
    }
  }

  const handleInvitationRevoke = async (inviteId: string) => {
    if (!projectId || !sessionId) {
      return
    }

    try {
      await api('revoke_project_invitation', {
        sessionId,
        projectId,
        inviteId,
      })
      msgApi.success('邀请已撤销')
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
          <Typography.Title level={5}>邀请成员</Typography.Title>
          <Form<InviteFormValues>
            className="mb-4"
            form={inviteForm}
            initialValues={{ role: 'viewer', expiresInHours: DEFAULT_INVITE_TTL_HOURS }}
            layout="inline"
            onFinish={handleInviteCreate}
          >
            <Form.Item name="role">
              <Select options={memberRoleOptions} style={{ width: 120 }} />
            </Form.Item>

            <Form.Item
              name="expiresInHours"
              rules={[
                { required: true, message: '请输入有效期' },
                {
                  type: 'number',
                  min: MIN_INVITE_TTL_HOURS,
                  max: MAX_INVITE_TTL_HOURS,
                  message: `有效期需在 ${MIN_INVITE_TTL_HOURS}-${MAX_INVITE_TTL_HOURS} 小时之间`,
                },
              ]}
            >
              <InputNumber
                addonAfter="小时"
                min={MIN_INVITE_TTL_HOURS}
                max={MAX_INVITE_TTL_HOURS}
                placeholder="有效期"
              />
            </Form.Item>

            <Form.Item>
              <Button htmlType="submit" loading={submittingInvite} type="primary">
                生成邀请链接
              </Button>
            </Form.Item>
          </Form>

          <Table<InvitationItem>
            className="mb-6"
            columns={[
              {
                title: '邀请链接',
                dataIndex: 'id',
                render: (id: string) => {
                  const inviteUrl = getInviteUrl(id)

                  return (
                    <Typography.Paragraph className="!mb-0 break-all" copyable={{ text: inviteUrl }}>
                      {inviteUrl}
                    </Typography.Paragraph>
                  )
                },
              },
              {
                title: '角色',
                dataIndex: 'role',
                render: (value: InviteRole) => <Tag>{roleText(value)}</Tag>,
              },
              {
                title: '状态',
                render: (_, invitation) => (
                  <Tag color={invitationStatusColor(invitation)}>
                    {invitationStatusText(invitation)}
                  </Tag>
                ),
              },
              {
                title: '有效期至',
                dataIndex: 'expiresAt',
                render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
              },
              {
                title: '创建时间',
                dataIndex: 'createdAt',
                render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
              },
              {
                title: '操作',
                render: (_, invitation) => {
                  if (invitation.status !== 'pending' || invitation.isExpired) {
                    return '-'
                  }

                  return (
                    <Button
                      danger
                      size="small"
                      onClick={() => {
                        void handleInvitationRevoke(invitation.id)
                      }}
                    >
                      撤销
                    </Button>
                  )
                },
              },
            ]}
            dataSource={invitations}
            loading={loading}
            locale={{ emptyText: '暂无邀请链接' }}
            pagination={false}
            rowKey="id"
          />
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
                  onChange={(nextRole) => {
                    void handleMemberRoleChange(record.userId, nextRole)
                  }}
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
              if (!canManageMembers || record.userId === projectOwnerId) {
                return '-'
              }

              return (
                <Button
                  danger
                  size="small"
                  onClick={() => {
                    void handleMemberDelete(record.userId)
                  }}
                >
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
