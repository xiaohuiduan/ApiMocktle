import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { invoke } from '@tauri-apps/api/core'
import { Alert, Button, Card, Form, InputNumber, message, Space, Tag, Typography } from 'antd'
import { Copy, Play } from 'lucide-react'

interface McpServerStatus {
  running: boolean
  port: number
}

interface McpServerConfig {
  port: number
}

export function McpServerPanel() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<McpServerStatus>({ running: false, port: 0 })
  const [config, setConfig] = useState<McpServerConfig>({ port: 14203 })
  const [loading, setLoading] = useState(false)
  const [msgApi, contextHolder] = message.useMessage()

  const fetchStatus = async () => {
    try {
      const result = await invoke<{ ok: boolean, data?: McpServerStatus }>('get_mcp_server_status')

      if (result.ok && result.data) {
        setStatus(result.data)
      }
    }
    catch (err) {
      console.error('Failed to fetch MCP status:', err)
    }
  }

  const fetchConfig = async () => {
    try {
      const result = await invoke<{ ok: boolean, data?: McpServerConfig }>('get_mcp_server_config')

      if (result.ok && result.data) {
        setConfig(result.data)
      }
    }
    catch (err) {
      console.error('Failed to fetch MCP config:', err)
    }
  }

  useEffect(() => {
    void fetchStatus()
    void fetchConfig()
    const interval = setInterval(() => {
      void fetchStatus()
    }, 5000)

    return () => {
      clearInterval(interval)
    }
  }, [])

  const handleStart = async () => {
    setLoading(true)

    try {
      const result = await invoke<{ ok: boolean, data?: McpServerStatus }>('start_mcp_server', {
        port: config.port,
      })

      if (result.ok && result.data) {
        setStatus(result.data)
        msgApi.success(t('settings.mcp.started'))
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
      const result = await invoke<{ ok: boolean, data?: McpServerStatus }>('stop_mcp_server')

      if (result.ok && result.data) {
        setStatus(result.data)
        msgApi.success(t('settings.mcp.stopped'))
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
      await invoke('save_mcp_server_config', { config })
      msgApi.success(t('settings.service.configSaved'))
    }
    catch (err) {
      msgApi.error(t('settings.service.saveFailed', { error: String(err) }))
    }
  }

  const handleCopyConfig = () => {
    const mcpConfig = {
      mcpServers: {
        apimocktle: {
          url: `http://localhost:${status.port}`,
        },
      },
    }
    void navigator.clipboard.writeText(JSON.stringify(mcpConfig, null, 2))
    msgApi.success(t('settings.mcp.configCopied'))
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
            {status.running && (
              <Tag>{t('settings.service.port', { port: status.port })}</Tag>
            )}
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
              <div>
                <Typography.Text code>http://localhost:{status.port}</Typography.Text>
                <Button
                  className="ml-2"
                  icon={<Copy size={14} />}
                  size="small"
                  onClick={handleCopyConfig}
                >
                  {t('settings.mcp.copyConfig')}
                </Button>
              </div>
            )}
            message={t('settings.mcp.running')}
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
                setConfig({ ...config, port: value ?? 14203 })
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

      <Card className="mt-3" size="small" title={t('settings.service.usageTitle')}>
        <Typography.Paragraph className="text-sm">
          {t('settings.mcp.usageIntro')}
        </Typography.Paragraph>
        <Typography.Paragraph className="text-sm">
          {t('settings.mcp.usageStep1')}
          <br />
          {t('settings.mcp.usageStep2')}
          <br />
          {t('settings.mcp.usageStep3')}
          <br />
          {t('settings.mcp.usageStep4')}
        </Typography.Paragraph>
      </Card>
    </div>
  )
}
