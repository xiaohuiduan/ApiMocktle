import { useCallback, useEffect, useMemo, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'
import {
  Alert,
  Button,
  Card,
  message,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import { Link2, Play, Plus } from 'lucide-react'

import { useAuth } from '@/contexts/auth'

import { CreateShareModal, type ShareLink } from './CreateShareModal'

interface ShareServerStatus {
  running: boolean
  port: number
}

export function ProjectSharePanel({ projectId }: { projectId: string }) {
  const { sessionId } = useAuth()
  const [status, setStatus] = useState<ShareServerStatus>({ running: false, port: 0 })
  const [lanIps, setLanIps] = useState<string[]>([])
  const [links, setLinks] = useState<ShareLink[]>([])
  const [starting, setStarting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [msgApi, contextHolder] = message.useMessage()

  const fetchStatus = useCallback(async () => {
    try {
      const result = await invoke<{ ok: boolean, data?: ShareServerStatus }>('get_share_server_status')

      if (result.ok && result.data) {
        setStatus(result.data)
      }
    }
    catch (err) {
      console.error('Failed to fetch share server status:', err)
    }
  }, [])

  const fetchLanIps = useCallback(async () => {
    try {
      const result = await invoke<{ ok: boolean, data?: string[] }>('get_lan_ip')

      if (result.ok && result.data) {
        setLanIps(result.data)
      }
    }
    catch (err) {
      console.error('Failed to fetch LAN IPs:', err)
    }
  }, [])

  const fetchLinks = useCallback(async () => {
    try {
      const result = await invoke<{ ok: boolean, data?: ShareLink[] }>('list_share_links', { sessionId })

      if (result.ok && result.data) {
        setLinks(result.data.filter((l) => l.projectId === projectId))
      }
    }
    catch (err) {
      console.error('Failed to fetch share links:', err)
    }
  }, [sessionId, projectId])

  useEffect(() => {
    void fetchStatus()
    void fetchLanIps()
    void fetchLinks()
    const interval = setInterval(() => {
      void fetchStatus()
    }, 5000)

    return () => {
      clearInterval(interval)
    }
  }, [fetchStatus, fetchLanIps, fetchLinks])

  const accessUrls = useMemo(() => {
    const hosts = lanIps.length > 0 ? lanIps : ['127.0.0.1']

    return hosts.map((ip) => `http://${ip}:${status.port}/`)
  }, [lanIps, status.port])

  const buildLinkUrl = (linkId: string) => {
    const base = accessUrls[0] ?? `http://127.0.0.1:${status.port}/`

    return `${base}#/share/${linkId}`
  }

  const handleStart = async () => {
    setStarting(true)

    try {
      const result = await invoke<{ ok: boolean, data?: ShareServerStatus }>('start_share_server')

      if (result.ok && result.data) {
        setStatus(result.data)

        if (result.data.running) {
          msgApi.success('分享服务已启动')
        }
        else {
          msgApi.error('启动失败：端口被占用且无可用端口')
        }
      }
    }
    catch (err) {
      msgApi.error('启动失败: ' + String(err))
    }
    finally {
      setStarting(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const result = await invoke<{ ok: boolean, error?: string }>('delete_share_link', { sessionId, id })

      if (!result.ok) {
        msgApi.error(result.error ?? '删除失败')

        return
      }

      msgApi.success('已删除，链接即时失效')
      void fetchLinks()
    }
    catch (err) {
      msgApi.error('删除失败: ' + String(err))
    }
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    msgApi.success('链接已复制')
  }

  return (
    <div>
      {contextHolder}

      {status.running
        ? (
            <Alert
              showIcon
              className="mb-3"
              description={(
                <div className="space-y-1">
                  {accessUrls.map((url) => (
                    <div key={url} className="flex items-center gap-2">
                      <Typography.Text code>{url}</Typography.Text>
                      <Button
                        icon={<Link2 size={14} />}
                        size="small"
                        type="text"
                        onClick={() => {
                          void handleCopy(url)
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
              message={`分享服务运行中（端口 ${status.port}）`}
              type="success"
            />
          )
        : (
            <Alert
              showIcon
              action={(
                <Button
                  icon={<Play size={14} />}
                  loading={starting}
                  size="small"
                  type="primary"
                  onClick={() => {
                    void handleStart()
                  }}
                >
                  启动服务
                </Button>
              )}
              className="mb-3"
              description="启动后才能生成可访问的分享链接。端口与启停控制可在「全局设置 → 文档分享」中配置。"
              message="分享服务未启动"
              type="warning"
            />
          )}

      <Card
        className="mb-3"
        extra={(
          <Button
            icon={<Plus size={14} />}
            size="small"
            type="primary"
            onClick={() => {
              setCreateOpen(true)
            }}
          >
            新建分享
          </Button>
        )}
        size="small"
        title="分享当前项目"
      >
        <Typography.Paragraph className="!mb-0 text-sm">
          生成带密码的访问链接，同局域网用户可在浏览器中只读查看本项目接口与文档。
          分享内容默认全部，也可勾选部分；删除链接后已打开的页面立即失效。
        </Typography.Paragraph>
      </Card>

      <Card size="small" title="本项目分享链接">
        <Table<ShareLink>
          columns={[
            {
              title: '标题',
              dataIndex: 'title',
              render: (value?: string) => value ?? '-',
            },
            {
              title: '范围',
              dataIndex: 'apiMenuIds',
              render: (ids: string[]) => (ids.length === 0 ? <Tag color="blue">全部</Tag> : `${ids.length} 项`),
            },
            {
              title: '过期时间',
              dataIndex: 'expiresAt',
              render: (value?: string) => {
                if (!value) {
                  return <Tag>永久</Tag>
                }

                const expired = dayjs(value).isBefore(dayjs())

                return expired ? <Tag color="red">已过期</Tag> : dayjs(value).format('YYYY-MM-DD')
              },
            },
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
            },
            {
              title: '操作',
              width: 150,
              render: (_, record) => (
                <Space>
                  <Button
                    disabled={!status.running}
                    icon={<Link2 size={14} />}
                    size="small"
                    onClick={() => {
                      void handleCopy(buildLinkUrl(record.id))
                    }}
                  >
                    复制链接
                  </Button>
                  <Button
                    danger
                    size="small"
                    onClick={() => {
                      void handleDelete(record.id)
                    }}
                  >
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
          dataSource={links}
          locale={{ emptyText: '暂无分享链接' }}
          pagination={false}
          rowKey="id"
          size="small"
        />
      </Card>

      <CreateShareModal
        fixedProjectId={projectId}
        open={createOpen}
        onClose={() => {
          setCreateOpen(false)
        }}
        onCreated={() => {
          void fetchLinks()
        }}
      />
    </div>
  )
}
