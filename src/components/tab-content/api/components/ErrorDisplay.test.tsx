import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ErrorDisplay } from './ErrorDisplay'

import { i18n } from '@/i18n'

/**
 * 错误展示组件的双语渲染回归。
 *
 * 这个组件是用户看到「请求失败」的实际出口。截图曾经暴露出：
 * 外层的 Request failed / Suggested checks / Retry 已是英文，
 * 但中间的 message 与建议来自后端中文字符串，形成中英混排。
 *
 * 现在后端只回错误码，这里锁定「组件真的按语言渲染」。
 */

const connectionFailed = {
  errorType: 'connection_failed',
  // 后端现在不回文案；这两个字段留作兜底，正常路径为空
  errorMessage: '',
  errorDetail: 'error sending request for url (https://example.invalid)',
  suggestion: '',
}

afterEach(() => {
  void i18n.changeLanguage('zh-CN')
})

describe('ErrorDisplay 英文界面', () => {
  it('message 与建议为英文，无中文残留', () => {
    void i18n.changeLanguage('en-US')

    const { container } = render(<ErrorDisplay errorInfo={connectionFailed} />)
    const text = container.textContent ?? ''

    expect(text).toContain('Request failed')
    expect(text).toContain('Unable to connect to the server')
    expect(text).toContain('Suggested checks')
    expect(text).toContain('Make sure the target server is online')

    // 关键断言：整体不得出现中文（截图问题的本质）
    expect(/[\u4e00-\u9fa5]/.test(text)).toBe(false)
  })

  it('技术详情保持原始英文报错，不被翻译', () => {
    void i18n.changeLanguage('en-US')

    const { container } = render(<ErrorDisplay errorInfo={connectionFailed} />)

    expect(container.textContent).toContain('Technical details')
  })
})

describe('ErrorDisplay 中文界面', () => {
  it('message 与建议为中文，与改造前一致', () => {
    void i18n.changeLanguage('zh-CN')

    const { container } = render(<ErrorDisplay errorInfo={connectionFailed} />)
    const text = container.textContent ?? ''

    expect(text).toContain('请求失败')
    expect(text).toContain('无法连接到服务器')
    expect(text).toContain('建议排查方向')
    expect(text).toContain('请检查网络连接和 URL 是否正确')
    expect(text).toContain('确认目标服务器是否在线')
  })
})

describe('切换语言后无需重新请求即可刷新', () => {
  it('已渲染的错误信息随语言切换更新', () => {
    void i18n.changeLanguage('zh-CN')

    const { container, rerender } = render(<ErrorDisplay errorInfo={connectionFailed} />)
    expect(container.textContent).toContain('无法连接到服务器')

    void i18n.changeLanguage('en-US')
    // 模拟 React 因语言变化重渲染
    rerender(<ErrorDisplay errorInfo={connectionFailed} />)

    expect(container.textContent).toContain('Unable to connect to the server')
    expect(container.textContent).not.toContain('无法连接到服务器')
  })
})

describe('后端未知错误类型', () => {
  it('用后端原文兜底，不显示 i18n key', () => {
    void i18n.changeLanguage('en-US')

    const { container } = render(
      <ErrorDisplay
        errorInfo={{
          errorType: 'some_future_error',
          errorMessage: 'Future backend message',
          errorDetail: 'detail',
          suggestion: 'first hint\nsecond hint',
        }}
      />,
    )
    const text = container.textContent ?? ''

    expect(text).toContain('Future backend message')
    expect(text).toContain('first hint')
    expect(text).not.toContain('api.run.networkError')
  })
})
