import { useCallback, useEffect, useRef, useState } from 'react'

import { Button, InputNumber, message, Modal, Space, Switch, theme, Typography } from 'antd'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'
import { getAppRequestConfig, setAppRequestConfig } from '@/utils/app-config'

export interface AppRequestConfig {
  /** 全局默认请求超时（毫秒）；0 表示不限时 */
  timeoutMs?: number
  /** Cookie 自动管理开关 */
  cookieJarEnabled?: boolean
}

export function RequestSettingsPanel() {
  const { token } = theme.useToken()
  const { sessionId } = useAuth()
  const [msgApi, contextHolder] = message.useMessage()
  const [timeoutSeconds, setTimeoutSeconds] = useState<number | undefined>()
  const [cookieEnabled, setCookieEnabled] = useState(true)
  const [cookieCount, setCookieCount] = useState(0)
  const [configLoaded, setConfigLoaded] = useState(false)

  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  // 加载全局配置
  useEffect(() => {
    getAppRequestConfig().then((cfg) => {
      if (cfg?.timeoutMs != null) {
        setTimeoutSeconds(Math.round(cfg.timeoutMs / 1000))
      }

      if (cfg?.cookieJarEnabled != null) {
        setCookieEnabled(cfg.cookieJarEnabled)
      }

      setConfigLoaded(true)
    })
  }, [])

  const save = useCallback((next: Partial<AppRequestConfig>) => {
    getAppRequestConfig().then((cfg) => {
      return setAppRequestConfig({ ...cfg, ...next })
    }).catch(() => { /* 忽略保存失败 */ })
  }, [])

  // 超时自动保存（防抖）
  useEffect(() => {
    if (!configLoaded) { return }

    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      save({ timeoutMs: timeoutSeconds != null ? timeoutSeconds * 1000 : undefined })
    }, 500)

    return () => {
      clearTimeout(saveTimer.current)
    }
  }, [timeoutSeconds, configLoaded, save])

  const refreshCookieCount = useCallback(() => {
    if (!sessionId) { return }

    api<number>('get_cookie_jar_count', { sessionId }).then(setCookieCount).catch(() => { /* 忽略 */ })
  }, [sessionId])

  useEffect(() => {
    refreshCookieCount()
  }, [refreshCookieCount])

  const handleClearCookies = () => {
    if (!sessionId) { return }

    Modal.confirm({
      title: '清空 Cookie',
      content: `确定要清空本地已保存的 ${cookieCount} 个 Cookie 吗？此操作不可撤销。`,
      okText: '清空',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api('clear_cookie_jar', { sessionId })
          refreshCookieCount()
          msgApi.success('Cookie 已清空')
        }
        catch (err) {
          msgApi.error(err instanceof Error ? err.message : '清空失败')
        }
      },
    })
  }

  return (
    <div className="max-w-lg">
      {contextHolder}
      <div className="space-y-6">
        <div>
          <Typography.Text className="mb-1 block text-sm font-medium">全局默认请求超时</Typography.Text>
          <Space.Compact>
            <InputNumber
              addonAfter="秒"
              max={3600}
              min={0}
              placeholder="30"
              style={{ width: 200 }}
              value={timeoutSeconds}
              onChange={(v) => { setTimeoutSeconds(v == null ? undefined : Number(v)) }}
            />
          </Space.Compact>
          <Typography.Text className="mt-1 block text-sm" type="secondary">
            单个接口可在运行页的「超时」输入框单独覆盖；0 表示不限时，留空使用默认 30 秒。
          </Typography.Text>
        </div>

        <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 20 }}>
          <div className="flex items-center justify-between">
            <div>
              <Typography.Text className="block text-sm font-medium">Cookie 自动管理</Typography.Text>
              <Typography.Text className="block text-sm" type="secondary">
                自动保存响应中的 Set-Cookie 并在后续请求中按域名自动携带；运行页手动填写的 Cookie 优先。
              </Typography.Text>
            </div>
            <Switch
              checked={cookieEnabled}
              onChange={(v) => {
                setCookieEnabled(v)
                save({ cookieJarEnabled: v })
              }}
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Typography.Text className="text-sm" type="secondary">
              已保存 Cookie：
              <Typography.Text strong>{cookieCount}</Typography.Text>
              {' '}
              个
            </Typography.Text>
            <Button danger disabled={cookieCount === 0} size="small" onClick={handleClearCookies}>
              清空 Cookie
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
