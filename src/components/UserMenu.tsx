import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Button, Dropdown, Form, Input, message, Modal } from 'antd'
import { KeyIcon, LogOutIcon, UserCircle2Icon } from 'lucide-react'

import { useAuth } from '@/contexts/auth'

interface UserMenuProps {
  showUsername?: boolean
}

export function UserMenu({ showUsername = true }: UserMenuProps) {
  const navigate = useNavigate()
  const { user, logout, changePassword } = useAuth()

  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwdSubmitting, setPwdSubmitting] = useState(false)
  const [pwdForm] = Form.useForm<{ oldPassword: string, newPassword: string, confirmPassword: string }>()

  const handleChangePassword = async (v: { oldPassword: string, newPassword: string, confirmPassword: string }) => {
    if (v.newPassword !== v.confirmPassword) {
      message.error('两次新密码不一致')

      return
    }

    setPwdSubmitting(true)

    try {
      await changePassword(v.oldPassword, v.newPassword)
      message.success('密码修改成功')
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

  if (!user) { return null }

  return (
    <>
      <Dropdown
        menu={{
          items: [
            { key: 'user', label: user.username, icon: <UserCircle2Icon size={16} />, disabled: true },
            { type: 'divider' as const },
            { key: 'projects', label: '项目列表', icon: <UserCircle2Icon size={16} /> },
            { key: 'changePassword', label: '修改密码', icon: <KeyIcon size={16} /> },
            { type: 'divider' as const },
            { key: 'logout', label: '退出登录', icon: <LogOutIcon size={16} /> },
          ],
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
        title="修改密码"
        onCancel={() => {
          setPwdOpen(false)
          pwdForm.resetFields()
        }}
      >
        <Form form={pwdForm} layout="vertical" onFinish={(v) => void handleChangePassword(v)}>
          <Form.Item label="旧密码" name="oldPassword" rules={[{ required: true, message: '请输入旧密码' }]}>
            <Input.Password placeholder="请输入旧密码" />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '至少 6 个字符' }]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          <Form.Item label="确认新密码" name="confirmPassword" rules={[{ required: true, message: '请确认新密码' }]}>
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
          <Form.Item>
            <Button block htmlType="submit" loading={pwdSubmitting} type="primary">
              确认修改
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
