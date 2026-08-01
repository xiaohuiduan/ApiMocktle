import { useCallback, useEffect, useMemo, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import { Copy, Edit3, Link2, Play, Plus } from 'lucide-react'

import { useAuth } from '@/contexts/auth'

import { CreateShareModal, type ShareLink } from './CreateShareModal'
import { buildShareLinkUrl } from './share-url'

interface ShareServerStatus {
  running: boolean
  port: number
}

interface ShareServerConfig {
  port: number
}

export function ShareServerPanel() {
  const { sessionId } = useAuth()
  const [status, setStatus] = useState<ShareServerStatus>({ running: false, port: 0 })
  const [config, setConfig] = useState<ShareServerConfig>({ port: 14204 })
  const [lanIps, setLanIps] = useState<string[]>([])
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<ShareLink>()
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

  const fetchConfig = useCallback(async () => {
    try {
      const result = await invoke<{ ok: boolean, data?: ShareServerConfig }>('get_share_server_config')

      if (result.ok && result.data) {
        setConfig(result.data)
      }
    }
    catch (err) {
      console.error('Failed to fetch share server config:', err)
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
        setLinks(result.data)
      }
    }
    catch (err) {
      console.error('Failed to fetch share links:', err)
    }
  }, [sessionId])

  useEffect(() => {
    void fetchStatus()
    void fetchConfig()
    void fetchLanIps()
    void fetchLinks()
    const interval = setInterval(() => {
      void fetchStatus()
      void fetchLinks()
    }, 5000)

    return () => {
      clearInterval(interval)
    }
  }, [fetchStatus, fetchConfig, fetchLanIps, fetchLinks])

  const accessUrls = useMemo(() => {
    const hosts = lanIps.length > 0 ? lanIps : ['127.0.0.1']

    return hosts.map((ip) => `http://${ip}:${status.port}/`)
  }, [lanIps, status.port])

  const baseUrl = accessUrls[0] ?? `http://127.0.0.1:${status.port}/`

  /** 打开"输入密码生成带密码链接"弹窗 */
  const [pwdLinkTarget, setPwdLinkTarget] = useState<ShareLink>()
  const [pwdLinkInput, setPwdLinkInput] = useState('')

  const handleStart = async () => {
    setLoading(true)

    try {
      const result = await invoke<{ ok: boolean, data?: ShareServerStatus }>('start_share_server', {
        port: config.port,
      })

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
      setLoading(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)

    try {
      const result = await invoke<{ ok: boolean, data?: ShareServerStatus }>('stop_share_server')

      if (result.ok && result.data) {
        setStatus(result.data)
        msgApi.success('分享服务已停止')
      }
    }
    catch (err) {
      msgApi.error('停止失败: ' + String(err))
    }
    finally {
      setLoading(false)
    }
  }

  const handleSaveConfig = async () => {
    try {
      await invoke('save_share_server_config', { config })
      msgApi.success('配置已保存')
    }
    catch (err) {
      msgApi.error('保存失败: ' + String(err))
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

      <Card className="mb-3" size="small" title="服务状态">
        <div className="mb-3 flex items-center justify-between">
          <Space>
            <Tag color={status.running ? 'success' : 'default'}>
              {status.running ? '运行中' : '已停止'}
            </Tag>
            {status.running && <Tag>端口: {status.port}</Tag>}
          </Space>
          <Space>
            {status.running
              ? (
                  <Button
                    danger
                    icon={<Play size={14} />}
                    loading={loading}
                    size="small"
                    onClick={() => {
                      void handleStop()
                    }}
                  >
                    停止
                  </Button>
                )
              : (
                  <Button
                    icon={<Play size={14} />}
                    loading={loading}
                    size="small"
                    type="primary"
                    onClick={() => {
                      void handleStart()
                    }}
                  >
                    启动
                  </Button>
                )}
          </Space>
        </div>

        {status.running && (
          <Alert
            showIcon
            description={(
              <div className="space-y-1">
                {accessUrls.map((url) => (
                  <div key={url} className="flex items-center gap-2">
                    <Typography.Text code>{url}</Typography.Text>
                    <Button
                      icon={<Copy size={14} />}
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
            message="同局域网设备访问以下地址（需先创建分享链接）"
            type="success"
          />
        )}
      </Card>

      <Card size="small" title="服务配置">
        <Form layout="vertical" size="small">
          <Form.Item label="端口号">
            <InputNumber
              max={65535}
              min={1024}
              style={{ width: 150 }}
              value={config.port}
              onChange={(value) => {
                setConfig({ ...config, port: value ?? 14204 })
              }}
            />
          </Form.Item>
          <Form.Item>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                void handleSaveConfig()
              }}
            >
              保存配置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card
        className="mt-3"
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
        title="全部分享链接"
      >
        <Table<ShareLink>
          columns={[
            {
              title: '标题',
              dataIndex: 'title',
              render: (value: string | undefined, record) => value ?? record.projectName ?? '-',
            },
            {
              title: '项目',
              dataIndex: 'projectName',
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
              title: '密码',
              dataIndex: 'hasPassword',
              width: 70,
              render: (has: boolean) => (has ? <Tag color="orange">有密码</Tag> : <Tag>无</Tag>),
            },
            {
              title: '操作',
              width: 320,
              render: (_, record) => (
                <Space>
                  <Button
                    disabled={!status.running}
                    icon={<Link2 size={14} />}
                    size="small"
                    onClick={() => {
                      void handleCopy(buildShareLinkUrl(baseUrl, record, false))
                    }}
                  >
                    复制链接
                  </Button>
                  {record.hasPassword && (
                    <Button
                      disabled={!status.running}
                      icon={<Link2 size={14} />}
                      size="small"
                      onClick={() => {
                        setPwdLinkTarget(record)
                        setPwdLinkInput('')
                      }}
                    >
                      带密码链接
                    </Button>
                  )}
                  <Button
                    icon={<Edit3 size={14} />}
                    size="small"
                    onClick={() => {
                      setEditingLink(record)
                    }}
                  >
                    编辑
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

      <Card className="mt-3" size="small" title="使用说明">
        <Typography.Paragraph className="text-sm">
          1. 启动服务后，在「项目设置 → 文档分享」中选择项目新建分享，或在此处选择项目创建
          <br />
          2. 将生成的访问链接 + 密码发给同局域网的用户
          <br />
          3. 用户在浏览器打开链接，输入密码即可只读查看接口文档
          <br />
          4. 删除分享链接后，已打开的页面将立即失效
        </Typography.Paragraph>
        <Alert
          showIcon
          description={'首次启动服务时，Windows 可能弹出防火墙授权提示，请选择"允许访问"，否则其他设备无法访问。所有设备需处于同一局域网。'}
          message="Windows 防火墙"
          type="warning"
        />
      </Card>

      <Modal
        cancelText="取消"
        okText="复制链接"
        open={Boolean(pwdLinkTarget)}
        title="生成带密码链接"
        width={480}
        onCancel={() => {
          setPwdLinkTarget(undefined)
        }}
        onOk={() => {
          if (pwdLinkTarget && pwdLinkInput) {
            void handleCopy(buildShareLinkUrl(baseUrl, pwdLinkTarget, true, pwdLinkInput))
            setPwdLinkTarget(undefined)
          }
          else {
            msgApi.error('请输入该分享的访问密码')
          }
        }}
      >
        <Typography.Paragraph className="text-sm">
          输入该分享链接的访问密码，生成「打开即自动填充密码」的链接，访客无需手动输入。
        </Typography.Paragraph>
        <Input.Password
          placeholder="输入该分享的访问密码"
          value={pwdLinkInput}
          onChange={(e) => {
            setPwdLinkInput(e.target.value)
          }}
          onPressEnter={() => {
            if (pwdLinkTarget && pwdLinkInput) {
              void handleCopy(buildShareLinkUrl(baseUrl, pwdLinkTarget, true, pwdLinkInput))
              setPwdLinkTarget(undefined)
            }
          }}
        />
      </Modal>

      <CreateShareModal
        baseUrl={baseUrl}
        editing={editingLink}
        open={createOpen || Boolean(editingLink)}
        onClose={() => {
          setCreateOpen(false)
          setEditingLink(undefined)
        }}
        onCreated={() => {
          void fetchLinks()
        }}
      />
    </div>
  )
}
