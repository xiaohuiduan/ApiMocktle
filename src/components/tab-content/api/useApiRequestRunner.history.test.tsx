import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 失败历史的 Query 快照：
 * 请求失败时前端自己拼 errorResult 落库，requestQuery 从 URL 解析。
 * 历史 URL 可能是相对路径（未选环境），这里必须解析得出来。
 */

interface RecordedCall {
  action: string
  payload?: any
}

const h = vi.hoisted(() => ({ state: { calls: [] as RecordedCall[] } }))

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

vi.mock('@/api-client', () => ({
  apiRaw: vi.fn(),
  api: vi.fn((action: string, payload?: any) => {
    h.state.calls.push({ action, payload })

    if (action === 'run_api_request') {
      return Promise.reject(new Error('网络不可达'))
    }

    return Promise.resolve(undefined)
  }),
}))

import { useApiRequestRunner } from './useApiRequestRunner'

describe('useApiRequestRunner 失败历史的 requestQuery', () => {
  beforeEach(() => {
    h.state.calls = []
  })

  it('相对路径 URL 也能解析出 requestQuery', async () => {
    const { result } = renderHook(() => useApiRequestRunner())

    await act(async () => {
      await result.current.run('menu-1', '/biz/sys?bizSys=1001&bizSysType=MAIN', 'GET', [], '')
    })

    await waitFor(() => {
      expect(h.state.calls.some((call) => call.action === 'save_request_history')).toBe(true)
    })

    const saveCall = h.state.calls.find((call) => call.action === 'save_request_history')

    expect(saveCall?.payload.responseJson.requestQuery).toEqual([
      { name: 'bizSys', value: '1001' },
      { name: 'bizSysType', value: 'MAIN' },
    ])
    expect(saveCall?.payload.statusCode).toBe(0)
  })

  it('无 query 时不产生假的参数项', async () => {
    const { result } = renderHook(() => useApiRequestRunner())

    await act(async () => {
      await result.current.run('menu-1', '/biz/sys', 'GET', [], '')
    })

    await waitFor(() => {
      expect(h.state.calls.some((call) => call.action === 'save_request_history')).toBe(true)
    })

    const saveCall = h.state.calls.find((call) => call.action === 'save_request_history')

    expect(saveCall?.payload.responseJson.requestQuery).toEqual([])
  })
})
