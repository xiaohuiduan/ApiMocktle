import { useEffect, useState } from 'react'

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
        msgApi.success('MCP 服务已启动')
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
      const result = await invoke<{ ok: boolean, data?: McpServerStatus }>('stop_mcp_server')

      if (result.ok && result.data) {
        setStatus(result.data)
        msgApi.success('MCP 服务已停止')
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
      await invoke('save_mcp_server_config', { config })
      msgApi.success('配置已保存')
    }
    catch (err) {
      msgApi.error('保存失败: ' + String(err))
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
    msgApi.success('配置已复制到剪贴板')
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
            {status.running && (
              <Tag>端口: {status.port}</Tag>
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
              <div>
                <Typography.Text code>http://localhost:{status.port}</Typography.Text>
                <Button
                  className="ml-2"
                  icon={<Copy size={14} />}
                  size="small"
                  onClick={handleCopyConfig}
                >
                  复制配置
                </Button>
              </div>
            )}
            message="MCP 服务运行中"
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
              保存配置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card className="mt-3" size="small" title="使用说明">
        <Typography.Paragraph className="text-sm">
          MCP 服务允许 AI 工具（如 Claude Desktop）调用自动化测试功能。
        </Typography.Paragraph>
        <Typography.Paragraph className="text-sm">
          1. 点击"启动"开启服务
          <br />
          2. 点击"复制配置"获取配置
          <br />
          3. 粘贴到 Claude Desktop 配置文件
          <br />
          4. 重启 Claude Desktop
        </Typography.Paragraph>
      </Card>
    </div>
  )
}
