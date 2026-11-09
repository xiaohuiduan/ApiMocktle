import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BodyType } from '@/enums'
import type { ApiDetails, ApiRunResult } from '@/types'

/**
 * 运行 Tab 的集成测试：
 * 走真实组件树（Tabs / BodyPanel / useApiRequestRunner / 本地副本 / 历史恢复），
 * 只替换外部边界（Monaco、后端 api、各 context）。
 */

interface Call {
  action: string
  payload?: any
}

const h = vi.hoisted(() => {
  const state: {
    menuRawList: unknown[] | undefined
    history: unknown[]
    calls: Call[]
  } = {
    menuRawList: undefined,
    history: [],
    calls: [],
  }

  return { state }
})

vi.mock('@/components/MonacoEditor', () => ({
  MonacoEditor: ({ value, onChange }: { value?: string, onChange?: (v: string) => void }) => (
    <textarea data-testid="monaco" value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} />
  ),
}))

// 面板布局库依赖真实尺寸测量，jsdom 无法提供；只替换布局容器，业务内容照常渲染。
// Panel 用类组件承载 ref（ResponsePanel 会调用 resize），避免 ref 告警。
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
  useTabContentContext: () => ({ tabData: { key: 'api-1' } }),
}))

vi.mock('@/contexts/menu-tab-settings', () => ({
  useMenuTabHelpers: () => ({ setTabItemEditStatus: vi.fn() }),
}))

vi.mock('@/contexts/session-variables', () => ({
  useSessionVariablesContext: () => ({ sessionVars: {}, setSessionVars: vi.fn() }),
}))

vi.mock('@/contexts/menu-helpers', () => ({
  useMenuHelpersContext: () => ({
    menuRawList: h.state.menuRawList,
    projectEnvironments: [],
    currentProjectEnvironmentId: undefined,
    projectEnvironmentConfig: {
      environments: [],
      globalVariables: [],
      globalParameters: { header: [], cookie: [], query: [], body: [] },
    },
    updateMenuItem: vi.fn(() => Promise.resolve(undefined)),
  }),
}))

vi.mock('@/api-client', () => ({
  apiRaw: vi.fn(),
  api: vi.fn((action: string, payload?: any) => {
    h.state.calls.push({ action, payload })

    switch (action) {
      case 'list_request_history':
        return Promise.resolve(h.state.history)

      case 'save_request_history':
        h.state.history = [{ requestJson: payload.requestJson, responseJson: payload.responseJson }]

        return Promise.resolve(undefined)

      case 'resolve_template_batch':
        return Promise.resolve((payload?.fields ?? []).map((field: string) => ({ resolved: field, vars: [], errors: [] })))

      case 'run_api_request': {
        const result: ApiRunResult = {
          url: payload.payload.url,
          method: payload.payload.method,
          status: 200,
          statusText: 'OK',
          durationMs: 3,
          contentType: payload.payload.contentType,
          requestHeaders: payload.payload.headers,
          requestQuery: [],
          requestCookie: [],
          requestBodyText: payload.payload.body,
          requestBodyParameters: [],
          headers: [],
          body: '{"ok":true}',
        } as ApiRunResult

        return Promise.resolve(result)
      }

      default:
        return Promise.resolve([])
    }
  }),
}))

import { RunTab } from './RunTab'
import { getRunTabStorageKey, writeLocalRunCopy } from './runTabState'

// jsdom 缺失的浏览器 API（antd 响应式 + react-resizable-panels 依赖）
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

function makeDoc(overrides: Partial<ApiDetails> = {}): ApiDetails {
  return {
    id: 'api-1',
    name: '创建订单',
    method: 'POST',
    path: '/orders',
    status: 'developing',
    serverUrl: '',
    parameters: { query: [], header: [], path: [], cookie: [] },
    requestBody: { type: BodyType.Json },
    responses: [],
    ...overrides,
  } as ApiDetails
}

function mountWith(doc: ApiDetails, docUpdatedAt = 'v1') {
  h.state.menuRawList = [{ id: doc.id, name: doc.name, data: doc, updatedAt: docUpdatedAt }]

  return render(<RunTab />)
}

function bodyEditor(container: HTMLElement): HTMLTextAreaElement {
  const editor = container.querySelector('textarea')

  if (!editor) { throw new Error('未找到 Body 编辑器') }

  return editor
}

function storedRawText(apiId: string): string | undefined {
  const raw = window.localStorage.getItem(getRunTabStorageKey(apiId))

  if (!raw) { return undefined }

  return (JSON.parse(raw) as { workCopy?: ApiDetails }).workCopy?.requestBody?.rawText
}

describe('运行 Tab：Body 跨挂载回显', () => {
  beforeEach(() => {
    window.localStorage.clear()
    h.state.calls = []
    h.state.history = []
    h.state.menuRawList = undefined
  })

  it('填写 JSON → 运行 → 关闭再进入，Body 回显且再次发送内容一致', async () => {
    const doc = makeDoc()
    const first = mountWith(doc)

    const editor = bodyEditor(first.container)

    fireEvent.change(editor, { target: { value: '{"amount":100}' } })

    await waitFor(() => {
      expect(storedRawText('api-1')).toBe('{"amount":100}')
    })

    fireEvent.click(screen.getByRole('button', { name: /运\s*行/ }))

    await waitFor(() => {
      expect(h.state.calls.some((c) => c.action === 'run_api_request')).toBe(true)
    })

    // 发送的 Body 与编辑器内容一致
    const runCall = h.state.calls.find((c) => c.action === 'run_api_request')

    expect(runCall?.payload.payload.body).toBe('{"amount":100}')

    first.unmount()

    // 第二次进入：全新挂载，只能依赖本地副本 + 历史恢复
    const second = mountWith(doc)

    await waitFor(() => {
      expect(bodyEditor(second.container).value).toBe('{"amount":100}')
    })

    // 历史恢复（body 非空）不应把内容改写成其它值
    expect(bodyEditor(second.container).value).toBe('{"amount":100}')

    // 最近一次运行结果也应恢复展示：结果区停在「响应内容」
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '响应内容' })?.getAttribute('aria-selected')).toBe('true')
    })
  })

  it('文档定义了 JSON Schema 但 Body 为空时，切页签与重挂载都不会被自动填充示例', async () => {
    const doc = makeDoc({
      requestBody: {
        type: BodyType.Json,
        jsonSchema: {
          type: 'object',
          properties: [{ name: 'amount', type: 'number' }],
        },
      } as never,
    })

    const view = mountWith(doc)

    // 首次进入：编辑器为空，不自动填充 schema 示例
    expect(bodyEditor(view.container).value).toBe('')

    // 切到 Params 再切回 Body
    fireEvent.click(screen.getByText('Params'))
    fireEvent.click(screen.getByText('Body'))

    expect(bodyEditor(view.container).value).toBe('')

    // 空 Body 运行：实际发送空内容（不回退示例）
    fireEvent.click(screen.getByRole('button', { name: /运\s*行/ }))

    await waitFor(() => {
      expect(h.state.calls.some((c) => c.action === 'run_api_request')).toBe(true)
    })

    const runCall = h.state.calls.find((c) => c.action === 'run_api_request')

    expect(runCall?.payload.payload.body).toBe('')

    view.unmount()

    // 重新挂载：仍为空
    const again = mountWith(doc)

    await waitFor(() => {
      expect(bodyEditor(again.container).value).toBe('')
    })
  })

  it('文档 rawText 是一段 JSON Schema 时，进入与重进都不会把它填进编辑器', async () => {
    const schemaText = '{"$schema":"http://json-schema.org/draft-04/schema#","type":"object","description":"Map","properties":{"string":{"type":"object","properties":{}}}}'
    const doc = makeDoc({
      requestBody: {
        type: BodyType.Json,
        rawText: schemaText,
        jsonSchema: {
          type: 'object',
          description: 'Map',
          properties: [{ name: 'string', type: 'object', properties: [] }],
        },
      } as never,
    })

    const first = mountWith(doc)

    expect(bodyEditor(first.container).value).toBe('')

    first.unmount()

    const second = mountWith(doc)

    await waitFor(() => {
      expect(bodyEditor(second.container).value).toBe('')
    })

    // 「一键填充」是显式动作：按 schema 生成示例（而不是把 schema 源码写进编辑器）
    fireEvent.click(screen.getByRole('button', { name: '一键填充' }))

    await waitFor(() => {
      expect(bodyEditor(second.container).value).toContain('"string"')
    })

    expect(bodyEditor(second.container).value).not.toBe(schemaText)
  })

  it('文档只有 rawText 没有 schema 时，一键填充回退到文档正文', async () => {
    const doc = makeDoc({
      requestBody: { type: BodyType.Json, rawText: '{"amount":1}' } as never,
    })

    const view = mountWith(doc)

    expect(bodyEditor(view.container).value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: '一键填充' }))

    await waitFor(() => {
      expect(bodyEditor(view.container).value).toBe('{"amount":1}')
    })
  })

  it('菜单数据晚于首帧到达时仍能恢复本地副本（不因时序丢 Body）', async () => {
    const doc = makeDoc()

    writeLocalRunCopy(getRunTabStorageKey('api-1'), 'v1', {
      ...doc,
      requestBody: { ...doc.requestBody!, rawText: '{"typed":"local"}' },
    })

    // 首帧：菜单未就绪 → docValue 为空
    const view = render(<RunTab />)

    expect(view.container.querySelector('textarea')).toBeNull()

    // 菜单到达
    h.state.menuRawList = [{ id: doc.id, name: doc.name, data: doc, updatedAt: 'v1' }]
    view.rerender(<RunTab />)

    await waitFor(() => {
      expect(bodyEditor(view.container).value).toBe('{"typed":"local"}')
    })
  })

  it('历史记录 body 为空（GET 携带 Body 被剔除）时不覆盖本地 Body', async () => {
    const doc = makeDoc({ method: 'GET' as ApiDetails['method'] })

    writeLocalRunCopy(getRunTabStorageKey('api-1'), 'v1', {
      ...doc,
      requestBody: { ...doc.requestBody!, rawText: '{"query":{"match_all":{}}}' },
    })

    h.state.history = [
      {
        requestJson: { url: 'https://dev.a.com/orders?page=1', method: 'GET', headers: [], body: '' },
        responseJson: { status: 200, statusText: 'OK', durationMs: 1, body: '{}', headers: [] },
      },
    ]

    const view = mountWith(doc)

    // GET 默认打开 Params 页签，手动切到 Body
    fireEvent.click(screen.getByText('Body'))

    await waitFor(() => {
      expect(bodyEditor(view.container).value).toBe('{"query":{"match_all":{}}}')
    })

    // 历史里的 query 仍被填补（参数面板兜底）
    await waitFor(() => {
      const raw = window.localStorage.getItem(getRunTabStorageKey('api-1'))
      const query = raw
        ? (JSON.parse(raw) as { workCopy?: ApiDetails }).workCopy?.parameters?.query ?? []
        : []

      expect(query.some((p) => p.name === 'page' && p.example === '1')).toBe(true)
    })
  })

  it('文档定义了参数占位值时，历史记录会覆盖成实际值（参数面板直接可见）', async () => {
    const doc = makeDoc({
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
    })

    h.state.history = [
      {
        requestJson: {
          url: 'https://dev.a.com/biz/sys?bizSys=1001&bizSysType=MAIN',
          method: 'GET',
          headers: [],
          body: '',
        },
        responseJson: { status: 200, statusText: 'OK', durationMs: 1, body: '{}', headers: [] },
      },
    ]

    const view = mountWith(doc)

    // 用户能看到的输入框：参数名保持文档结构，请求值换成历史实际值
    await waitFor(() => {
      expect(screen.getByDisplayValue('1001')).toBeTruthy()
    })
    expect(screen.getByDisplayValue('MAIN')).toBeTruthy()
    expect(screen.getByDisplayValue('bizSys')).toBeTruthy()
    expect(screen.getByDisplayValue('bizSysType')).toBeTruthy()
    expect(screen.queryByDisplayValue('@id')).toBeNull()

    // 同一份结果也落到本地副本
    const raw = window.localStorage.getItem(getRunTabStorageKey('api-1'))
    const query = raw
      ? (JSON.parse(raw) as { workCopy?: ApiDetails }).workCopy?.parameters?.query ?? []
      : []

    expect(query.map((p) => [p.name, p.example])).toEqual([
      ['bizSys', '1001'],
      ['bizSysType', 'MAIN'],
    ])
    expect(view.container.textContent).not.toContain('@id')
  })

  it('历史 URL 是相对路径（未选环境）时也能回填参数，不会把面板清空', async () => {
    const doc = makeDoc({
      method: 'GET' as ApiDetails['method'],
      path: '/biz/sys',
    })

    h.state.history = [
      {
        requestJson: { url: '/biz/sys?bizSys=1001', method: 'GET', headers: [], body: '' },
        responseJson: { status: 200, statusText: 'OK', durationMs: 1, body: '{}', headers: [] },
      },
    ]

    mountWith(doc)

    await waitFor(() => {
      expect(screen.getByDisplayValue('1001')).toBeTruthy()
    })

    // 相对路径还原时不能把 query 带进 path
    expect(screen.getByDisplayValue('/biz/sys')).toBeTruthy()
  })

  it('用户自己写的 {{var}} 模板会被历史实际值覆盖（整体还原口径）', async () => {
    const doc = makeDoc({
      method: 'GET' as ApiDetails['method'],
      path: '/biz/sys',
      parameters: {
        query: [{ id: 'q1', name: 'bizSys', example: '{{sysId}}', enable: true, type: 'string' }],
        header: [],
        path: [],
        cookie: [],
      } as ApiDetails['parameters'],
    })

    writeLocalRunCopy(getRunTabStorageKey('api-1'), 'v1', doc)
    h.state.history = [
      {
        requestJson: { url: '/biz/sys?bizSys=1001', method: 'GET', headers: [], body: '' },
        responseJson: { status: 200, statusText: 'OK', durationMs: 1, body: '{}', headers: [] },
      },
    ]

    mountWith(doc)

    await waitFor(() => {
      expect(screen.getByDisplayValue('1001')).toBeTruthy()
    })
    expect(screen.queryByDisplayValue('{{sysId}}')).toBeNull()
  })

  it('历史正文回填后同步写入按类型的正文缓存（切走再切回不会读到旧正文）', async () => {
    const doc = makeDoc()

    h.state.history = [
      {
        requestJson: {
          url: '/orders',
          method: 'POST',
          headers: [],
          body: '{"amount":5}',
          contentType: 'application/json',
        },
        responseJson: { status: 200, statusText: 'OK', durationMs: 1, body: '{}', headers: [] },
      },
    ]

    mountWith(doc)

    await waitFor(() => {
      const raw = window.localStorage.getItem(getRunTabStorageKey('api-1'))
      const payload = raw
        ? (JSON.parse(raw) as { workCopy?: ApiDetails, bodyTexts?: Record<string, string> })
        : undefined

      expect(payload?.workCopy?.requestBody?.rawText).toBe('{"amount":5}')
      expect(payload?.bodyTexts?.['application/json']).toBe('{"amount":5}')
    })
  })

  it('文档版本变化且文档无 Body 时保留本地 Body，不清空', async () => {
    const doc = makeDoc()

    writeLocalRunCopy(getRunTabStorageKey('api-1'), 'v1', {
      ...doc,
      requestBody: { ...doc.requestBody!, rawText: '{"typed":"local"}' },
    })

    const view = mountWith(doc, 'v2')

    await waitFor(() => {
      expect(bodyEditor(view.container).value).toBe('{"typed":"local"}')
    })
  })
})
