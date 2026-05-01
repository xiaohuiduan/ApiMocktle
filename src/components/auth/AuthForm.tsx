'use client'

import { useState } from 'react'

import { Button, Card, Form, Input, Typography, message } from 'antd'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { useAuth } from '@/contexts/auth'

function resolveRedirectTarget(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/projects'
  }
  return value
}

interface AuthFormProps {
  mode: 'login' | 'register'
}

export function AuthForm(props: AuthFormProps) {
  const { mode } = props
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, register } = useAuth()
  const redirectTo = resolveRedirectTarget(searchParams.get('redirect'))
  const peerAuthPath = `${mode === 'login' ? '/register' : '/login'}?redirect=${encodeURIComponent(redirectTo)}`

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <Typography.Title level={3}>
          {mode === 'login' ? '登录' : '注册'}
        </Typography.Title>

        <Form<{ username: string, password: string }>
          layout="vertical"
          onFinish={async (values) => {
            setSubmitting(true)

            try {
              if (mode === 'login') {
                await login(values.username, values.password)
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
            <Input placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '至少 6 个字符' },
            ]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>

          <Form.Item>
            <Button block htmlType="submit" loading={submitting} type="primary">
              {mode === 'login' ? '登录' : '注册'}
            </Button>
          </Form.Item>
        </Form>

        <Typography.Text type="secondary">
          {mode === 'login' ? '没有账号？' : '已有账号？'}
          {' '}
          <Link to={peerAuthPath}>
            {mode === 'login' ? '去注册' : '去登录'}
          </Link>
        </Typography.Text>
      </Card>
    </div>
  )
}
