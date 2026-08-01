import { createContext, useCallback, useContext, useEffect, useState } from 'react'

import type { ProxyConfig } from '@/types'
import { getProxyConfig } from '@/utils/app-config'

interface ProxyConfigContextValue {
  proxyConfig: ProxyConfig | null
  refresh: () => void
}

const ProxyConfigContext = createContext<ProxyConfigContextValue>({
  proxyConfig: null,
  refresh: () => { /* noop */ },
})

export function ProxyConfigProvider({ children }: { children: React.ReactNode }) {
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    getProxyConfig().then(setProxyConfig)
  }, [refreshKey])

  const refresh = useCallback(() => { setRefreshKey((k) => k + 1) }, [])

  return (
    <ProxyConfigContext.Provider value={{ proxyConfig, refresh }}>
      {children}
    </ProxyConfigContext.Provider>
  )
}

export function useProxyConfig() {
  return useContext(ProxyConfigContext)
}
