'use client'

import { useEffect, useState } from 'react'

import { Button, Checkbox, Form, Input, Select, Typography, message, theme } from 'antd'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { IconLogo } from '@/components/icons/IconLogo'
import { ParticleCanvas } from '@/components/ParticleCanvas'
import { getSavedCredentials, useAuth } from '@/contexts/auth'

function resolveRedirectTarget(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/projects'
  }
  return value
}

interface AuthFormProps {
  mode: 'login' | 'register'
}

const rememberDayOptions = [
  { label: '1 天', value: 1 },
  { label: '3 天', value: 3 },
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '永久', value: -1 },
]

export function AuthForm(props: AuthFormProps) {
  const { mode } = props
  const { token } = theme.useToken()
  const [submitting, setSubmitting] = useState(false)
  const [rememberPassword, setRememberPassword] = useState(false)
  const [rememberDays, setRememberDays] = useState<number>(7)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, register } = useAuth()
  const redirectTo = resolveRedirectTarget(searchParams.get('redirect'))
  const peerAuthPath = `${mode === 'login' ? '/register' : '/login'}?redirect=${encodeURIComponent(redirectTo)}`
  const [form] = Form.useForm<{ username: string, password: string }>()

  useEffect(() => {
    if (mode === 'login') {
      const creds = getSavedCredentials()
      if (creds) {
        form.setFieldsValue(creds)
        setRememberPassword(true)
      }
    }
  }, [form, mode])

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <ParticleCanvas variant="fullscreen" preset="login" primaryColor={token.colorPrimary} />
      <div
        className="w-full max-w-md overflow-hidden rounded-xl"
        style={{
          backgroundColor: 'var(--color-bg-panel)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08), 0 0 0 1px var(--color-border)',
          animation: 'card-slide-up 0.5s ease-out',
        }}
      >
        {/* Brand header */}
        <div
          className="flex items-center gap-3 px-6 pt-6 pb-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <span
            className="inline-flex size-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'var(--color-accent-bg)' }}
          >
            <span style={{ color: 'var(--color-accent)' }}>
              <IconLogo />
            </span>
          </span>
          <div>
            <div
              className="text-base font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              ApiMocktle
            </div>
            <div
              className="text-xs"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              本地 API 管理工具
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 pt-4 pb-6">
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>
            {mode === 'login' ? '欢迎回来' : '创建账号'}
          </Typography.Title>

          <Form<{ username: string, password: string }>
            form={form}
            layout="vertical"
            onFinish={async (values) => {
              setSubmitting(true)

              try {
                if (mode === 'login') {
                  await login(values.username, values.password, {
                    rememberPassword,
                    rememberDays: rememberPassword ? rememberDays : 0,
                  })
                } else {
                  await register(values.username, values.password)
                }

                message.success(mode === 'login' ? '登录成功' : '注册成功')
                navigate(redirectTo, { replace: true })
              }
              catch (error) {
                message.error((error as Error).message)
              }
              finally {
                setSubmitting(false)
              }
            }}
          >
            <Form.Item
              label="用户名"
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, message: '至少 3 个字符' },
              ]}
            >
              <Input
                placeholder="请输入用户名"
                variant="borderless"
                className="border-b"
                style={{
                  borderBottom: '2px solid var(--color-border)',
                  borderRadius: 0,
                  paddingLeft: 0,
                }}
              />
            </Form.Item>

            <Form.Item
              label="密码"
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '至少 6 个字符' },
              ]}
            >
              <Input.Password
                placeholder="请输入密码"
                variant="borderless"
                className="border-b"
                style={{
                  borderBottom: '2px solid var(--color-border)',
                  borderRadius: 0,
                  paddingLeft: 0,
                }}
              />
            </Form.Item>

            {mode === 'login' && (
              <>
                <Form.Item>
                  <Checkbox
                    checked={rememberPassword}
                    onChange={(e) => setRememberPassword(e.target.checked)}
                  >
                    记住密码
                  </Checkbox>
                </Form.Item>

                {rememberPassword && (
                  <Form.Item label="记住登录状态">
                    <Select
                      options={rememberDayOptions}
                      value={rememberDays}
                      onChange={(v) => setRememberDays(v)}
                      style={{ width: 120 }}
                    />
                  </Form.Item>
                )}
              </>
            )}

            <Form.Item>
              <Button
                block
                htmlType="submit"
                loading={submitting}
                type="primary"
                size="large"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  borderColor: 'var(--color-accent)',
                  borderRadius: 8,
                  height: 44,
                }}
              >
                {mode === 'login' ? '登录' : '注册'}
              </Button>
            </Form.Item>
          </Form>

          <Typography.Text type="secondary">
            {mode === 'login' ? '没有账号？' : '已有账号？'}
            {' '}
            <Link to={peerAuthPath} style={{ color: 'var(--color-accent)' }}>
              {mode === 'login' ? '去注册' : '去登录'}
            </Link>
          </Typography.Text>
        </div>
      </div>
    </div>
  )
}
