import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { Button, Dropdown, Form, Input, message, Modal } from 'antd'
import { KeyIcon, LogOutIcon, UserCircle2Icon } from 'lucide-react'

import { useAuth } from '@/contexts/auth'

interface UserMenuProps {
  showUsername?: boolean
}

export function UserMenu({ showUsername = true }: UserMenuProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, logout, changePassword } = useAuth()

  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwdSubmitting, setPwdSubmitting] = useState(false)
  const [pwdForm] = Form.useForm<{ oldPassword: string, newPassword: string, confirmPassword: string }>()

  const handleChangePassword = async (v: { oldPassword: string, newPassword: string, confirmPassword: string }) => {
    if (v.newPassword !== v.confirmPassword) {
      message.error(t('app.auth.changePassword.mismatch'))

      return
    }

    setPwdSubmitting(true)

    try {
      await changePassword(v.oldPassword, v.newPassword)
      message.success(t('app.auth.changePassword.success'))
      setPwdOpen(false)
      pwdForm.resetFields()
    }
    catch (err) {
      message.error((err as Error).message)
    }
    finally {
      setPwdSubmitting(false)
    }
  }

  const menuItems = useMemo(
    () => [
      { key: 'user', label: user?.username, icon: <UserCircle2Icon size={16} />, disabled: true },
      { type: 'divider' as const },
      { key: 'projects', label: t('app.userMenu.projects'), icon: <UserCircle2Icon size={16} /> },
      { key: 'changePassword', label: t('app.userMenu.changePassword'), icon: <KeyIcon size={16} /> },
      { type: 'divider' as const },
      { key: 'logout', label: t('app.userMenu.logout'), icon: <LogOutIcon size={16} /> },
    ],
    [t, user?.username],
  )

  if (!user) { return null }

  return (
    <>
      <Dropdown
        menu={{
          items: menuItems,
          onClick: ({ key }) => {
            if (key === 'projects') { navigate('/projects') }

            if (key === 'changePassword') { setPwdOpen(true) }

            if (key === 'logout') {
              void logout().finally(() => {
                void navigate('/login', { replace: true })
              })
            }
          },
        }}
      >
        <Button icon={<UserCircle2Icon size={16} />} size="small" type="text">
          {showUsername && user.username}
        </Button>
      </Dropdown>

      <Modal
        destroyOnClose
        footer={null}
        open={pwdOpen}
        title={t('app.auth.changePassword.title')}
        onCancel={() => {
          setPwdOpen(false)
          pwdForm.resetFields()
        }}
      >
        <Form form={pwdForm} layout="vertical" onFinish={(v) => void handleChangePassword(v)}>
          <Form.Item
            label={t('app.auth.changePassword.oldPassword')}
            name="oldPassword"
            rules={[{ required: true, message: t('app.auth.changePassword.oldPasswordRequired') }]}
          >
            <Input.Password placeholder={t('app.auth.changePassword.oldPasswordPlaceholder')} />
          </Form.Item>
          <Form.Item
            label={t('app.auth.changePassword.newPassword')}
            name="newPassword"
            rules={[
              { required: true, message: t('app.auth.changePassword.newPasswordRequired') },
              { min: 6, message: t('app.validation.minChars', { count: 6 }) },
            ]}
          >
            <Input.Password placeholder={t('app.auth.changePassword.newPasswordPlaceholder')} />
          </Form.Item>
          <Form.Item
            label={t('app.auth.changePassword.confirmPassword')}
            name="confirmPassword"
            rules={[{ required: true, message: t('app.auth.changePassword.confirmPasswordRequired') }]}
          >
            <Input.Password placeholder={t('app.auth.changePassword.confirmPasswordPlaceholder')} />
          </Form.Item>
          <Form.Item>
            <Button block htmlType="submit" loading={pwdSubmitting} type="primary">
              {t('app.auth.changePassword.submit')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
