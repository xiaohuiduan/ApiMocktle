import { beforeEach, describe, expect, it, vi } from 'vitest'

import { decideAnchorAction, ensureAnchorExternalLinkHandler, resetAnchorExternalLinkHandler } from './anchor-external-link'

const openMock = vi.fn()

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: (...args: unknown[]) => openMock(...args) as Promise<void>,
}))

interface ClickOptions {
  button?: number
  ctrlKey?: boolean
  metaKey?: boolean
  /** 点击锚点内部子元素而非锚点本身 */
  clickChild?: boolean
}

/** 造一个挂在 document 上的链接并点击它，返回事件对象 */
function clickLink(href: string, options: ClickOptions = {}): MouseEvent {
  const anchor = document.createElement('a')

  anchor.setAttribute('href', href)
  anchor.textContent = '链接'
  document.body.append(anchor)

  let clickTarget: HTMLElement = anchor

  if (options.clickChild) {
    const span = document.createElement('span')

    span.textContent = '子元素'
    anchor.append(span)
    clickTarget = span
  }

  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
  })

  clickTarget.dispatchEvent(event)
  anchor.remove()

  return event
}

/** 造一个带 download 属性的下载锚点并触发 click() */
function clickDownloadLink(href: string): MouseEvent {
  const anchor = document.createElement('a')

  anchor.setAttribute('href', href)
  anchor.setAttribute('download', '导出.md')

  const events: MouseEvent[] = []
  const listener = (event: Event) => events.push(event as MouseEvent)

  document.addEventListener('click', listener, { once: true })
  document.body.append(anchor)
  anchor.click()
  document.removeEventListener('click', listener)
  anchor.remove()

  return events[0]
}

describe('decideAnchorAction', () => {
  it('http 与 https 链接判为交给系统浏览器打开', () => {
    expect(decideAnchorAction('https://example.com/docs')).toEqual({ action: 'open', url: 'https://example.com/docs' })
    expect(decideAnchorAction('http://example.com/a?b=1')).toEqual({ action: 'open', url: 'http://example.com/a?b=1' })
  })

  it('不做首尾标点剥离，保留 URL 本身的括号', () => {
    expect(decideAnchorAction('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual({
      action: 'open',
      url: 'https://en.wikipedia.org/wiki/Foo_(bar)',
    })
  })

  it('协议相对链接补 https 后交给系统浏览器', () => {
    expect(decideAnchorAction('//example.com/a')).toEqual({ action: 'open', url: 'https://example.com/a' })
  })

  it('锚点与空链接判为保持原有行为', () => {
    expect(decideAnchorAction('#使用说明')).toEqual({ action: 'ignore' })
    expect(decideAnchorAction(null)).toEqual({ action: 'ignore' })
    expect(decideAnchorAction('')).toEqual({ action: 'ignore' })
  })

  it('站内相对链接判为保持原有行为', () => {
    expect(decideAnchorAction('/docs/intro')).toEqual({ action: 'ignore' })
    expect(decideAnchorAction('docs/intro')).toEqual({ action: 'ignore' })
  })

  it('非 http(s) 协议判为拦截且不打开', () => {
    expect(decideAnchorAction('javascript:alert(1)')).toEqual({ action: 'block' })
    expect(decideAnchorAction('data:text/html,<b>x</b>')).toEqual({ action: 'block' })
    expect(decideAnchorAction('file:///etc/passwd')).toEqual({ action: 'block' })
    expect(decideAnchorAction('mailto:a@b.com')).toEqual({ action: 'block' })
  })
})

describe('ensureAnchorExternalLinkHandler', () => {
  beforeEach(() => {
    openMock.mockReset()
    openMock.mockResolvedValue(undefined)
    resetAnchorExternalLinkHandler()
    ensureAnchorExternalLinkHandler()
  })

  it('点击 https 链接时交给系统浏览器，并阻止 WebView 自行导航', () => {
    const event = clickLink('https://example.com/docs')

    expect(event.defaultPrevented).toBe(true)
    expect(openMock).toHaveBeenCalledWith('https://example.com/docs')
  })

  it('点击锚点内部的子元素也能命中拦截', () => {
    const event = clickLink('https://example.com/docs', { clickChild: true })

    expect(event.defaultPrevented).toBe(true)
    expect(openMock).toHaveBeenCalledWith('https://example.com/docs')
  })

  it('点击伪协议链接时既不打开也不导航', () => {
    const event = clickLink('javascript:alert(1)')

    expect(event.defaultPrevented).toBe(true)
    expect(openMock).not.toHaveBeenCalled()
  })

  it('带 download 的下载链接不被拦截', () => {
    const event = clickDownloadLink('blob:http://localhost:1420/abc')

    expect(event.defaultPrevented).toBe(false)
    expect(openMock).not.toHaveBeenCalled()
  })

  it('点击锚点链接时不拦截，交给 bytemd 自己滚动', () => {
    const event = clickLink('#使用说明')

    expect(event.defaultPrevented).toBe(false)
    expect(openMock).not.toHaveBeenCalled()
  })

  it('带修饰键的点击交给默认行为', () => {
    expect(clickLink('https://example.com/docs', { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(clickLink('https://example.com/docs', { metaKey: true }).defaultPrevented).toBe(false)
    expect(openMock).not.toHaveBeenCalled()
  })

  it('非左键点击交给默认行为', () => {
    expect(clickLink('https://example.com/docs', { button: 1 }).defaultPrevented).toBe(false)
    expect(openMock).not.toHaveBeenCalled()
  })

  it('重复调用只注册一次，不会重复打开', () => {
    ensureAnchorExternalLinkHandler()
    clickLink('https://example.com/docs')

    expect(openMock).toHaveBeenCalledTimes(1)
  })
})
