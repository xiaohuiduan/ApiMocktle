import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SchemaType } from '@/components/JsonSchema'
import { BodyType, ParamType } from '@/enums'

vi.mock('@/components/MonacoEditor', () => ({
  MonacoEditor: ({ value }: { value?: string }) => <textarea readOnly value={value ?? ''} />,
}))

vi.mock('@/contexts/auth', () => ({ useAuth: () => ({ sessionId: 's1' }) }))

vi.mock('@/api-client', () => ({
  api: vi.fn(() => Promise.resolve([])),
  apiRaw: vi.fn(),
}))

import { BodyPanel } from './BodyPanel'

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

/** 展开 Body 类型下拉（antd Select 在 mouseDown 时打开） */
function openBodyTypeSelect(container: HTMLElement) {
  const selector = container.querySelector('[data-testid="body-type-select"] .ant-select-selector')

  if (!selector) { throw new Error('未找到 Body 类型下拉') }

  fireEvent.mouseDown(selector)
}

/** 按短标签点击下拉选项（选项 title 保持纯字符串，定位稳定） */
function clickBodyTypeOption(label: string) {
  const option = Array.from(document.querySelectorAll('.ant-select-item-option'))
    .find((node) => node.getAttribute('title') === label)

  if (!option) { throw new Error(`未找到下拉选项：${label}`) }

  fireEvent.click(option)
}

describe('BodyPanel 类型选择器', () => {
  it('requestBody 缺失时仍可展开下拉并切到 json', () => {
    const onBodyTypeChange = vi.fn()
    const { container } = render(
      <BodyPanel requestBody={undefined} onBodyTypeChange={onBodyTypeChange} />,
    )

    // 不再出现「无 Body」这种没有出口的空态
    expect(screen.queryByText('无 Body')).toBeNull()
    expect(screen.getByText('Body 类型')).toBeTruthy()

    openBodyTypeSelect(container)

    for (const label of ['none', 'form-data', 'url-encoded', 'json', 'xml', 'raw', 'binary']) {
      expect(document.querySelector(`.ant-select-item-option[title="${label}"]`)).toBeTruthy()
    }

    clickBodyTypeOption('json')

    expect(onBodyTypeChange).toHaveBeenCalledWith(BodyType.Json)
  })

  it('requestBody 缺失且无回调时保持只读空态', () => {
    render(<BodyPanel requestBody={undefined} />)

    expect(screen.getByText('无 Body')).toBeTruthy()
  })

  it('requestBody 为 none 时展示下拉与「无请求体」提示', () => {
    const { container } = render(
      <BodyPanel requestBody={{ type: BodyType.None }} onBodyTypeChange={vi.fn()} />,
    )

    expect(container.querySelector('[data-testid="body-type-select"]')).toBeTruthy()
    expect(screen.getByText('无请求体')).toBeTruthy()
  })

  it('json 类型渲染编辑器并回显 rawText', () => {
    const { container } = render(
      <BodyPanel
        bodyRawText={'{"a":1}'}
        requestBody={{ type: BodyType.Json }}
        onBodyTypeChange={vi.fn()}
      />,
    )

    expect(container.querySelector('textarea')?.value).toBe('{"a":1}')
  })

  it('json 下显示一键填充，form-data 下不显示', () => {
    const { unmount } = render(
      <BodyPanel
        requestBody={{ type: BodyType.Json }}
        onBodyTypeChange={vi.fn()}
        onFillBody={vi.fn()}
      />,
    )

    expect(screen.getByText('一键填充')).toBeTruthy()
    unmount()

    render(
      <BodyPanel
        requestBody={{ type: BodyType.FormData }}
        onBodyTypeChange={vi.fn()}
        onFillBody={vi.fn()}
      />,
    )

    expect(screen.queryByText('一键填充')).toBeNull()
  })

  it('只有 jsonSchema、正文为空时，正文组头不显示内容标记', () => {
    const { container } = render(
      <BodyPanel
        requestBody={{
          type: BodyType.Json,
          jsonSchema: {
            type: SchemaType.Object,
            properties: [{ name: 'id', type: SchemaType.String }],
          } as never,
          rawText: '',
        }}
        onBodyTypeChange={vi.fn()}
      />,
    )

    openBodyTypeSelect(container)

    const rawGroup = Array.from(document.querySelectorAll('.ant-select-item-group'))
      .find((node) => node.textContent?.includes('正文'))

    expect(rawGroup).toBeTruthy()
    // 文档 schema 不参与发送，不应被算作「正文有内容」
    expect(rawGroup?.querySelector('[data-testid="body-type-dot"]')).toBeNull()
  })

  it('正文非空时正文组头显示内容标记，且表单参数槽位有内容时出现 +1 角标', () => {
    const { container } = render(
      <BodyPanel
        bodyRawText={'{"a":1}'}
        requestBody={{
          type: BodyType.Json,
          parameters: [{ id: 'p1', name: 'file', type: ParamType.String, example: '', enable: true }],
          rawText: '{"a":1}',
        }}
        onBodyTypeChange={vi.fn()}
      />,
    )

    expect(container.querySelector('[data-testid="body-type-extra-badge"]')?.textContent).toBe('+1')

    openBodyTypeSelect(container)

    const rawGroup = Array.from(document.querySelectorAll('.ant-select-item-group'))
      .find((node) => node.textContent?.includes('正文'))

    expect(rawGroup?.querySelector('[data-testid="body-type-dot"]')).toBeTruthy()
  })
})
