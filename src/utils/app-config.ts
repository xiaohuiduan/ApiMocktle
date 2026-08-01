import { api } from '@/api-client'
import type { AppRequestConfig } from '@/components/settings/RequestSettingsPanel'
import type { ProxyConfig } from '@/types'

const CONFIG_KEY_PROXY = 'proxy'
const CONFIG_KEY_REQUEST = 'request'

export async function getProxyConfig(): Promise<ProxyConfig | null> {
  const value = await api<unknown>('get_app_config', { key: CONFIG_KEY_PROXY })

  return value ? (value as ProxyConfig) : null
}

export async function setProxyConfig(config: ProxyConfig | null): Promise<void> {
  await api('set_app_config', { key: CONFIG_KEY_PROXY, value: config ?? null })
}

export async function getAppRequestConfig(): Promise<AppRequestConfig | null> {
  const value = await api<unknown>('get_app_config', { key: CONFIG_KEY_REQUEST })

  return value ? (value as AppRequestConfig) : null
}

export async function setAppRequestConfig(config: AppRequestConfig | null): Promise<void> {
  await api('set_app_config', { key: CONFIG_KEY_REQUEST, value: config ?? null })
}
