'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

export function AuthForm(props: AuthFormProps) {
  const { t } = useTranslation()
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

  const rememberDayOptions = useMemo(
    () => [
      { label: t('app.auth.rememberDays.one'), value: 1 },
      { label: t('app.auth.rememberDays.three'), value: 3 },
      { label: t('app.auth.rememberDays.seven'), value: 7 },
      { label: t('app.auth.rememberDays.thirty'), value: 30 },
      { label: t('app.auth.rememberDays.forever'), value: -1 },
    ],
    [t],
  )

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
        <Tooltip title={t('app.shell.globalSettings')}>
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
              {t('app.auth.brandSubtitle')}
            </div>
            <div
              className="mt-1 text-xs leading-5"
              style={{ color: token.colorTextTertiary }}
            >
              {t('app.auth.privacyNotice')}
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 pb-6 pt-4">
          <Segmented
            block
            className="mb-5"
            options={[
              { label: t('app.auth.tabLogin'), value: 'login' },
              { label: t('app.auth.tabRegister'), value: 'register' },
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

                  message.success(mode === 'login' ? t('app.auth.loginSuccess') : t('app.auth.registerSuccess'))
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
              label={t('app.auth.username')}
              name="username"
              rules={[
                { required: true, message: t('app.auth.usernameRequired') },
                { min: 3, message: t('app.validation.minChars', { count: 3 }) },
              ]}
            >
              <Input
                className="border-b"
                placeholder={t('app.auth.usernamePlaceholder')}
                style={{
                  borderBottom: `2px solid ${token.colorBorderSecondary}`,
                  borderRadius: 0,
                  paddingLeft: 0,
                }}
                variant="borderless"
              />
            </Form.Item>

            <Form.Item
              label={t('app.auth.password')}
              name="password"
              rules={[
                { required: true, message: t('app.auth.passwordRequired') },
                { min: 6, message: t('app.validation.minChars', { count: 6 }) },
              ]}
            >
              <Input.Password
                className="border-b"
                placeholder={t('app.auth.passwordPlaceholder')}
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
                    {t('app.auth.rememberPassword')}
                  </Checkbox>
                </Form.Item>

                <Form.Item>
                  <Checkbox
                    checked={rememberLogin}
                    onChange={(e) => { setRememberLogin(e.target.checked) }}
                  >
                    {t('app.auth.keepLoggedIn')}
                  </Checkbox>
                </Form.Item>

                {/* 常驻渲染，未勾选时禁用——避免条件插入导致卡片高度跳动 */}
                <Form.Item label={t('app.auth.loginDuration')}>
                  <Select
                    disabled={!rememberLogin}
                    options={rememberDayOptions}
                    style={{ width: 120 }}
                    value={rememberDays}
                    onChange={(v) => { setRememberDays(v) }}
                  />
                </Form.Item>

                <Typography.Text className="block text-xs" type="secondary">
                  {t('app.auth.rememberHint')}
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
                {mode === 'login' ? t('app.auth.submitLogin') : t('app.auth.submitRegister')}
              </Button>
            </Form.Item>
          </Form>

          <Typography.Text type="secondary">
            {mode === 'login' ? t('app.auth.noAccount') : t('app.auth.hasAccount')}
            {' '}
            <Typography.Link
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
              }}
            >
              {mode === 'login' ? t('app.auth.goRegister') : t('app.auth.goLogin')}
            </Typography.Link>
          </Typography.Text>
        </div>
      </div>
    </div>
  )
}
