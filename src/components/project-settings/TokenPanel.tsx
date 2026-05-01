'use client'

import { useCallback, useEffect, useState } from 'react'

import { Button, Input, Modal, Space, Table, Typography, message } from 'antd'
import { CopyIcon, LinkIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'

interface TokenItem {
  id: string
  token: string
  name: string
  createdAt: string
}

export function TokenPanel({ projectId }: { projectId?: string }) {
  const { sessionId } = useAuth()
  const [tokens, setTokens] = useState<TokenItem[]>([])
  const [loading, setLoading] = useState(false)
  const [msgApi, contextHolder] = message.useMessage()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newTokenName, setNewTokenName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newlyCreated, setNewlyCreated] = useState<TokenItem | null>(null)

  // YApi server port state
  const [yapiPort, setYapiPort] = useState<number>(0)
  const [editingPort, setEditingPort] = useState(false)
  const [customPort, setCustomPort] = useState('')
  const [restarting, setRestarting] = useState(false)

  const serverUrl = yapiPort > 0 ? `http://127.0.0.1:${yapiPort}` : '服务器启动中...'

  // Fetch YApi server info
  const fetchYapiInfo = useCallback(async () => {
    try {
      const info = await api<{ port: number; address: string }>('get_yapi_server_info')
      if (info.port > 0) {
        setYapiPort(info.port)
      }
    } catch {
      // Server may not be ready yet
    }
  }, [])

  useEffect(() => {
    void fetchYapiInfo()
  }, [fetchYapiInfo])

  // Handle port change
  const handleSavePort = async () => {
    const portNum = parseInt(customPort, 10)
    if (!portNum || portNum < 1 || portNum > 65535) {
      msgApi.error('请输入有效的端口号 (1-65535)')
      return
    }

    try {
      setRestarting(true)
      const info = await api<{ port: number; address: string }>('restart_yapi_server', { port: portNum })
      setYapiPort(info.port)
      setEditingPort(false)
      msgApi.success(`服务器已切换至端口 ${info.port}`)
    } catch (err) {
      msgApi.error((err as Error).message)
    } finally {
      setRestarting(false)
    }
  }

  const fetchTokens = useCallback(async () => {
    if (!projectId || !sessionId) return

    setLoading(true)

    try {
      const payload = await api<{ tokens?: TokenItem[] }>('list_project_tokens', {
        sessionId,
        projectId,
      })

      setTokens(payload.tokens ?? [])
    } catch (error) {
      msgApi.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [projectId, sessionId, msgApi])

  useEffect(() => {
    void fetchTokens()
  }, [fetchTokens])

  const handleCreate = async () => {
    if (!projectId || !sessionId) return

    setCreating(true)

    try {
      const payload = await api<{ token?: TokenItem }>('create_project_token', {
        sessionId,
        projectId,
        payload: { name: newTokenName.trim() || 'default' },
      })

      if (!payload.token) {
        throw new Error('创建失败')
      }

      setNewlyCreated(payload.token)
      setCreateModalOpen(false)
      setNewTokenName('')
      void fetchTokens()
    } catch (error) {
      msgApi.error((error as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: '删除 Token',
      content: '删除后使用此 Token 的第三方工具将无法访问项目。确定删除？',
      onOk: async () => {
        if (!projectId || !sessionId) return

        try {
          await api('delete_project_token', {
            sessionId,
            projectId,
            tokenId: id,
          })

          void fetchTokens()
        } catch (error) {
          msgApi.error((error as Error).message)
        }
      },
    })
  }

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text)
    msgApi.success('已复制到剪贴板')
  }

  return (
    <div>
      {contextHolder}

      <div className="mb-4 rounded border p-4" style={{ borderColor: '#d9d9d9', backgroundColor: '#fafafa' }}>
        <div className="mb-2 flex items-center gap-2">
          <LinkIcon size={14} />
          <Typography.Text strong>插件同步地址</Typography.Text>
          {yapiPort > 0 && (
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-green-500" title="服务器运行中" />
          )}
        </div>
        <Typography.Text type="secondary" className="mb-3 block text-xs">
          在 EasyAPI 等插件中配置以下 Server URL 和 Token 即可导入接口。
        </Typography.Text>
        <div className="flex items-center gap-2">
          <Typography.Text code className="flex-1 text-sm">{serverUrl}</Typography.Text>
          <Button
            type="text"
            size="small"
            icon={<CopyIcon size={14} />}
            onClick={() => handleCopy(serverUrl)}
          >
            复制
          </Button>
          <Button
            loading={restarting}
            type="text"
            size="small"
            icon={<PencilIcon size={14} />}
            onClick={() => {
              setCustomPort(String(yapiPort || 14202))
              setEditingPort(!editingPort)
            }}
          >
            修改端口
          </Button>
        </div>
      </div>

      {editingPort && (
        <div className="mb-4 flex items-center gap-2 rounded border p-3" style={{ borderColor: '#d9d9d9' }}>
          <Typography.Text className="shrink-0 text-sm">端口：</Typography.Text>
          <Input
            size="small"
            className="w-24"
            placeholder="14202"
            value={customPort}
            onChange={(e) => setCustomPort(e.target.value)}
            onPressEnter={() => void handleSavePort()}
          />
          <Button size="small" type="primary" loading={restarting} onClick={() => void handleSavePort()}>确定</Button>
          <Button size="small" onClick={() => setEditingPort(false)}>取消</Button>
          <Typography.Text type="secondary" className="text-xs">
            修改后插件同步地址将自动更新
          </Typography.Text>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div />
        <Button
          icon={<PlusIcon size={14} />}
          type="primary"
          onClick={() => setCreateModalOpen(true)}
        >
          新建 Token
        </Button>
      </div>

      <Table
        dataSource={tokens}
        loading={loading}
        rowKey="id"
        pagination={false}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            width: 150,
          },
          {
            title: 'Token',
            dataIndex: 'token',
            render: (text: string) => (
              <Space>
                <Typography.Text code className="text-xs">{text}</Typography.Text>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyIcon size={14} />}
                  onClick={() => handleCopy(text)}
                />
              </Space>
            ),
          },
          {
            title: '创建时间',
            dataIndex: 'createdAt',
            width: 180,
            render: (text: string) => new Date(text).toLocaleString(),
          },
          {
            title: '操作',
            width: 80,
            render: (_: unknown, record: TokenItem) => (
              <Button
                type="text"
                danger
                size="small"
                icon={<TrashIcon size={14} />}
                onClick={() => handleDelete(record.id)}
              />
            ),
          },
        ]}
      />

      {newlyCreated && (
        <Modal
          open
          title="Token 已创建"
          onCancel={() => setNewlyCreated(null)}
          footer={<Button onClick={() => setNewlyCreated(null)}>关闭</Button>}
        >
          <Typography.Paragraph type="warning">
            该token需要放在IDEA插件中进行使用
          </Typography.Paragraph>
          <div className="flex items-center gap-2 rounded bg-gray-50 p-3">
            <Typography.Text code className="flex-1 text-sm">{newlyCreated.token}</Typography.Text>
            <Button
              icon={<CopyIcon size={14} />}
              onClick={() => handleCopy(newlyCreated.token)}
            >
              复制
            </Button>
          </div>
          <Typography.Paragraph className="mt-3" type="secondary">
            配置方式：在 IDEA 的 EasyAPI 插件中，将 Server URL 设置为
            <Typography.Text code>{serverUrl}</Typography.Text>
            ，Token 设置为上方的值。
          </Typography.Paragraph>
        </Modal>
      )}

      <Modal
        open={createModalOpen}
        title="新建 Token"
        onCancel={() => {
          setCreateModalOpen(false)
          setNewTokenName('')
        }}
        onOk={() => void handleCreate()}
        confirmLoading={creating}
      >
        <div className="py-2">
          <Typography.Text className="mb-2 block">名称（可选）</Typography.Text>
          <Input
            placeholder="default"
            value={newTokenName}
            onChange={(e) => setNewTokenName(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}
