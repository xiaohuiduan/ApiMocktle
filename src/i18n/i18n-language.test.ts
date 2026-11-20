import { beforeEach, describe, expect, it, vi } from 'vitest'

import { detectSystemLanguage, normalizeLanguage } from './detector'
import {
  LANGUAGE_STORAGE_KEY,
  readLanguageSetting,
  resolveLanguage,
  writeLanguageSetting,
} from './storage'

/** 构造一个只有语言字段的 navigator 替身。 */
function fakeNav(languages: readonly string[]): Pick<Navigator, 'language' | 'languages'> {
  return { language: languages[0] ?? '', languages }
}

describe('normalizeLanguage', () => {
  it('中文各变体归并为 zh-CN', () => {
    expect(normalizeLanguage('zh')).toBe('zh-CN')
    expect(normalizeLanguage('zh-CN')).toBe('zh-CN')
    expect(normalizeLanguage('zh-Hans-CN')).toBe('zh-CN')
    expect(normalizeLanguage('zh-TW')).toBe('zh-CN')
    expect(normalizeLanguage('zh-Hant')).toBe('zh-CN')
  })

  it('英文各变体归并为 en-US', () => {
    expect(normalizeLanguage('en')).toBe('en-US')
    expect(normalizeLanguage('en-US')).toBe('en-US')
    expect(normalizeLanguage('en-GB')).toBe('en-US')
    expect(normalizeLanguage('en-AU')).toBe('en-US')
  })

  it('大小写不敏感', () => {
    expect(normalizeLanguage('ZH-cn')).toBe('zh-CN')
    expect(normalizeLanguage('EN-us')).toBe('en-US')
  })

  it('未知语言与空值一律回落中文', () => {
    expect(normalizeLanguage('ja-JP')).toBe('zh-CN')
    expect(normalizeLanguage('de')).toBe('zh-CN')
    expect(normalizeLanguage('')).toBe('zh-CN')
    expect(normalizeLanguage(undefined)).toBe('zh-CN')
    expect(normalizeLanguage(null)).toBe('zh-CN')
  })
})

describe('detectSystemLanguage', () => {
  it('按 languages 顺序取首个受支持语言', () => {
    expect(detectSystemLanguage(fakeNav(['en-GB', 'zh-CN']))).toBe('en-US')
    expect(detectSystemLanguage(fakeNav(['zh-TW', 'en-US']))).toBe('zh-CN')
  })

  it('跳过不受支持的语言，继续匹配后续候选', () => {
    expect(detectSystemLanguage(fakeNav(['ja-JP', 'en-US']))).toBe('en-US')
    expect(detectSystemLanguage(fakeNav(['de-DE', 'zh-CN']))).toBe('zh-CN')
  })

  it('全部不受支持时回落中文', () => {
    expect(detectSystemLanguage(fakeNav(['ja-JP', 'ko-KR']))).toBe('zh-CN')
  })

  it('languages 为空时用 language 兜底', () => {
    expect(detectSystemLanguage({ language: 'en-US', languages: [] })).toBe('en-US')
    expect(detectSystemLanguage({ language: 'zh-CN', languages: [] })).toBe('zh-CN')
  })

  it('探测失败时软失败回落中文，不抛错', () => {
    const throwing = {
      get language(): string {
        throw new Error('boom')
      },
      get languages(): readonly string[] {
        throw new Error('boom')
      },
    } as unknown as Pick<Navigator, 'language' | 'languages'>

    expect(detectSystemLanguage(throwing)).toBe('zh-CN')
    expect(detectSystemLanguage(undefined)).toBe('zh-CN')
  })
})

describe('语言设置持久化', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('无记录时默认跟随系统', () => {
    expect(readLanguageSetting()).toBe('system')
  })

  it('写入后可读回', () => {
    writeLanguageSetting('en-US')
    expect(readLanguageSetting()).toBe('en-US')

    writeLanguageSetting('zh-CN')
    expect(readLanguageSetting()).toBe('zh-CN')

    writeLanguageSetting('system')
    expect(readLanguageSetting()).toBe('system')
  })

  it('脏数据回退为跟随系统，不让启动路径瘫痪', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'klingon')
    expect(readLanguageSetting()).toBe('system')

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, '')
    expect(readLanguageSetting()).toBe('system')
  })

  it('localStorage 抛错时静默降级', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('quota')
    })

    expect(readLanguageSetting()).toBe('system')

    spy.mockRestore()
  })
})

describe('resolveLanguage', () => {
  it('system 模式用探测结果', () => {
    expect(resolveLanguage('system', 'en-US')).toBe('en-US')
    expect(resolveLanguage('system', 'zh-CN')).toBe('zh-CN')
  })

  it('手动模式忽略探测结果', () => {
    expect(resolveLanguage('en-US', 'zh-CN')).toBe('en-US')
    expect(resolveLanguage('zh-CN', 'en-US')).toBe('zh-CN')
  })
})
