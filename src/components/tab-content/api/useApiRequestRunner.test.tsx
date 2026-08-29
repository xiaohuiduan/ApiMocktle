import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ApiRunResult } from '@/types'

// useApiRequestRunner 依赖路由参数与若干 context,全部以最小替身注入
vi.mock('react-router', () => ({
  useParams: () => ({ projectId: 'p1' }),
}))

vi.mock('@/contexts/auth', () => ({
  useAuth: () => ({ sessionId: 's1' }),
}))

vi.mock('@/contexts/proxy-config', () => ({
  useProxyConfig: () => ({ proxyConfig: undefined }),
}))

vi.mock('@/contexts/global', () => ({
  useGlobalContext: () => ({
    messageApi: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
    modal: { confirm: vi.fn() },
  }),
}))

// api 调用可控:第一次慢、第二次快,模拟「快速双击运行」的竞态
let apiCallIndex = 0
const resolvers: ((v: ApiRunResult) => void)[] = []

vi.mock('@/api-client', () => ({
  api: vi.fn(() => {
    apiCallIndex += 1

    if (apiCallIndex === 1) {
      return new Promise<ApiRunResult>((resolve) => {
        resolvers.push(resolve)
      })
    }

    return Promise.resolve({
      url: 'https://api.example.com/fast',
      method: 'GET',
      status: 200,
      statusText: 'OK',
      durationMs: 5,
      headers: [],
      requestHeaders: [],
      requestQuery: [],
      requestCookie: [],
      bodyText: 'fast',
      requestBodyParameters: [],
    } as ApiRunResult)
  }),
  apiRaw: vi.fn(),
}))

import { useApiRequestRunner } from './useApiRequestRunner'

describe('useApiRequestRunner 竞态守卫', () => {
  it('先发后至的慢请求不覆盖新请求的结果,running 在全部完成后才复位', async () => {
    const { result } = renderHook(() => useApiRequestRunner())

    let secondPromise: Promise<ApiRunResult | undefined>

    // 第一次运行:挂起等待
    act(() => {
      void result.current.run('menu-1', 'https://api.example.com/slow', 'GET', [], '')
    })

    // 第二次运行立即发出:马上返回
    act(() => {
      secondPromise = result.current.run('menu-1', 'https://api.example.com/fast', 'GET', [], '')
    })

    await waitFor(() => {
      expect(result.current.result?.url).toBe('https://api.example.com/fast')
    })

    // 第一次的慢响应此刻才返回:不应覆盖第二次结果
    expect(resolvers).toHaveLength(1)
    await act(async () => {
      resolvers[0]?.({
        url: 'https://api.example.com/slow',
        method: 'GET',
        status: 500,
        statusText: 'Slow',
        durationMs: 9999,
        headers: [],
        requestHeaders: [],
        requestQuery: [],
        requestCookie: [],
        bodyText: 'slow',
        requestBodyParameters: [],
      } as ApiRunResult)
      await secondPromise
    })

    expect(result.current.result?.url).toBe('https://api.example.com/fast')
    expect(result.current.running).toBe(false)
  })
})
