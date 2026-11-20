import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
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
          msgApi.success(t('settings.shareServer.started'))
        }
        else {
          msgApi.error(t('settings.shareServer.startFailedBusy'))
        }
      }
    }
    catch (err) {
      msgApi.error(t('settings.service.startFailed', { error: String(err) }))
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
        msgApi.success(t('settings.shareServer.stopped'))
      }
    }
    catch (err) {
      msgApi.error(t('settings.service.stopFailed', { error: String(err) }))
    }
    finally {
      setLoading(false)
    }
  }

  const handleSaveConfig = async () => {
    try {
      await invoke('save_share_server_config', { config })
      msgApi.success(t('settings.service.configSaved'))
    }
    catch (err) {
      msgApi.error(t('settings.service.saveFailed', { error: String(err) }))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const result = await invoke<{ ok: boolean, error?: string }>('delete_share_link', { sessionId, id })

      if (!result.ok) {
        msgApi.error(result.error ?? t('settings.shareServer.deleteFailed'))

        return
      }

      msgApi.success(t('settings.shareServer.deleted'))
      void fetchLinks()
    }
    catch (err) {
      msgApi.error(t('settings.shareServer.deleteFailedDetail', { error: String(err) }))
    }
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    msgApi.success(t('settings.shareServer.linkCopied'))
  }

  /** 带密码链接：后端返回明文密码时直接复制，否则弹窗手动输入 */
  const handlePwdLink = (record: ShareLink) => {
    if (record.passwordPlain) {
      void handleCopy(buildShareLinkUrl(baseUrl, record, true, record.passwordPlain))
    }
    else {
      setPwdLinkTarget(record)
      setPwdLinkInput('')
    }
  }

  return (
    <div>
      {contextHolder}

      <Card className="mb-3" size="small" title={t('settings.service.statusTitle')}>
        <div className="mb-3 flex items-center justify-between">
          <Space>
            <Tag color={status.running ? 'success' : 'default'}>
              {status.running ? t('settings.service.running') : t('settings.service.stopped')}
            </Tag>
            {status.running && <Tag>{t('settings.service.port', { port: status.port })}</Tag>}
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
                    {t('settings.service.stop')}
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
                    {t('settings.service.start')}
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
            message={t('settings.shareServer.lanAccessHint')}
            type="success"
          />
        )}
      </Card>

      <Card size="small" title={t('settings.service.configTitle')}>
        <Form layout="vertical" size="small">
          <Form.Item label={t('settings.service.portLabel')}>
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
              {t('settings.service.saveConfig')}
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
            {t('settings.projectShare.newShare')}
          </Button>
        )}
        size="small"
        title={t('settings.shareServer.allLinksTitle')}
      >
        <Table<ShareLink>
          columns={[
            {
              title: t('settings.projectShare.colTitle'),
              dataIndex: 'title',
              render: (value: string | undefined, record) => value ?? record.projectName ?? '-',
            },
            {
              title: t('settings.shareServer.project'),
              dataIndex: 'projectName',
              render: (value?: string) => value ?? '-',
            },
            {
              title: t('settings.projectShare.colRange'),
              dataIndex: 'apiMenuIds',
              render: (ids: string[]) => (ids.length === 0
                ? <Tag color="blue">{t('common.all')}</Tag>
                : t('settings.projectShare.rangeItems', { count: ids.length })),
            },
            {
              title: t('settings.projectShare.colExpiresAt'),
              dataIndex: 'expiresAt',
              render: (value?: string) => {
                if (!value) {
                  return <Tag>{t('settings.projectShare.permanent')}</Tag>
                }

                const expired = dayjs(value).isBefore(dayjs())

                return expired ? <Tag color="red">{t('settings.projectShare.expired')}</Tag> : dayjs(value).format('YYYY-MM-DD')
              },
            },
            {
              title: t('common.createdAt'),
              dataIndex: 'createdAt',
              render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
            },
            {
              title: t('settings.projectShare.colPassword'),
              dataIndex: 'hasPassword',
              width: 70,
              render: (has: boolean) => (has
                ? <Tag color="orange">{t('settings.projectShare.hasPassword')}</Tag>
                : <Tag>{t('common.none')}</Tag>),
            },
            {
              title: t('common.action'),
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
                    {t('settings.projectShare.copyLink')}
                  </Button>
                  {record.hasPassword && (
                    <Button
                      disabled={!status.running}
                      icon={<Link2 size={14} />}
                      size="small"
                      onClick={() => {
                        handlePwdLink(record)
                      }}
                    >
                      {t('settings.projectShare.pwdLink')}
                    </Button>
                  )}
                  <Button
                    icon={<Edit3 size={14} />}
                    size="small"
                    onClick={() => {
                      setEditingLink(record)
                    }}
                  >
                    {t('common.edit')}
                  </Button>
                  <Button
                    danger
                    size="small"
                    onClick={() => {
                      void handleDelete(record.id)
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </Space>
              ),
            },
          ]}
          dataSource={links}
          locale={{ emptyText: t('settings.projectShare.emptyLinks') }}
          pagination={false}
          rowKey="id"
          size="small"
        />
      </Card>

      <Card className="mt-3" size="small" title={t('settings.service.usageTitle')}>
        <Typography.Paragraph className="text-sm">
          {t('settings.shareServer.usageStep1')}
          <br />
          {t('settings.shareServer.usageStep2')}
          <br />
          {t('settings.shareServer.usageStep3')}
          <br />
          {t('settings.shareServer.usageStep4')}
        </Typography.Paragraph>
        <Alert
          showIcon
          description={t('settings.shareServer.firewallDescription')}
          message={t('settings.shareServer.firewallTitle')}
          type="warning"
        />
      </Card>

      <Modal
        cancelText={t('common.cancel')}
        okText={t('settings.projectShare.copyLink')}
        open={Boolean(pwdLinkTarget)}
        title={t('settings.projectShare.pwdLinkTitle')}
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
            msgApi.error(t('settings.projectShare.pwdRequired'))
          }
        }}
      >
        <Typography.Paragraph className="text-sm">
          {t('settings.projectShare.pwdLinkDescription')}
        </Typography.Paragraph>
        <Input.Password
          placeholder={t('settings.projectShare.pwdPlaceholder')}
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
