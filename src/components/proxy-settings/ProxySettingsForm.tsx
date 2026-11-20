import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Input, InputNumber, Radio, Space, Tag, Typography } from 'antd'
import { CheckCircleIcon, LoaderIcon, XCircleIcon } from 'lucide-react'

import { api } from '@/api-client'
import { ErrorDisplay } from '@/components/tab-content/api/components/ErrorDisplay'
import { useProxyConfig } from '@/contexts/proxy-config'
import type { ProxyConfig, ProxyTestResult } from '@/types'
import { getProxyConfig, setProxyConfig } from '@/utils/app-config'

const DEFAULT_TEST_URL = 'https://baidu.com'

export function ProxySettingsForm() {
  const { t } = useTranslation()
  const [proxyType, setProxyType] = useState<'none' | 'socks5' | 'http'>('none')
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState(7890)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [testUrl, setTestUrl] = useState(DEFAULT_TEST_URL)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ProxyTestResult | null>(null)

  const { refresh: refreshProxyConfig } = useProxyConfig()

  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  // Load config on mount
  useEffect(() => {
    getProxyConfig().then((cfg) => {
      if (cfg) {
        setProxyType(cfg.proxyType || 'none')
        setHost(cfg.host || '127.0.0.1')
        setPort(cfg.port || 7890)
        setUsername(cfg.username ?? '')
        setPassword(cfg.password ?? '')
      }
    })
  }, [])

  const save = useCallback(() => {
    const config: ProxyConfig | null = proxyType === 'none'
      ? { proxyType: 'none', host: '', port: 0 }
      : { proxyType, host, port, username: username || undefined, password: password || undefined }
    setProxyConfig(config).then(() => { refreshProxyConfig() }).catch(() => { /* noop */ })
  }, [proxyType, host, port, username, password, refreshProxyConfig])

  // Auto-save with debounce
  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(save, 500)

    return () => { clearTimeout(saveTimer.current) }
  }, [save])

  const handleTest = async () => {
    if (!testUrl.trim()) { return }

    setTesting(true)
    setTestResult(null)

    try {
      const config: ProxyConfig = {
        proxyType,
        host,
        port,
        username: username || undefined,
        password: password || undefined,
      }
      const data = await api<{ ok: boolean, statusCode?: number, durationMs?: number, error?: string }>(
        'test_proxy_connection',
        { proxyConfig: config, testUrl: testUrl.trim() },
      )
      setTestResult({
        ok: data.ok,
        statusCode: data.statusCode,
        durationMs: data.durationMs,
        error: data.error,
      })
    }
    catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : t('settings.proxy.testFailed') })
    }
    finally {
      setTesting(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="mb-5 space-y-4">
        <div>
          <Typography.Text className="mb-1 block text-sm font-medium">{t('settings.proxy.type')}</Typography.Text>
          <Radio.Group
            buttonStyle="solid"
            optionType="button"
            value={proxyType}
            onChange={(e) => { setProxyType(e.target.value) }}
          >
            <Radio value="none">{t('settings.proxy.none')}</Radio>
            <Radio value="socks5">SOCKS5</Radio>
            <Radio value="http">HTTP(S)</Radio>
          </Radio.Group>
        </div>

        {proxyType !== 'none' && (
          <>
            <div className="flex gap-3">
              <div className="flex-1">
                <Typography.Text className="mb-1 block text-sm font-medium">{t('settings.proxy.host')}</Typography.Text>
                <Input
                  placeholder="127.0.0.1"
                  value={host}
                  onChange={(e) => { setHost(e.target.value) }}
                />
              </div>
              <div style={{ width: 120 }}>
                <Typography.Text className="mb-1 block text-sm font-medium">{t('settings.proxy.port')}</Typography.Text>
                <InputNumber
                  className="w-full"
                  max={65535}
                  min={1}
                  placeholder="7890"
                  value={port}
                  onChange={(v) => { setPort(v ?? 0) }}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <Typography.Text className="mb-1 block text-sm font-medium">{t('settings.proxy.username')}</Typography.Text>
                <Input
                  placeholder="username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value) }}
                />
              </div>
              <div className="flex-1">
                <Typography.Text className="mb-1 block text-sm font-medium">{t('settings.proxy.password')}</Typography.Text>
                <Input.Password
                  placeholder="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value) }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--ant-color-border-secondary)', paddingTop: 24 }}>
        <Typography.Text strong className="mb-3 block">{t('settings.proxy.testTitle')}</Typography.Text>

        <Space.Compact className="mb-3 w-full">
          <Input
            placeholder={DEFAULT_TEST_URL}
            style={{ fontFamily: 'monospace' }}
            value={testUrl}
            onChange={(e) => { setTestUrl(e.target.value) }}
          />
          <Button
            disabled={proxyType === 'none'}
            loading={testing}
            type="primary"
            onClick={() => { void handleTest() }}
          >
            {t('settings.proxy.test')}
          </Button>
        </Space.Compact>

        {testing && (
          <Space>
            <LoaderIcon className="animate-spin" size={14} />
            <Typography.Text type="secondary">{t('settings.proxy.testing')}</Typography.Text>
          </Space>
        )}

        {testResult && !testing && (
          <div>
            {testResult.ok
              ? (
                  <Tag color="success" icon={<CheckCircleIcon size={14} />}>
                    {t('settings.proxy.success')}
                    {testResult.statusCode != null && t('settings.proxy.statusCode', { code: testResult.statusCode })}
                    {testResult.durationMs != null && ` | ${testResult.durationMs}ms`}
                  </Tag>
                )
              : testResult.errorInfo
                ? (
                    <ErrorDisplay errorInfo={testResult.errorInfo} />
                  )
                : (
                    <Tag color="error" icon={<XCircleIcon size={14} />}>
                      {t('settings.proxy.failed')}
                      {testResult.error ? ` | ${testResult.error}` : ''}
                    </Tag>
                  )}
          </div>
        )}
      </div>
    </div>
  )
}
