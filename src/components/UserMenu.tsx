import { useCallback, useEffect, useState } from 'react'

import { Button, Dropdown, Form, Input, List, Modal, Popconfirm, Space, Typography, message } from 'antd'
import { CopyIcon, KeyIcon, KeyRoundIcon, LogOutIcon, TrashIcon, UserCircle2Icon } from 'lucide-react'
import { useNavigate } from 'react-router'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'

interface PersonalToken {
  id: string
  token: string
  name: string
  createdAt: string
}

export function UserMenu() {
  const navigate = useNavigate()
  const { user, sessionId, logout, changePassword } = useAuth()

  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwdSubmitting, setPwdSubmitting] = useState(false)
  const [pwdForm] = Form.useForm<{ oldPassword: string, newPassword: string, confirmPassword: string }>()

  const [tokenOpen, setTokenOpen] = useState(false)
  const [tokens, setTokens] = useState<PersonalToken[]>([])
  const [loadingTokens, setLoadingTokens] = useState(false)

  const loadTokens = useCallback(async () => {
    if (!sessionId) return
    setLoadingTokens(true)
    try { setTokens(await api<PersonalToken[]>('list_personal_tokens', { sessionId })) } catch { /* ignore */ }
    finally { setLoadingTokens(false) }
  }, [sessionId])

  useEffect(() => { if (tokenOpen) loadTokens() }, [tokenOpen, loadTokens])

  const handleCreateToken = async (values: { name: string }) => {
    if (!sessionId) return
    try { await api('create_personal_token', { sessionId, name: values.name }); message.success('Token 已创建'); await loadTokens() }
    catch (err) { message.error((err as Error).message) }
  }

  const handleDeleteToken = async (tokenId: string) => {
    if (!sessionId) return
    try { await api('delete_personal_token', { sessionId, token_id: tokenId }); message.success('已删除'); await loadTokens() }
    catch (err) { message.error((err as Error).message) }
  }

  const handleChangePassword = async (v: { oldPassword: string, newPassword: string, confirmPassword: string }) => {
    if (v.newPassword !== v.confirmPassword) { message.error('两次新密码不一致'); return }
    setPwdSubmitting(true)
    try { await changePassword(v.oldPassword, v.newPassword); message.success('密码修改成功'); setPwdOpen(false); pwdForm.resetFields() }
    catch (err) { message.error((err as Error).message) }
    finally { setPwdSubmitting(false) }
  }

  if (!user) return null

  return (
    <>
      <Dropdown
        menu={{
          items: [
            { key: 'projects', label: '项目列表', icon: <UserCircle2Icon size={16} /> },
            { key: 'tokens', label: '管理 Token', icon: <KeyRoundIcon size={16} /> },
            { key: 'changePassword', label: '修改密码', icon: <KeyIcon size={16} /> },
            { type: 'divider' as const },
            { key: 'logout', label: '退出登录', icon: <LogOutIcon size={16} /> },
          ],
          onClick: ({ key }) => {
            if (key === 'projects') navigate('/projects')
            if (key === 'tokens') setTokenOpen(true)
            if (key === 'changePassword') setPwdOpen(true)
            if (key === 'logout') void logout().finally(() => navigate('/login', { replace: true }))
          },
        }}
      >
        <Button size="small" type="text" icon={<UserCircle2Icon size={16} />}>
          {user.username}
        </Button>
      </Dropdown>

      <Modal title="修改密码" open={pwdOpen} onCancel={() => { setPwdOpen(false); pwdForm.resetFields() }} footer={null} destroyOnClose>
        <Form form={pwdForm} layout="vertical" onFinish={(v) => void handleChangePassword(v)}>
          <Form.Item label="旧密码" name="oldPassword" rules={[{ required: true, message: '请输入旧密码' }]}>
            <Input.Password placeholder="请输入旧密码" />
          </Form.Item>
          <Form.Item label="新密码" name="newPassword" rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '至少 6 个字符' }]}>
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          <Form.Item label="确认新密码" name="confirmPassword" rules={[{ required: true, message: '请确认新密码' }]}>
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
          <Form.Item><Button block htmlType="submit" loading={pwdSubmitting} type="primary">确认修改</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title="管理个人 Token" open={tokenOpen} onCancel={() => setTokenOpen(false)} footer={null} destroyOnClose>
        <Form layout="inline" className="mb-4" onFinish={(v) => void handleCreateToken(v)}>
          <Form.Item name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="Token 名称" style={{ width: 200 }} />
          </Form.Item>
          <Form.Item><Button htmlType="submit" type="primary">创建</Button></Form.Item>
        </Form>
        <List loading={loadingTokens} dataSource={tokens} locale={{ emptyText: '暂无 Token' }}
          renderItem={(item) => (
            <List.Item actions={[
              <Popconfirm key="del" title="确定删除？" onConfirm={() => void handleDeleteToken(item.id)}>
                <Button danger icon={<TrashIcon size={14} />} size="small" type="text" />
              </Popconfirm>,
            ]}>
              <List.Item.Meta title={item.name} description={
                <Space>
                  <Typography.Text code>{item.token}</Typography.Text>
                  <Button icon={<CopyIcon size={12} />} size="small" type="text"
                    onClick={() => { navigator.clipboard.writeText(item.token).then(() => message.success('已复制')) }} />
                </Space>
              } />
            </List.Item>
          )}
        />
      </Modal>
    </>
  )
}
