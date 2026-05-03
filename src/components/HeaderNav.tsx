import { useMemo, useState } from 'react'

import { show } from '@ebay/nice-modal-react'
import { Button, Dropdown, Form, Input, Modal, Space, type MenuProps, message } from 'antd'
import { ArrowLeftIcon, InfoIcon, KeyIcon, LogOutIcon, RefreshCw, SettingsIcon, UserCircle2Icon } from 'lucide-react'
import { useNavigate } from 'react-router'

import { useAuth } from '@/contexts/auth'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'

import { IconLogo } from '@/components/icons/IconLogo'
import { ModalSettings, SettingsMenuKey } from '@/components/modals/ModalSettings'
import { ProjectQuickSwitch } from '@/components/ProjectQuickSwitch'

const ABOUT_MENU_KEY = 'about'

export function HeaderNav() {
  const navigate = useNavigate()
  const { user, logout, changePassword } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const { reloadState } = useMenuHelpersContext()
  const username = user?.username
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [pwdSubmitting, setPwdSubmitting] = useState(false)
  const [pwdForm] = Form.useForm<{ oldPassword: string, newPassword: string, confirmPassword: string }>()

  const handleChangePassword = async (values: { oldPassword: string, newPassword: string, confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次新密码不一致')
      return
    }
    setPwdSubmitting(true)
    try {
      await changePassword(values.oldPassword, values.newPassword)
      message.success('密码修改成功')
      setPwdModalOpen(false)
      pwdForm.resetFields()
    } catch (err) {
      message.error((err as Error).message)
    } finally {
      setPwdSubmitting(false)
    }
  }

  const accountMenu = useMemo<MenuProps>(() => ({
    items: [
      {
        key: 'projects',
        label: '项目列表',
        icon: <UserCircle2Icon size={16} />,
      },
      {
        key: 'changePassword',
        label: '修改密码',
        icon: <KeyIcon size={16} />,
      },
      { type: 'divider' },
      {
        key: 'logout',
        label: '退出登录',
        icon: <LogOutIcon size={16} />,
      },
    ],
    onClick: ({ key }) => {
      if (key === 'projects') {
        navigate('/projects')
        return
      }

      if (key === 'changePassword') {
        setPwdModalOpen(true)
        return
      }

      if (key === 'logout') {
        void logout().finally(() => {
          navigate('/login', { replace: true })
        })
      }
    },
  }), [navigate, logout])

  return (
    <div className="flex h-full items-center">
      <div className="ml-auto">
        <Space size={4}>
          <Button
            icon={<RefreshCw size={14} />}
            size="small"
            loading={refreshing}
            onClick={async () => {
              setRefreshing(true)
              await reloadState()
              setRefreshing(false)
            }}
          >
            刷新
          </Button>

          <Button
            icon={<ArrowLeftIcon size={14} />}
            size="small"
            onClick={() => {
              navigate('/projects')
            }}
          >
            项目列表
          </Button>

          <ProjectQuickSwitch />

          {username && (
            <Dropdown menu={accountMenu}>
              <Button size="small" type="text" icon={<UserCircle2Icon size={16} />}>
                {username}
              </Button>
            </Dropdown>
          )}

          <Button
            icon={<SettingsIcon size={14} />}
            size="small"
            type="text"
            onClick={() => {
              void show(ModalSettings)
            }}
          />

          <Dropdown
            menu={{
              items: [
                {
                  key: ABOUT_MENU_KEY,
                  label: '关于项目',
                  icon: <InfoIcon size={16} />,
                },
              ],
              onClick: ({ key }) => {
                if (key === ABOUT_MENU_KEY) {
                  void show(ModalSettings, { selectedKey: SettingsMenuKey.About })
                }
              },
            }}
          >
            <Button
              icon={(
                <div className="inline-flex size-4 items-center justify-center">
                  <IconLogo />
                </div>
              )}
              size="small"
              type="text"
            />
          </Dropdown>
        </Space>
      </div>

      <Modal
        title="修改密码"
        open={pwdModalOpen}
        onCancel={() => { setPwdModalOpen(false); pwdForm.resetFields() }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={pwdForm}
          layout="vertical"
          onFinish={(v) => void handleChangePassword(v)}
        >
          <Form.Item
            label="旧密码"
            name="oldPassword"
            rules={[{ required: true, message: '请输入旧密码' }]}
          >
            <Input.Password placeholder="请输入旧密码" />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '至少 6 个字符' },
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            rules={[{ required: true, message: '请确认新密码' }]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
          <Form.Item>
            <Button block htmlType="submit" loading={pwdSubmitting} type="primary">
              确认修改
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
