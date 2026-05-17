import { useCallback, useState } from 'react'
import { useParams } from 'react-router'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'
import { useGlobalContext } from '@/contexts/global'
import { useProxyConfig } from '@/contexts/proxy-config'
import type { ApiRunResult } from '@/types'

export function useApiRequestRunner() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ApiRunResult>()
  const [error, setError] = useState<string>()

  const { proxyConfig } = useProxyConfig()
  const { projectId } = useParams()
  const { sessionId } = useAuth()
  const { messageApi } = useGlobalContext()

  const run = useCallback(async (
    url: string,
    method: string,
    headers: Array<{ name: string, value: string }>,
    body: string,
    contentType?: string,
    formDataFiles?: Array<{ name: string, path: string }>,
  ) => {
    if (!projectId || !sessionId) {
      const msg = '当前不在项目页面，无法运行请求'
      messageApi.error(msg)
      setError(msg)
      return
    }

    setRunning(true)
    setError(undefined)
    setResult(undefined)

    try {
      const payload: Record<string, unknown> = {
        sessionId,
        projectId,
        payload: { url, method, headers, body, contentType, formDataFiles },
      }

      // Attach proxy config if configured
      const pc = proxyConfig
      if (pc && pc.proxyType !== 'none') {
        (payload.payload as Record<string, unknown>).proxyConfig = { ...pc }
      }

      const result = await api<ApiRunResult>('run_api_request', payload)
      setResult(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '运行失败'
      messageApi.error({ content: msg, duration: 4 })
      setError(msg)
    } finally {
      setRunning(false)
    }
  }, [messageApi, projectId, sessionId, proxyConfig])

  const resetResult = useCallback(() => {
    setResult(undefined)
    setError(undefined)
  }, [])

  return { run, running, result, error, resetResult }
}
