/**
 * vitest 全局 setup。
 *
 * 关键职责：把语言固定在中文。
 *
 * jsdom 的 `navigator.language` 是硬编码常量 `en-US`，而项目现有 52 行测试断言
 * 依赖中文文案（`getByText('创建订单')` 等）。若不固定，任何语言相关改动都会让
 * 这批断言在测试环境全体切英文而失败。把它们固定在「默认语言」这一确定状态，
 * 比改造 52 行断言更安全：断言与被测代码不共用同一 key 来源，key 写错时仍会红。
 *
 * 需要验证英文行为的测试，可在用例内自行 `i18n.changeLanguage('en-US')` 并在
 * `afterEach` 切回中文。
 */
import { i18n, initI18n } from '@/i18n'

// i18next 在 resources 内置时是同步初始化的，init 后立即可 t()，无需异步等待
initI18n({ mode: 'system' })

if (i18n.language !== 'zh-CN') {
  void i18n.changeLanguage('zh-CN')
}

// 固定 navigator 语言，让「自动探测」路径在测试里也稳定指向中文
Object.defineProperty(window.navigator, 'language', {
  configurable: true,
  get: () => 'zh-CN',
})

Object.defineProperty(window.navigator, 'languages', {
  configurable: true,
  get: () => ['zh-CN', 'zh'],
})

// jsdom 缺少的浏览器 API。此前在多个测试文件里各复制一份，统一上移。
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => { /* noop */ },
    removeListener: () => { /* noop */ },
    addEventListener: () => { /* noop */ },
    removeEventListener: () => { /* noop */ },
    dispatchEvent: () => false,
  }),
})

class ResizeObserverStub {
  observe() { /* noop */ }

  unobserve() { /* noop */ }

  disconnect() { /* noop */ }
}

;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub
