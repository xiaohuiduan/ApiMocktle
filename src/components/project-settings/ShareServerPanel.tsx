import { type Key, useCallback, useEffect, useMemo, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tree,
  Typography,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { Copy, Link2, Play, Plus } from 'lucide-react'

import type { ApiMenuData } from '@/components/ApiMenu'
import { type ProjectItem, requestProjects } from '@/components/projects/project-api'
import { useAuth } from '@/contexts/auth'

interface ShareServerStatus {
  running: boolean
  port: number
}

interface ShareServerConfig {
  port: number
}

interface ShareLink {
  id: string
  projectId: string
  projectName?: string
  apiMenuIds: string[]
  expiresAt?: string
  title: string
  createdAt: string
}

interface MenuTreeNode {
  key: string
  title: string
  isLeaf: boolean
  children?: MenuTreeNode[]
}

const FOLDER_TYPES = new Set(['apiDetailFolder', 'apiSchemaFolder', 'requestFolder'])

function buildTree(items: ApiMenuData[]): MenuTreeNode[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const childrenMap = new Map<string, MenuTreeNode[]>()
  const roots: MenuTreeNode[] = []

  for (const item of items) {
    const node: MenuTreeNode = {
      key: item.id,
      title: item.name,
      isLeaf: !FOLDER_TYPES.has(item.type),
    }
    const parentId = item.parentId

    if (parentId && byId.has(parentId)) {
      const list = childrenMap.get(parentId) ?? []
      list.push(node)
      childrenMap.set(parentId, list)
    }
    else {
      roots.push(node)
    }
  }

  const attach = (nodes: MenuTreeNode[]): MenuTreeNode[] => nodes.map((n) => ({
    ...n,
    children: attach(childrenMap.get(n.key) ?? []),
  }))

  return attach(roots)
}

function CreateShareModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { sessionId } = useAuth()
  const [msgApi, contextHolder] = message.useMessage()

  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [projectId, setProjectId] = useState<string>()
  const [menuItems, setMenuItems] = useState<ApiMenuData[]>([])
  const [shareAll, setShareAll] = useState(true)
  const [checkedKeys, setCheckedKeys] = useState<Key[]>([])
  const [password, setPassword] = useState('')
  const [expiresAt, setExpiresAt] = useState<string>()
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await requestProjects(sessionId))
    }
    catch {
      // 忽略：面板外已有登录态
    }
  }, [sessionId])

  useEffect(() => {
    if (open) {
      void loadProjects()
      setProjectId(undefined)
      setMenuItems([])
      setShareAll(true)
      setCheckedKeys([])
      setPassword('')
      setExpiresAt(undefined)
      setTitle('')
    }
  }, [open, loadProjects])

  useEffect(() => {
    if (!projectId) {
      setMenuItems([])

      return
    }

    void invoke<{ ok: boolean, data?: { menuItems: ApiMenuData[] } }>('list_menu_items', {
      sessionId,
      projectId,
    }).then((result) => {
      if (result.ok && result.data) {
        setMenuItems(result.data.menuItems)
        const leafIds = result.data.menuItems
          .filter((i) => !FOLDER_TYPES.has(i.type))
          .map((i) => i.id)
        setCheckedKeys(leafIds)
      }
    })
  }, [projectId, sessionId])

  const treeData = useMemo(() => buildTree(menuItems), [menuItems])

  const handleCreate = async () => {
    if (!projectId) {
      msgApi.error('请选择项目')

      return
    }

    if (!shareAll && checkedKeys.length === 0) {
      msgApi.error('请至少勾选一个内容')

      return
    }

    if (!password) {
      msgApi.error('请设置访问密码')

      return
    }

    setCreating(true)

    try {
      const payload = {
        projectId,
        apiMenuIds: shareAll ? [] : checkedKeys.map(String),
        password,
        expiresAt,
        title: title || undefined,
      }
      const result = await invoke<{ ok: boolean, data?: ShareLink, error?: string }>('create_share_link', {
        sessionId,
        payload,
      })

      if (!result.ok) {
        msgApi.error(result.error ?? '创建失败')

        return
      }

      msgApi.success('分享链接已创建')
      onCreated()
      onClose()
    }
    catch (err) {
      msgApi.error('创建失败: ' + String(err))
    }
    finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      cancelText="取消"
      confirmLoading={creating}
      okText="创建"
      open={open}
      title="新建分享链接"
      width={560}
      onCancel={onClose}
      onOk={() => {
        void handleCreate()
      }}
    >
      {contextHolder}
      <Form layout="vertical" size="small">
        <Form.Item required label="项目">
          <Select
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="选择要分享的项目"
            value={projectId}
            onChange={setProjectId}
          />
        </Form.Item>

        <Form.Item label="分享内容">
          <Checkbox
            checked={shareAll}
            onChange={(e) => {
              setShareAll(e.target.checked)
            }}
          >
            分享项目全部内容
          </Checkbox>
          {!shareAll && menuItems.length > 0 && (
            <div className="mt-2 max-h-56 overflow-auto rounded-md border border-gray-200 p-2">
              <Tree
                checkable
                defaultExpandAll
                checkedKeys={checkedKeys}
                selectable={false}
                treeData={treeData}
                onCheck={(keys) => {
                  setCheckedKeys(Array.isArray(keys) ? keys : keys.checked)
                }}
              />
            </div>
          )}
          {!shareAll && menuItems.length === 0 && (
            <div className="mt-1 text-xs text-gray-400">该项目暂无内容</div>
          )}
        </Form.Item>

        <Form.Item required label="访问密码">
          <Input.Password
            placeholder="访客输入此密码才能查看"
            value={password}
            onChange={(e) => { setPassword(e.target.value) }}
          />
        </Form.Item>

        <Form.Item label="过期时间（留空为永久有效）">
          <DatePicker
            disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
            value={expiresAt ? dayjs(expiresAt) : undefined}
            onChange={(d: Dayjs | null) => {
              setExpiresAt(d ? d.format('YYYY-MM-DD') : undefined)
            }}
          />
        </Form.Item>

        <Form.Item label="分享标题（可选，默认使用项目名）">
          <Input
            placeholder="如：订单服务接口文档"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
            }}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export function ShareServerPanel() {
  const { sessionId } = useAuth()
  const [status, setStatus] = useState<ShareServerStatus>({ running: false, port: 0 })
  const [config, setConfig] = useState<ShareServerConfig>({ port: 14204 })
  const [lanIps, setLanIps] = useState<string[]>([])
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(false)
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
    }, 5000)

    return () => {
      clearInterval(interval)
    }
  }, [fetchStatus, fetchConfig, fetchLanIps, fetchLinks])

  const accessUrls = useMemo(() => {
    const hosts = lanIps.length > 0 ? lanIps : ['127.0.0.1']

    return hosts.map((ip) => `http://${ip}:${status.port}/`)
  }, [lanIps, status.port])

  const buildLinkUrl = (linkId: string) => {
    const base = accessUrls[0] ?? `http://127.0.0.1:${status.port}/`

    return `${base}#/share/${linkId}`
  }

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
        title="分享链接"
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
              title: '操作',
              width: 140,
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

      <Card className="mt-3" size="small" title="使用说明">
        <Typography.Paragraph className="text-sm">
          1. 启动服务后，点击"新建分享"选择项目和内容，设置密码
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

      <CreateShareModal
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
