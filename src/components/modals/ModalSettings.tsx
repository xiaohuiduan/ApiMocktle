import { useEffect, useMemo, useState } from 'react'

import { Viewer } from '@bytemd/react'
import { create, useModal } from '@ebay/nice-modal-react'
import { Button, Card, ConfigProvider, Form, InputNumber, Menu, type MenuProps, Modal, type ModalProps, Space, Tag, theme, Typography, message, Alert } from 'antd'
import { Copy, Globe, InfoIcon, Play, ShirtIcon, Zap } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

import { PROJECT_ABOUT_MARKDOWN } from '@/content/project-about'
import { ThemeEditor, useThemeContext } from '@/components/ThemeEditor'
import { ProxySettingsForm } from '@/components/proxy-settings/ProxySettingsForm'

export const enum SettingsMenuKey {
  Appearance = '0',
  About = '1',
  Proxy = '2',
  McpServer = '3',
}

const settingMenuItems = [
  {
    key: SettingsMenuKey.Appearance,
    icon: <ShirtIcon size={16} />,
    label: '外观',
  },
  {
    key: SettingsMenuKey.Proxy,
    icon: <Globe size={16} />,
    label: '网络代理',
  },
  {
    key: SettingsMenuKey.McpServer,
    icon: <Zap size={16} />,
    label: 'MCP 服务',
  },
  {
    key: SettingsMenuKey.About,
    icon: <InfoIcon size={16} />,
    label: '关于此项目',
  },
] satisfies MenuProps['items']

function ThemeEditorWrapper() {
  const { themeSetting, setThemeSetting, autoSaveId } = useThemeContext()

  return (
    <ThemeEditor
      autoSaveId={autoSaveId}
      value={themeSetting}
      onChange={(value) => {
        if (value) {
          setThemeSetting(value)
        }
      }}
    />
  )
}

const renderMenuContent = (props: { menuKey: SettingsMenuKey }) => {
  switch (props.menuKey) {
    case SettingsMenuKey.Appearance:
      return <ThemeEditorWrapper />

    case SettingsMenuKey.Proxy:
      return <ProxySettingsForm />

    case SettingsMenuKey.McpServer:
      return <McpServerSettings />

    case SettingsMenuKey.About:
      return <AboutContent />
  }
}

function AboutContent() {
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    invoke<string>('get_app_version').then(setVersion).catch(() => setVersion(''))
  }, [])

  return (
    <div>
      <Viewer value={PROJECT_ABOUT_MARKDOWN} />
      {version && (
        <div className="mt-4 text-sm" style={{ color: 'var(--ds-node-text-secondary, #6b7280)' }}>版本 {version}</div>
      )}
    </div>
  )
}

interface ModalSettingsProps extends Omit<ModalProps, 'open' | 'footer'> {
  defaultSelectedKey?: SettingsMenuKey
  selectedKey?: SettingsMenuKey
}

export const ModalSettings = create((props: ModalSettingsProps) => {
  const { token } = theme.useToken()

  const { selectedKey, defaultSelectedKey, ...restModalProps } = props

  const modal = useModal()

  const [selectedKeys, setSelectedKeys] = useState<[SettingsMenuKey]>()

  useEffect(() => {
    if (selectedKey) {
      setSelectedKeys([selectedKey])
    }
    else {
      setSelectedKeys([defaultSelectedKey ?? SettingsMenuKey.Appearance])
    }
  }, [selectedKey, defaultSelectedKey])

  const selectedMenuItem = useMemo(() => {
    return settingMenuItems.find((item) => item.key === selectedKeys?.at(0))
  }, [selectedKeys])

  const renderMenuKey = selectedKeys?.at(0)

  return (
    <ConfigProvider
      theme={{
        components: {
          Modal: {
            paddingMD: 0,
            paddingContentHorizontalLG: 0,
          },
        },
      }}
    >
      <Modal
        width={950}
        {...restModalProps}
        footer={false}
        open={modal.visible}
        onCancel={(...parmas) => {
          props.onCancel?.(...parmas)
          void modal.hide()
        }}
      >
        <div className="flex">
          <div
            className="w-64"
            style={{
              padding: `${token.paddingMD}px 0`,
              backgroundColor: token.colorFillQuaternary,
            }}
          >
            <div
              className="text-lg"
              style={{
                padding: `0 ${token.paddingMD}px ${token.paddingMD}px ${token.paddingMD}px`,
              }}
            >
              设置
            </div>

            <div style={{ padding: `0 ${token.paddingMD}px` }}>
              <ConfigProvider
                theme={{
                  components: {
                    Menu: {
                      colorBgContainer: 'transparent',
                      itemHoverBg: 'transparent',
                      itemHoverColor: token.colorPrimary,
                      itemBorderRadius: token.borderRadiusSM,
                    },
                  },
                }}
              >
                <Menu
                  className="!border-none"
                  items={settingMenuItems}
                  selectedKeys={selectedKeys}
                  onClick={({ key }) => {
                    setSelectedKeys([key as SettingsMenuKey])
                  }}
                />
              </ConfigProvider>
            </div>
          </div>

          <div className="flex-1" style={{ padding: `${token.paddingMD}px` }}>
            <div className="text-lg" style={{ padding: `0 0 ${token.paddingMD}px 0` }}>
              {selectedMenuItem?.label}
            </div>

            {!!renderMenuKey && renderMenuContent({ menuKey: renderMenuKey })}
          </div>
        </div>
      </Modal>
    </ConfigProvider>
  )
})

// ==================== MCP Server Settings ====================

interface McpServerStatus {
  running: boolean
  port: number
}

interface McpServerConfig {
  port: number
}

function McpServerSettings() {
  const [status, setStatus] = useState<McpServerStatus>({ running: false, port: 0 })
  const [config, setConfig] = useState<McpServerConfig>({ port: 14203 })
  const [loading, setLoading] = useState(false)
  const [msgApi, contextHolder] = message.useMessage()

  const fetchStatus = async () => {
    try {
      const result = await invoke<{ ok: boolean; data?: McpServerStatus }>('get_mcp_server_status')
      if (result.ok && result.data) {
        setStatus(result.data)
      }
    } catch (err) {
      console.error('Failed to fetch MCP status:', err)
    }
  }

  const fetchConfig = async () => {
    try {
      const result = await invoke<{ ok: boolean; data?: McpServerConfig }>('get_mcp_server_config')
      if (result.ok && result.data) {
        setConfig(result.data)
      }
    } catch (err) {
      console.error('Failed to fetch MCP config:', err)
    }
  }

  useEffect(() => {
    fetchStatus()
    fetchConfig()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleStart = async () => {
    setLoading(true)
    try {
      const result = await invoke<{ ok: boolean; data?: McpServerStatus }>('start_mcp_server', {
        port: config.port,
      })
      if (result.ok && result.data) {
        setStatus(result.data)
        msgApi.success('MCP 服务已启动')
      }
    } catch (err) {
      msgApi.error('启动失败: ' + String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)
    try {
      const result = await invoke<{ ok: boolean; data?: McpServerStatus }>('stop_mcp_server')
      if (result.ok && result.data) {
        setStatus(result.data)
        msgApi.success('MCP 服务已停止')
      }
    } catch (err) {
      msgApi.error('停止失败: ' + String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleSaveConfig = async () => {
    try {
      await invoke('save_mcp_server_config', { config })
      msgApi.success('配置已保存')
    } catch (err) {
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
    navigator.clipboard.writeText(JSON.stringify(mcpConfig, null, 2))
    msgApi.success('配置已复制到剪贴板')
  }

  return (
    <div>
      {contextHolder}

      <Card size="small" title="服务状态" className="mb-3">
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
            {status.running ? (
              <Button
                size="small"
                danger
                icon={<Play size={14} />}
                onClick={handleStop}
                loading={loading}
              >
                停止
              </Button>
            ) : (
              <Button
                size="small"
                type="primary"
                icon={<Play size={14} />}
                onClick={handleStart}
                loading={loading}
              >
                启动
              </Button>
            )}
          </Space>
        </div>

        {status.running && (
          <Alert
            type="success"
            showIcon
            message="MCP 服务运行中"
            description={
              <div>
                <Typography.Text code>http://localhost:{status.port}</Typography.Text>
                <Button
                  size="small"
                  icon={<Copy size={14} />}
                  onClick={handleCopyConfig}
                  className="ml-2"
                >
                  复制配置
                </Button>
              </div>
            }
          />
        )}
      </Card>

      <Card size="small" title="服务配置">
        <Form layout="vertical" size="small">
          <Form.Item label="端口号">
            <InputNumber
              value={config.port}
              onChange={(value) => setConfig({ ...config, port: value || 14203 })}
              min={1024}
              max={65535}
              style={{ width: 150 }}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" size="small" onClick={handleSaveConfig}>
              保存配置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card size="small" title="使用说明" className="mt-3">
        <Typography.Paragraph className="text-sm">
          MCP 服务允许 AI 工具（如 Claude Desktop）调用自动化测试功能。
        </Typography.Paragraph>
        <Typography.Paragraph className="text-sm">
          1. 点击"启动"开启服务<br />
          2. 点击"复制配置"获取配置<br />
          3. 粘贴到 Claude Desktop 配置文件<br />
          4. 重启 Claude Desktop
        </Typography.Paragraph>
      </Card>
    </div>
  )
}
