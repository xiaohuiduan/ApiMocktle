import { describe, expect, it, afterEach } from 'vitest'

import { i18n } from '@/i18n'
import { localizeRequestError, NETWORK_ERROR_TYPES } from '@/i18n/request-error'
import { enUS, zhCN } from '@/i18n/resources'

/**
 * 请求错误文案的国际化守护。
 *
 * 背景：后端 `categorize_request_error()` 过去直接回中文 `error_message` /
 * `suggestion`，英文界面下错误提示仍是中文。现在后端只回稳定错误码
 * （`errorType`），前端按语言渲染。这套映射一旦漏项，用户会看到 i18n key。
 *
 * 三件事必须同时成立：
 * 1. 后端会产生的每个 `error_type` 在语言包里都有 message 与 suggestion
 * 2. 中文值与后端改造前的原文逐字一致（既有用户预期与截图）
 * 3. 英文界面下渲染的是英文，不是中文、也不是 key 原文
 */

/** 后端 `request_runner.rs` 的 `error_type` 全集（与 NETWORK_ERROR_TYPES 对齐）。 */
const BACKEND_ERROR_TYPES = [
  'dns_failure',
  'connection_refused',
  'connection_reset',
  'network_unreachable',
  'connection_failed',
  'timeout',
  'tls_error',
  'http_error',
  'redirect_error',
  'body_error',
  'unknown',
]

afterEach(() => {
  void i18n.changeLanguage('zh-CN')
})

describe('错误码集合与后端一致', () => {
  it('NETWORK_ERROR_TYPES 覆盖后端全部 error_type', () => {
    expect([...NETWORK_ERROR_TYPES].sort()).toEqual([...BACKEND_ERROR_TYPES].sort())
  })
})

describe('每种错误类型在中英语言包里都有文案', () => {
  it.each(BACKEND_ERROR_TYPES)('%s 的 message 在两语言下都存在', (type) => {
    for (const lang of ['zh-CN', 'en-US'] as const) {
      void i18n.changeLanguage(lang)

      const { message } = localizeRequestError({ errorType: type })

      expect(message, `${lang} / ${type}`).toBeTruthy()
      // 不应回退成 key 原文
      expect(message).not.toContain('api.run.networkError')
      expect(message).not.toContain('.message')
    }
  })

  it.each(BACKEND_ERROR_TYPES)('%s 的 suggestion 在两语言下都非空', (type) => {
    for (const lang of ['zh-CN', 'en-US'] as const) {
      void i18n.changeLanguage(lang)

      const { suggestion } = localizeRequestError({ errorType: type })

      expect(suggestion.length, `${lang} / ${type}`).toBeGreaterThan(0)
      // 不应把 key 原文当建议
      expect(suggestion.join('')).not.toContain('api.run.networkError')
    }
  })
})

describe('中文文案与改造前的后端原文逐字一致', () => {
  // 这些值是改造前 request_runner.rs 里的原文，用作回归基准
  const EXPECTED_ZH_MESSAGES: Record<string, string> = {
    dns_failure: 'DNS 解析失败，无法找到服务器地址',
    connection_refused: '连接被服务器拒绝',
    connection_reset: '连接被重置',
    network_unreachable: '网络不可达',
    connection_failed: '无法连接到服务器',
    timeout: '请求超时',
    tls_error: 'TLS/SSL 证书验证失败',
    http_error: 'HTTP 响应状态异常',
    redirect_error: '重定向处理失败',
    body_error: '请求体发送失败',
    unknown: '请求异常',
  }

  it.each(Object.entries(EXPECTED_ZH_MESSAGES))('%s 的中文 message 未走样', (type, expected) => {
    void i18n.changeLanguage('zh-CN')
    expect(localizeRequestError({ errorType: type }).message).toBe(expected)
  })

  it('connection_failed 的建议与原文逐条一致', () => {
    void i18n.changeLanguage('zh-CN')

    expect(localizeRequestError({ errorType: 'connection_failed' }).suggestion).toEqual([
      '请检查网络连接和 URL 是否正确',
      '确认目标服务器是否在线',
    ])
  })

  it('timeout 的三条建议顺序不变', () => {
    void i18n.changeLanguage('zh-CN')

    expect(localizeRequestError({ errorType: 'timeout' }).suggestion).toEqual([
      '目标服务器响应过慢，请稍后重试',
      '检查网络连接是否稳定',
      '确认目标服务器是否负载过高',
    ])
  })
})

describe('英文界面下输出英文', () => {
  it('connection_failed 渲染英文 message 与建议', () => {
    void i18n.changeLanguage('en-US')

    const { message, suggestion } = localizeRequestError({ errorType: 'connection_failed' })

    expect(message).toBe(enUS.api.run.networkError.connection_failed.message)
    expect(suggestion).toEqual([...enUS.api.run.networkError.connection_failed.suggestion])

    // 不得残留中文
    const joined = [message, ...suggestion].join(' ')
    expect(/[\u4e00-\u9fa5]/.test(joined)).toBe(false)
  })

  it.each(BACKEND_ERROR_TYPES)('%s 的英文输出不含中文', (type) => {
    void i18n.changeLanguage('en-US')

    const { message, suggestion } = localizeRequestError({ errorType: type })
    const joined = [message, ...suggestion].join(' ')

    expect(/[\u4e00-\u9fa5]/.test(joined), `${type}: ${joined}`).toBe(false)
  })
})

describe('后端额外字段的兜底', () => {
  it('未知 errorType 用后端原文兜底，不显示 key', () => {
    void i18n.changeLanguage('en-US')

    const { message, suggestion } = localizeRequestError({
      errorType: 'brand_new_type_from_future_backend',
      errorMessage: 'Some future backend message',
      suggestion: 'line one\nline two',
    })

    expect(message).toBe('Some future backend message')
    expect(suggestion).toEqual(['line one', 'line two'])
  })

  it('未知 errorType 且后端无文案时回落到 unknown 文案', () => {
    void i18n.changeLanguage('zh-CN')

    expect(localizeRequestError({ errorType: 'nope' }).message).toBe(zhCN.api.run.networkError.unknown.message)
  })

  it('后端仍给出建议时，语言包优先（避免语言混杂）', () => {
    void i18n.changeLanguage('en-US')

    const { suggestion } = localizeRequestError({
      errorType: 'connection_failed',
      suggestion: '后端旧版中文建议',
    })

    expect(suggestion[0]).toBe(enUS.api.run.networkError.connection_failed.suggestion[0])
  })
})
