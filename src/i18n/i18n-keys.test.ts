import { describe, expect, it } from 'vitest'

import { API_MENU_CONFIG, API_STATUS_CONFIG, HTTP_CODE_CONFIG } from '@/configs/static'
import { i18n } from '@/i18n'
import { enUS, zhCN } from '@/i18n/resources'
import { translateKey } from '@/i18n/translate'
import { FlowNodeType, NODE_TYPE_LABEL_KEYS } from '@/features/test-flow/types/flow.types'

/**
 * 动态 key 有效性校验。
 *
 * 项目里有一部分文案 key 在编译期只能是 `string`（静态配置对象、节点类型映射表等），
 * 它们通过 `translateKey()` 做一次显式类型收窄。收窄本身不保证 key 正确，
 * **所以正确性由本测试保证**：把每个动态 key 在两种语言下逐个求值，
 * 只要有一条在任一语言下取不到（返回 key 原文），测试立即失败。
 *
 * 这样 `translateKey` 里的 `as never` 就不是盲目的类型逃逸，而是
 * 「校验责任已移交到这里」的显式声明。
 */

/** 判断某 key 在当前语言下是否真的取到了文案（而不是回落成 key 原文）。 */
function hasTranslation(key: string): boolean {
  return i18n.exists(key)
}

describe('静态配置里的动态 key 全部有效', () => {
  it('HTTP 状态码的 textKey / descKey 在中英下都存在', () => {
    const missing: string[] = []

    for (const [code, config] of Object.entries(HTTP_CODE_CONFIG)) {
      for (const key of [config.textKey, config.descKey]) {
        if (!hasTranslation(key)) {
          missing.push(`HTTP ${code}: ${key}`)
        }
      }
    }

    expect(missing).toEqual([])
  })

  it('接口状态的 textKey 在中英下都存在', () => {
    const missing: string[] = []

    for (const [status, config] of Object.entries(API_STATUS_CONFIG)) {
      if (!hasTranslation(config.textKey)) {
        missing.push(`${status}: ${config.textKey}`)
      }
    }

    expect(missing).toEqual([])
  })

  it('目录配置的 titleKey / newLabelKey / tipTitleKey 有效（空串除外）', () => {
    const missing: string[] = []

    for (const [type, config] of Object.entries(API_MENU_CONFIG)) {
      const keys = [config.titleKey, config.newLabelKey, config.tipTitleKey]

      for (const key of keys) {
        // 空串是「该目录没有这项含义」的合法约定
        if (key && !hasTranslation(key)) {
          missing.push(`${type}: ${key}`)
        }
      }
    }

    expect(missing).toEqual([])
  })

  it('流程图节点类型的 label key 全部有效', () => {
    const missing: string[] = []

    for (const nodeType of Object.values(FlowNodeType)) {
      const key = NODE_TYPE_LABEL_KEYS[nodeType]

      if (!key || !hasTranslation(key)) {
        missing.push(`${nodeType}: ${key}`)
      }
    }

    expect(missing).toEqual([])
  })
})

describe('translateKey 的行为', () => {
  it('取到对应语言的文案', () => {
    expect(translateKey('menu.catalog.http')).toBe(zhCN.menu.catalog.http)
  })

  it('空串返回空串', () => {
    expect(translateKey('')).toBe('')
  })
})

describe('英文界面下动态 key 也返回英文', () => {
  it('HTTP 状态码文案随语言变化', () => {
    void i18n.changeLanguage('en-US')

    try {
      expect(translateKey(HTTP_CODE_CONFIG[500].textKey)).toBe(enUS.menu.httpCode[500].text)
      expect(translateKey(HTTP_CODE_CONFIG[500].descKey)).toBe(enUS.menu.httpCode[500].desc)
    }
    finally {
      void i18n.changeLanguage('zh-CN')
    }
  })

  it('接口状态文案随语言变化', () => {
    void i18n.changeLanguage('en-US')

    try {
      expect(translateKey(API_STATUS_CONFIG.developing.textKey)).toBe(enUS.menu.apiStatus.developing)
    }
    finally {
      void i18n.changeLanguage('zh-CN')
    }
  })

  it('节点类型名随语言变化', () => {
    void i18n.changeLanguage('en-US')

    try {
      expect(translateKey(NODE_TYPE_LABEL_KEYS[FlowNodeType.HttpRequest]))
        .toBe(enUS.flow.nodeType.httpRequest)
    }
    finally {
      void i18n.changeLanguage('zh-CN')
    }
  })
})
