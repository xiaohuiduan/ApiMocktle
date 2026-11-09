import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 历史详情集成测试：
 * 后端 `requestQuery` 目前恒为 []，详情面板的 Query 参数实际靠前端从 URL 兜底解析。
 * 历史 URL 未选环境时是相对路径（`/biz/sys?x=1`），这条兜底必须解析得出来。
 */

const h = vi.hoisted(() => {
  const state: { items: unknown[] } = { items: [] }

  return { state }
})

vi.mock('@/api-client', () => ({
  apiRaw: vi.fn(),
  api: vi.fn((action: string) => Promise.resolve(
    action === 'list_request_history' ? h.state.items : [],
  )),
}))

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useParams: () => ({ projectId: 'p1' }),
}))

vi.mock('@/contexts/auth', () => ({ useAuth: () => ({ sessionId: 's1' }) }))

vi.mock('@/components/MonacoEditor', () => ({
  MonacoEditor: ({ value }: { value?: string }) => <div data-testid="monaco">{value}</div>,
}))

import { HistoryPanel } from './HistoryPanel'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

class ResizeObserverStub {
  observe() { /* noop */ }

  unobserve() { /* noop */ }

  disconnect() { /* noop */ }
}

;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub

function makeItem(url: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'h1',
    statusCode: 200,
    durationMs: 12,
    createdAt: new Date().toISOString(),
    requestJson: { url, method: 'GET', headers: [], body: '' },
    responseJson: {
      url,
      method: 'GET',
      status: 200,
      statusText: 'OK',
      durationMs: 12,
      body: '{}',
      headers: [],
      requestQuery: [],
      requestHeaders: [],
      requestCookie: [],
      requestBodyParameters: [],
    },
    ...overrides,
  }
}

function mountPanel() {
  return render(<HistoryPanel menuItemId="api-1" open onClose={() => { /* noop */ }} />)
}

/** 点开左侧列表里的这条记录 */
async function selectRecord(url: string) {
  const record = await screen.findByText(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  fireEvent.click(record)

  return record
}

describe('历史详情：Query 参数展示', () => {
  beforeEach(() => {
    h.state.items = []
  })

  it('相对路径 URL 也能解析出 Query 参数（后端 requestQuery 恒为空）', async () => {
    h.state.items = [makeItem('/biz/sys?bizSys=1001&bizSysType=MAIN')]

    mountPanel()
    await selectRecord('/biz/sys?bizSys=1001&bizSysType=MAIN')

    await waitFor(() => {
      expect(screen.getByText('Query 参数 (2)')).toBeTruthy()
    })
    expect(screen.getByText('1001')).toBeTruthy()
    expect(screen.getByText('MAIN')).toBeTruthy()
  })

  it('绝对 URL 且后端给了 requestQuery 时优先后端快照', async () => {
    const item = makeItem('https://dev.a.com/biz/sys?bizSys=1001', {
      responseJson: {
        ...makeItem('https://dev.a.com/biz/sys?bizSys=1001').responseJson,
        requestQuery: [{ name: 'bizSys', value: 'from-server' }],
      },
    })

    h.state.items = [item]

    mountPanel()
    await selectRecord('https://dev.a.com/biz/sys?bizSys=1001')

    await waitFor(() => {
      expect(screen.getByText('Query 参数 (1)')).toBeTruthy()
    })
    expect(screen.getByText('from-server')).toBeTruthy()
    expect(screen.queryByText('1001')).toBeNull()
  })
})
