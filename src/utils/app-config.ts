import { api } from '@/api-client'
import type { ProxyConfig } from '@/types'

const CONFIG_KEY_PROXY = 'proxy'

export async function getProxyConfig(): Promise<ProxyConfig | null> {
  const value = await api<unknown>('get_app_config', { key: CONFIG_KEY_PROXY })
  return value ? (value as ProxyConfig) : null
}

export async function setProxyConfig(config: ProxyConfig | null): Promise<void> {
  await api('set_app_config', { key: CONFIG_KEY_PROXY, value: config ?? null })
}
