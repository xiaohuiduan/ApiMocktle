import { useCallback, useRef, useState } from 'react'
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

  // 并发运行守卫:仅最后一次调用允许写入结果;running 用计数器,
  // 避免先返回的慢请求把新请求的状态/结果覆盖掉
  const requestIdRef = useRef(0)
  const runningCountRef = useRef(0)

  const { proxyConfig } = useProxyConfig()
  const { projectId } = useParams()
  const { sessionId } = useAuth()
  const { messageApi } = useGlobalContext()

  const run = useCallback(async (
    menuItemId: string | undefined,
    url: string,
    method: string,
    headers: { name: string, value: string }[],
    body: string,
    contentType?: string,
    formDataFiles?: { name: string, path: string }[],
    insecureSkipVerify?: boolean,
    timeoutMs?: number,
  ): Promise<ApiRunResult | undefined> => {
    if (!projectId || !sessionId) {
      const msg = '当前不在项目页面，无法运行请求'
      messageApi.error(msg)
      setError(msg)

      return
    }

    const requestId = ++requestIdRef.current
    runningCountRef.current += 1
    setRunning(true)
    setError(undefined)
    setResult(undefined)

    const isStale = () => requestId !== requestIdRef.current
    const finish = () => {
      runningCountRef.current = Math.max(0, runningCountRef.current - 1)

      if (runningCountRef.current === 0) {
        setRunning(false)
      }
    }

    try {
      const payload: Record<string, unknown> = {
        sessionId,
        projectId,
        payload: { url, method, headers, body, contentType, formDataFiles, insecureSkipVerify, timeoutMs },
      }

      // Attach proxy config if configured
      const pc = proxyConfig

      if (pc && pc.proxyType !== 'none') {
        (payload.payload as Record<string, unknown>).proxyConfig = { ...pc }
      }

      const apiResult = await api<ApiRunResult>('run_api_request', payload)

      if (isStale()) {
        finish()

        return apiResult
      }

      setResult(apiResult)

      // Save history (fire-and-forget)；二进制 body 不落库（bodyBase64 可能很大）
      if (menuItemId && projectId && sessionId) {
        const requestData = { url, method, headers, body, contentType }
        const historyResponse = apiResult.isBinary ? { ...apiResult, bodyBase64: undefined } : apiResult
        api('save_request_history', {
          sessionId,
          projectId,
          menuItemId,
          requestJson: requestData,
          responseJson: historyResponse,
          statusCode: apiResult.status,
          durationMs: apiResult.durationMs,
        }).catch(() => { /* noop */ })
      }

      finish()

      return apiResult
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : '运行失败'

      if (!isStale()) {
        messageApi.error({ content: msg, duration: 4 })
        setError(msg)
      }

      // Save error history
      if (menuItemId && projectId && sessionId) {
        const requestData = { url, method, headers, body, contentType }
        const isFormData = contentType === 'application/x-www-form-urlencoded'
        const bodyParams = isFormData && body
          ? body.split('&').filter(Boolean).map((p) => {
              const [name, ...rest] = p.split('=')

              return { name: decodeURIComponent(name), value: decodeURIComponent(rest.join('=')) }
            })
          : []
        // 从 URL 中解析 query 参数
        const queryFromUrl: { name: string, value: string }[] = []

        try {
          const urlObj = new URL(url)
          urlObj.searchParams.forEach((value, name) => {
            queryFromUrl.push({ name, value })
          })
        }
        catch { /* url 可能不完整，忽略 */ }

        const errorResult: ApiRunResult = {
          url,
          method: method as ApiRunResult['method'],
          status: 0,
          statusText: msg,
          durationMs: 0,
          contentType,
          requestHeaders: headers.map((h) => ({ name: h.name, value: h.value })),
          requestQuery: queryFromUrl,
          requestCookie: [],
          requestBodyParameters: bodyParams,
          requestBodyText: !isFormData ? body : undefined,
          headers: [],
          errorInfo: {
            errorType: 'application_error',
            errorMessage: msg,
            errorDetail: err instanceof Error ? err.stack ?? '' : String(err),
            suggestion: '请检查操作是否正确，如果问题持续请尝试重新登录',
          },
        }
        api('save_request_history', {
          sessionId,
          projectId,
          menuItemId,
          requestJson: requestData,
          responseJson: errorResult,
          statusCode: 0,
          durationMs: 0,
        }).catch(() => { /* noop */ })
      }

      finish()

      return undefined
    }
  }, [messageApi, projectId, sessionId, proxyConfig])

  const resetResult = useCallback(() => {
    setResult(undefined)
    setError(undefined)
  }, [])

  return { run, running, result, error, resetResult, setResult }
}
