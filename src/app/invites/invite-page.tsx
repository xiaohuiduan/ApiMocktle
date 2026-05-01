'use client'

import { useEffect, useMemo, useState } from 'react'

import { Button, Card, Result, Space, Spin, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { Link, useNavigate, useParams } from 'react-router'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'
import type { InvitationItem } from '@/components/project-settings/ProjectMembersSection'

function roleText(role: InvitationItem['role']) {
  return role === 'editor' ? '编辑者' : '查看者'
}

function statusText(invitation: InvitationItem) {
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

function statusColor(invitation: InvitationItem) {
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

export default function ProjectInvitePage() {
  const navigate = useNavigate()
  const { inviteId } = useParams()
  const { user, sessionId } = useAuth()
  const [messageApi, contextHolder] = message.useMessage()
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string>()
  const [invitation, setInvitation] = useState<InvitationItem>()
  const [isCurrentUserMember, setIsCurrentUserMember] = useState(false)

  const redirectTo = useMemo(() => {
    return inviteId ? `/invites/${inviteId}` : '/projects'
  }, [inviteId])

  useEffect(() => {
    if (!inviteId || !sessionId) {
      setError('邀请不存在')
      setLoading(false)
      return
    }

    let cancelled = false

    const fetchInvitation = async () => {
      try {
        setLoading(true)
        const payload = await api<{
          invitation: InvitationItem
          user: { id: string, username: string } | null
          isCurrentUserMember: boolean
        }>('get_project_invitation', {
          sessionId,
          inviteId,
        })

        if (cancelled) return

        setInvitation(payload.invitation)
        setIsCurrentUserMember(payload.isCurrentUserMember)
        setError(undefined)
      }
      catch (error) {
        if (!cancelled) {
          setError((error as Error).message)
        }
      }
      finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchInvitation()

    return () => {
      cancelled = true
    }
  }, [inviteId, sessionId])

  const handleAccept = async () => {
    if (!inviteId || !sessionId) return

    try {
      setAccepting(true)
      const result = await api<{ projectId: string }>('accept_project_invitation', {
        sessionId,
        inviteId,
      })

      messageApi.success('已加入项目')
      navigate(`/projects/${result.projectId}/home`, { replace: true })
    }
    catch (error) {
      messageApi.error((error as Error).message)
    }
    finally {
      setAccepting(false)
    }
  }

  const loginPath = `/login?redirect=${encodeURIComponent(redirectTo)}`
  const registerPath = `/register?redirect=${encodeURIComponent(redirectTo)}`

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      {contextHolder}

      {loading
        ? <Spin size="large" />
        : error
          ? (
              <Result
                status="warning"
                subTitle={error}
                title="邀请不可用"
              />
            )
          : invitation && (
              <Card className="w-full max-w-xl">
                <Space className="w-full" direction="vertical" size={12}>
                  <Typography.Title level={3} style={{ margin: 0 }}>
                    项目邀请
                  </Typography.Title>

                  <Typography.Text>
                    项目名称：
                    {invitation.projectName}
                  </Typography.Text>
                  <Typography.Text>
                    邀请角色：
                    {roleText(invitation.role)}
                  </Typography.Text>
                  <Typography.Text>
                    邀请人：
                    {invitation.inviterUsername}
                  </Typography.Text>
                  <Typography.Text>
                    有效期至：
                    {dayjs(invitation.expiresAt).format('YYYY-MM-DD HH:mm')}
                  </Typography.Text>
                  <Typography.Text>
                    当前状态：
                    {' '}
                    <Tag color={statusColor(invitation)}>
                      {statusText(invitation)}
                    </Tag>
                  </Typography.Text>

                  {invitation.status === 'accepted'
                    ? <Typography.Text type="secondary">该邀请已被使用。</Typography.Text>
                    : invitation.status === 'revoked'
                      ? <Typography.Text type="secondary">该邀请已被撤销。</Typography.Text>
                      : invitation.isExpired
                        ? <Typography.Text type="secondary">该邀请已过期。</Typography.Text>
                        : !user
                          ? (
                              <Space>
                                <Link to={loginPath}>
                                  <Button type="primary">登录后接受邀请</Button>
                                </Link>
                                <Link to={registerPath}>
                                  <Button>注册后接受邀请</Button>
                                </Link>
                              </Space>
                            )
                          : isCurrentUserMember
                            ? <Typography.Text type="secondary">你已经是该项目成员。</Typography.Text>
                            : (
                                <Button
                                  loading={accepting}
                                  type="primary"
                                  onClick={() => {
                                    void handleAccept()
                                  }}
                                >
                                  接受邀请
                                </Button>
                              )}
                </Space>
              </Card>
            )}
    </div>
  )
}
