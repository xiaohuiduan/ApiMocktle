'use client'

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { show } from '@ebay/nice-modal-react'
import { Button, Checkbox, Form, Input, message, Segmented, Select, theme, Tooltip, Typography } from 'antd'
import { SettingsIcon } from 'lucide-react'

import { IconLogo } from '@/components/icons/IconLogo'
import { ModalSettings } from '@/components/modals/ModalSettings'
import { ParticleCanvas } from '@/components/ParticleCanvas'
import { getSavedCredentials, useAuth } from '@/contexts/auth'
import { useDesignStyle } from '@/hooks/useDesignStyle'
import { resolveAuthRedirectTarget } from '@/router/auth-redirect'

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
  const { token } = theme.useToken()
  const { isGlassStyle, isNeumorphism, isSkeuomorphism } = useDesignStyle()
  const [submitting, setSubmitting] = useState(false)
  const [rememberPassword, setRememberPassword] = useState(false)
  const [rememberLogin, setRememberLogin] = useState(false)
  const [rememberDays, setRememberDays] = useState<number>(7)
  // 登录/注册在卡片内 Tab 切换，不再整页跳转（props.mode 仅作为初始值）
  const [mode, setMode] = useState<'login' | 'register'>(props.mode)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, register } = useAuth()
  const redirectTo = resolveAuthRedirectTarget(searchParams.get('redirect'))
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
      <ParticleCanvas preset="login" primaryColor={token.colorPrimary} variant="fullscreen" />
      <div className="fixed right-4 top-4 z-50">
        <Tooltip title="全局设置">
          <Button
            icon={<SettingsIcon size={18} />}
            type="text"
            onClick={() => void show(ModalSettings)}
          />
        </Tooltip>
      </div>
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-xl"
        style={{
          backgroundColor: isGlassStyle ? 'var(--ds-bg-elevated)' : token.colorBgContainer,
          backdropFilter: isGlassStyle ? 'blur(var(--ds-blur)) saturate(var(--ds-saturate)) brightness(var(--ds-brightness))' : undefined,
          WebkitBackdropFilter: isGlassStyle ? 'blur(var(--ds-blur)) saturate(var(--ds-saturate)) brightness(var(--ds-brightness))' : undefined,
          border: isGlassStyle ? 'var(--ds-border)' : isNeumorphism ? 'none' : undefined,
          borderTop: isGlassStyle ? 'var(--ds-border-top)' : undefined,
          boxShadow: isGlassStyle
            ? 'var(--ds-shadow-lg)'
            : isNeumorphism
              ? 'var(--ds-shadow-lg)'
              : isSkeuomorphism
                ? 'var(--ds-shadow-lg)'
                : '0 4px 24px rgba(0,0,0,0.08), 0 0 0 1px var(--color-border)',
          animation: 'card-slide-up 0.5s ease-out',
        }}
      >
        {/* Brand header */}
        <div
          className="flex items-center gap-3 px-6 pb-4 pt-6"
          style={{ borderBottom: isGlassStyle ? 'var(--ds-border-subtle)' : `1px solid ${token.colorBorderSecondary}` }}
        >
          <span
            className="inline-flex size-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: token.colorPrimaryBg }}
          >
            <span style={{ color: token.colorPrimary }}>
              <IconLogo />
            </span>
          </span>
          <div>
            <div
              className="text-base font-semibold"
              style={{ color: token.colorText }}
            >
              ApiMocktle
            </div>
            <div
              className="text-xs"
              style={{ color: token.colorTextSecondary }}
            >
              本地 API 管理工具
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 pb-6 pt-4">
          <Segmented
            block
            className="mb-5"
            options={[
              { label: '登录', value: 'login' },
              { label: '注册', value: 'register' },
            ]}
            value={mode}
            onChange={(value) => {
              setMode(value as 'login' | 'register')
            }}
          />

          <Form<{ username: string, password: string }>
            form={form}
            layout="vertical"
            onFinish={(values) => {
              void (async () => {
                setSubmitting(true)

                try {
                  if (mode === 'login') {
                    await login(values.username, values.password, {
                      rememberPassword,
                      rememberDays: rememberLogin ? rememberDays : 0,
                    })
                  }
                  else {
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
              })()
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
                className="border-b"
                placeholder="请输入用户名"
                style={{
                  borderBottom: `2px solid ${token.colorBorderSecondary}`,
                  borderRadius: 0,
                  paddingLeft: 0,
                }}
                variant="borderless"
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
                className="border-b"
                placeholder="请输入密码"
                style={{
                  borderBottom: `2px solid ${token.colorBorderSecondary}`,
                  borderRadius: 0,
                  paddingLeft: 0,
                }}
                variant="borderless"
              />
            </Form.Item>

            {mode === 'login' && (
              <>
                <Form.Item>
                  <Checkbox
                    checked={rememberPassword}
                    onChange={(e) => { setRememberPassword(e.target.checked) }}
                  >
                    记住账号密码
                  </Checkbox>
                </Form.Item>

                <Form.Item>
                  <Checkbox
                    checked={rememberLogin}
                    onChange={(e) => { setRememberLogin(e.target.checked) }}
                  >
                    保持登录状态
                  </Checkbox>
                </Form.Item>

                {/* 常驻渲染，未勾选时禁用——避免条件插入导致卡片高度跳动 */}
                <Form.Item label="登录状态时长">
                  <Select
                    disabled={!rememberLogin}
                    options={rememberDayOptions}
                    style={{ width: 120 }}
                    value={rememberDays}
                    onChange={(v) => { setRememberDays(v) }}
                  />
                </Form.Item>

                <Typography.Text className="block text-xs" type="secondary">
                  “记住账号密码”会在本机保存凭据；“保持登录状态”会延长会话有效期。
                </Typography.Text>
              </>
            )}

            <Form.Item>
              <Button
                block
                htmlType="submit"
                loading={submitting}
                size="large"
                style={{
                  borderRadius: 8,
                  height: 44,
                }}
                type="primary"
              >
                {mode === 'login' ? '登录' : '注册'}
              </Button>
            </Form.Item>
          </Form>

          <Typography.Text type="secondary">
            {mode === 'login' ? '没有账号？' : '已有账号？'}
            {' '}
            <Typography.Link
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
              }}
            >
              {mode === 'login' ? '去注册' : '去登录'}
            </Typography.Link>
          </Typography.Text>
        </div>
      </div>
    </div>
  )
}
