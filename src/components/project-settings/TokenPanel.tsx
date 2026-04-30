'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button, Input, Modal, Space, Table, Typography, message } from 'antd'
import { CopyIcon, LinkIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react'

interface TokenItem {
  id: string
  token: string
  name: string
  created_at: string
}

const PORT_STORAGE_KEY = 'token_panel_custom_port'

export function TokenPanel({ projectId }: { projectId?: string }) {
  const [tokens, setTokens] = useState<TokenItem[]>([])
  const [loading, setLoading] = useState(false)
  const [msgApi, contextHolder] = message.useMessage()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newTokenName, setNewTokenName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newlyCreated, setNewlyCreated] = useState<TokenItem | null>(null)
  const [editingPort, setEditingPort] = useState(false)
  const [customPort, setCustomPort] = useState(() => {
    try { return localStorage.getItem(PORT_STORAGE_KEY) ?? '' }
    catch { return '' }
  })

  const serverUrl = useMemo(() => {
    const loc = window.location
    const port = customPort || loc.port || (loc.protocol === 'https:' ? '443' : '80')
    return `${loc.protocol}//${loc.hostname}:${port}`
  }, [customPort])

  const handleSavePort = () => {
    try { localStorage.setItem(PORT_STORAGE_KEY, customPort) }
    catch { /* ignore */ }
    setEditingPort(false)
  }

  const fetchTokens = useCallback(async () => {
    if (!projectId) return

    setLoading(true)

    try {
      const resp = await fetch(`/api/v1/projects/${projectId}/tokens`, {
        credentials: 'include',
      })
      const payload = await resp.json() as { ok: boolean, data?: TokenItem[], error?: string }

      if (!resp.ok || !payload.ok) {
        throw new Error(payload.error ?? '加载失败')
      }

      setTokens(payload.data ?? [])
    }
    catch (error) {
      msgApi.error((error as Error).message)
    }
    finally {
      setLoading(false)
    }
  }, [projectId, msgApi])

  useEffect(() => {
    void fetchTokens()
  }, [fetchTokens])

  const handleCreate = async () => {
    if (!projectId) return

    setCreating(true)

    try {
      const resp = await fetch(`/api/v1/projects/${projectId}/tokens`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTokenName.trim() || 'default' }),
      })
      const payload = await resp.json() as { ok: boolean, data?: TokenItem, error?: string }

      if (!resp.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? '创建失败')
      }

      setNewlyCreated(payload.data)
      setCreateModalOpen(false)
      setNewTokenName('')
      void fetchTokens()
    }
    catch (error) {
      msgApi.error((error as Error).message)
    }
    finally {
      setCreating(false)
    }
  }

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: '删除 Token',
      content: '删除后使用此 Token 的第三方工具将无法访问项目。确定删除？',
      onOk: async () => {
        if (!projectId) return

        try {
          const resp = await fetch(`/api/v1/projects/${projectId}/tokens`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          })
          const payload = await resp.json() as { ok: boolean, error?: string }

          if (!resp.ok || !payload.ok) {
            throw new Error(payload.error ?? '删除失败')
          }

          void fetchTokens()
        }
        catch (error) {
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
            type="text"
            size="small"
            icon={<PencilIcon size={14} />}
            onClick={() => {
              setCustomPort(window.location.port || '')
              setEditingPort(true)
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
            placeholder={window.location.port || '5174'}
            value={customPort}
            onChange={(e) => setCustomPort(e.target.value)}
            onPressEnter={handleSavePort}
          />
          <Button size="small" type="primary" onClick={handleSavePort}>确定</Button>
          <Button size="small" onClick={() => setEditingPort(false)}>取消</Button>
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
            dataIndex: 'created_at',
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
