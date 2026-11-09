import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BodyType } from '@/enums'
import type { ApiDetails } from '@/types'

/**
 * 快捷请求集成测试：
 * 验证 Body 原文只有单一真源（workCopy.requestBody.rawText），
 * 编辑 → 保存 → 重新挂载后仍能回显（历史缺陷：Body 只存在局部 state，落库丢失）。
 */

interface SavedItem {
  id: string
  name: string
  data: ApiDetails
}

const h = vi.hoisted(() => {
  const state: {
    item: SavedItem | undefined
    history: unknown[]
    updateMenuItem: ReturnType<typeof vi.fn>
    saveDraft: ReturnType<typeof vi.fn>
  } = {
    item: undefined,
    history: [],
    updateMenuItem: vi.fn(),
    saveDraft: vi.fn(),
  }

  return { state }
})

vi.mock('@/components/MonacoEditor', () => ({
  MonacoEditor: ({ value, onChange }: { value?: string, onChange?: (v: string) => void }) => (
    <textarea data-testid="monaco" value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} />
  ),
}))

vi.mock('react-resizable-panels', async () => {
  const { Component } = await import('react')

  class PanelMock extends Component<{ children?: React.ReactNode }> {
    resize() { /* noop */ }

    getSize() { return 50 }

    render() {
      return <div>{this.props.children}</div>
    }
  }

  return {
    PanelGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Panel: PanelMock,
    PanelResizeHandle: () => <div />,
  }
})

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useParams: () => ({ projectId: 'p1' }),
}))

vi.mock('@/contexts/auth', () => ({ useAuth: () => ({ sessionId: 's1' }) }))

vi.mock('@/contexts/proxy-config', () => ({ useProxyConfig: () => ({ proxyConfig: undefined }) }))

vi.mock('@/contexts/global', () => ({
  useGlobalContext: () => ({
    messageApi: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    modal: { confirm: vi.fn() },
  }),
}))

vi.mock('@/components/ApiTab/TabContentContext', () => ({
  useTabContentContext: () => ({ tabData: { key: 'qr-1', data: {} } }),
}))

vi.mock('@/contexts/menu-tab-settings', () => ({
  useMenuTabContext: () => ({ activeTabKey: 'qr-1' }),
  useMenuTabHelpers: () => ({ setTabItemStatus: vi.fn(), setTabItemEditStatus: vi.fn() }),
}))

vi.mock('@/contexts/session-variables', () => ({
  useSessionVariablesContext: () => ({ sessionVars: {}, setSessionVars: vi.fn() }),
}))

vi.mock('@/contexts/menu-helpers', () => ({
  useMenuHelpersContext: () => ({
    menuRawList: h.state.item ? [{ ...h.state.item }] : [],
    dbMenuRawList: h.state.item ? [{ ...h.state.item }] : [],
    projectEnvironments: [],
    currentProjectEnvironmentId: undefined,
    projectEnvironmentConfig: {
      environments: [],
      globalVariables: [],
      globalParameters: { header: [], cookie: [], query: [], body: [] },
    },
    addMenuItem: vi.fn(),
    updateMenuItem: h.state.updateMenuItem,
    saveDraft: h.state.saveDraft,
    discardDraft: vi.fn(),
  }),
}))

vi.mock('@/api-client', () => ({
  apiRaw: vi.fn(),
  api: vi.fn((action: string) => Promise.resolve(
    action === 'list_request_history' ? h.state.history : [],
  )),
}))

import { QuickRequestRun } from './QuickRequestRun'

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

function makeQuickRequest(overrides: Partial<ApiDetails> = {}): ApiDetails {
  return {
    id: 'qr-1',
    name: '快捷请求',
    method: 'POST',
    path: 'https://api.example.com/orders',
    status: 'developing',
    serverUrl: '',
    parameters: { query: [], header: [], path: [], cookie: [] },
    requestBody: { type: BodyType.Json },
    responses: [],
    ...overrides,
  } as ApiDetails
}

function bodyEditor(container: HTMLElement): HTMLTextAreaElement {
  const editor = container.querySelector('textarea')

  if (!editor) { throw new Error('未找到 Body 编辑器') }

  return editor
}

class ResizeObserverStub {
  observe() { /* noop */ }

  unobserve() { /* noop */ }

  disconnect() { /* noop */ }
}

;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub

/** 展开 Body 类型下拉（antd Select 在 mouseDown 时打开） */
function openBodyTypeSelect(container: HTMLElement) {
  const selector = container.querySelector('[data-testid="body-type-select"] .ant-select-selector')

  if (!selector) { throw new Error('未找到 Body 类型下拉') }

  fireEvent.mouseDown(selector)
}

/** 按短标签选择 Body 类型（选项 title 保持纯字符串，定位稳定） */
function chooseBodyType(container: HTMLElement, label: string) {
  openBodyTypeSelect(container)

  const option = Array.from(document.querySelectorAll('.ant-select-item-option'))
    .find((node) => node.getAttribute('title') === label)

  if (!option) { throw new Error(`未找到下拉选项：${label}`) }

  fireEvent.click(option)
}

describe('快捷请求：Body 落库与回显', () => {
  beforeEach(() => {
    h.state.item = { id: 'qr-1', name: '快捷请求', data: makeQuickRequest() }
    h.state.history = []
    h.state.updateMenuItem = vi.fn((payload: { id: string, name: string, data: ApiDetails }) => {
      // 模拟落库：后续重挂载读到的就是这次写入的数据
      h.state.item = { id: payload.id, name: payload.name, data: payload.data }

      return Promise.resolve(undefined)
    })
    h.state.saveDraft = vi.fn()
  })

  it('编辑 Body 后保存，落库数据包含 Body 原文；重新挂载后回显', async () => {
    const first = render(<QuickRequestRun />)

    fireEvent.change(bodyEditor(first.container), { target: { value: '{"amount":100}' } })

    fireEvent.click(screen.getByRole('button', { name: '保 存' }))

    await waitFor(() => {
      expect(h.state.updateMenuItem).toHaveBeenCalled()
    })

    const payload = h.state.updateMenuItem.mock.calls.at(-1)?.[0] as { data: ApiDetails, runTabInfo: { bodyRawText?: string } }

    expect(payload.data.requestBody?.rawText).toBe('{"amount":100}')
    expect(payload.runTabInfo.bodyRawText).toBe('{"amount":100}')

    first.unmount()

    const second = render(<QuickRequestRun />)

    await waitFor(() => {
      expect(bodyEditor(second.container).value).toBe('{"amount":100}')
    })
  })

  it('切换 Body 类型后切回，内容不丢且落库仍是最新文本', async () => {
    const view = render(<QuickRequestRun />)

    fireEvent.change(bodyEditor(view.container), { target: { value: '{"a":1}' } })

    // 切到 raw，再切回 json
    chooseBodyType(view.container, 'raw')
    chooseBodyType(view.container, 'json')

    await waitFor(() => {
      expect(bodyEditor(view.container).value).toBe('{"a":1}')
    })

    fireEvent.click(screen.getByRole('button', { name: '保 存' }))

    await waitFor(() => {
      expect(h.state.updateMenuItem).toHaveBeenCalled()
    })

    const payload = h.state.updateMenuItem.mock.calls.at(-1)?.[0] as { data: ApiDetails }

    expect(payload.data.requestBody?.rawText).toBe('{"a":1}')
  })

  it('数据里没有 requestBody（cURL 导入无 body / 旧数据）时仍能选择 Body 类型', async () => {
    h.state.item = {
      id: 'qr-1',
      name: 'httpbin 测试',
      data: makeQuickRequest({ path: 'http://httpbin.org/post', requestBody: undefined }),
    }

    const view = render(<QuickRequestRun />)

    // 旧行为：直接显示「无 Body」，类型标签整行消失，用户无法切换
    expect(screen.queryByText('无 Body')).toBeNull()
    expect(view.container.querySelector('.ant-select-selector')).toBeTruthy()

    openBodyTypeSelect(view.container)

    expect(document.querySelector('.ant-select-item-option[title="form-data"]')).toBeTruthy()
    expect(document.querySelector('.ant-select-item-option[title="json"]')).toBeTruthy()

    chooseBodyType(view.container, 'json')

    await waitFor(() => {
      expect(view.container.querySelector('textarea')).toBeTruthy()
    })

    fireEvent.change(bodyEditor(view.container), { target: { value: '{"a":1}' } })
    fireEvent.click(screen.getByRole('button', { name: '保 存' }))

    await waitFor(() => {
      expect(h.state.updateMenuItem).toHaveBeenCalled()
    })

    const payload = h.state.updateMenuItem.mock.calls.at(-1)?.[0] as { data: ApiDetails }

    expect(payload.data.requestBody).toMatchObject({ type: BodyType.Json, rawText: '{"a":1}' })
  })

  it('进入快捷请求时展示最近一次请求结果', async () => {
    h.state.history = [{
      requestJson: { url: 'http://httpbin.org/post', method: 'POST', headers: [], body: '{"a":1}' },
      responseJson: {
        url: 'http://httpbin.org/post',
        method: 'POST',
        status: 200,
        statusText: 'OK',
        durationMs: 12,
        contentType: 'application/json',
        headers: [],
        requestHeaders: [],
        requestQuery: [],
        requestCookie: [],
        requestBodyParameters: [],
        requestBodyText: '{"a":1}',
        body: '{"ok":true}',
      },
    }]

    render(<QuickRequestRun />)

    // 结果区恢复：默认停在「响应内容」，并渲染历史响应体
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '响应内容' })?.getAttribute('aria-selected')).toBe('true')
    })

    expect(screen.getByText(/200 OK/)).toBeTruthy()
  })

  it('从未请求过时不展示结果区（保持空态提示）', async () => {
    const view = render(<QuickRequestRun />)

    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: '响应内容' })).toBeNull()
    })

    expect(view.container.textContent).toContain('查看响应')
  })

  it('历史回填：文档参数占位值被历史实际值覆盖，Params 面板直接可见', async () => {
    h.state.item = {
      id: 'qr-1',
      name: '查询业务系统',
      data: makeQuickRequest({
        method: 'GET' as ApiDetails['method'],
        path: '/biz/sys',
        parameters: {
          query: [
            { id: 'q1', name: 'bizSys', example: '@id', enable: true, type: 'string' },
            { id: 'q2', name: 'bizSysType', example: '@string', enable: true, type: 'string' },
          ],
          header: [],
          path: [],
          cookie: [],
        } as ApiDetails['parameters'],
      }),
    }

    h.state.history = [{
      id: 'h1',
      statusCode: 200,
      durationMs: 12,
      createdAt: new Date().toISOString(),
      requestJson: {
        url: 'https://dev.a.com/biz/sys?bizSys=1001&bizSysType=MAIN',
        method: 'GET',
        headers: [],
        body: '',
      },
      responseJson: { status: 200, statusText: 'OK', durationMs: 12, body: '{}', headers: [] },
    }]

    render(<QuickRequestRun />)

    // GET 默认停在 Params 页签，先确认占位值还在
    expect(screen.getByDisplayValue('@id')).toBeTruthy()

    fireEvent.click(screen.getByTitle('历史记录'))

    fireEvent.click(await screen.findByText(/\/biz\/sys\?bizSys=1001/))

    const applyLabel = await screen.findByText(/回\s*填/)
    const applyBtn = applyLabel.closest('button')

    if (!applyBtn) { throw new Error('未找到回填按钮') }

    fireEvent.click(applyBtn)

    await waitFor(() => {
      expect(screen.getByDisplayValue('1001')).toBeTruthy()
    })
    expect(screen.getByDisplayValue('MAIN')).toBeTruthy()
    expect(screen.queryByDisplayValue('@id')).toBeNull()
  })

  it('历史回填：文档没有 requestBody 时也能写入历史 body', async () => {
    h.state.item = {
      id: 'qr-1',
      name: '提交订单',
      data: makeQuickRequest({ method: 'POST' as ApiDetails['method'], path: '/orders', requestBody: undefined }),
    }

    h.state.history = [{
      id: 'h1',
      statusCode: 200,
      durationMs: 12,
      createdAt: new Date().toISOString(),
      requestJson: {
        url: 'https://dev.a.com/orders',
        method: 'POST',
        headers: [],
        body: '{"amount":5}',
        contentType: 'application/json',
      },
      responseJson: { status: 200, statusText: 'OK', durationMs: 12, body: '{}', headers: [] },
    }]

    const view = render(<QuickRequestRun />)

    fireEvent.click(screen.getByTitle('历史记录'))
    fireEvent.click(await screen.findByText(/\/orders$/))

    const applyLabel = await screen.findByText(/回\s*填/)
    const applyBtn = applyLabel.closest('button')

    if (!applyBtn) { throw new Error('未找到回填按钮') }

    fireEvent.click(applyBtn)

    await waitFor(() => {
      expect(bodyEditor(view.container).value).toBe('{"amount":5}')
    })
  })
})
