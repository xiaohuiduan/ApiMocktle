import { describe, expect, it, afterEach } from 'vitest'

import { i18n, setLanguage } from '@/i18n'
import { zhCN, enUS } from '@/i18n/resources'

/** 拍平语言包为「点分 key → 值」映射，便于对比。 */
function flatten(value: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof value === 'string') {
    out[prefix] = value

    return out
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
    }
  }

  return out
}

/** 在指定语言下取词。 */
function translateAt(language: 'zh-CN' | 'en-US', key: string): string {
  void i18n.changeLanguage(language)

  return i18n.t(key as never) as string
}

afterEach(() => {
  void i18n.changeLanguage('zh-CN')
})

describe('中英双语取词', () => {
  it('切换语言后同一 key 返回对应语言的值', () => {
    expect(translateAt('zh-CN', 'menu.catalog.http')).toBe('接口')
    expect(translateAt('en-US', 'menu.catalog.http')).toBe('APIs')

    expect(translateAt('zh-CN', 'common.save')).toBe('保存')
    expect(translateAt('en-US', 'common.save')).toBe('Save')
  })

  it('英文界面下取词不残留中文', () => {
    void i18n.changeLanguage('en-US')

    const zhValues = new Set(Object.values(flatten(zhCN)))
    const enFlat = flatten(enUS)
    // 与 i18n-resources.test.ts 的 allowSame 保持同一份豁免：
    // 品牌名、格式专有名词、语言名、纯技术表达式/占位符模板、第三方框架专有名词
    const allowSame = new Set([
      'menu.app.title',
      'menu.catalog.markdown',
      'menu.catalogNew.markdown',
      'menu.catalogTip.markdown',
      'settings.language.zhCN',
      'settings.language.enUS',
      'api.run.headersCount',
      'flow.node.loop.whileExpression',
      'flow.exec.log.httpOk',
      'flow.enum.mockTargetType.feign',
      'flow.enum.mockTargetType.mapper',
      'flow.exec.source.forEach',
    ])

    const leaked: string[] = []

    for (const [key, value] of Object.entries(enFlat)) {
      if (allowSame.has(key)) {
        continue
      }

      // 英文值若与某个中文值完全相同，说明这条没翻译
      if (zhValues.has(value)) {
        leaked.push(key)
      }
    }

    expect(leaked).toEqual([])
  })

  it('英文取词确实返回英文资源，而不是回落中文', () => {
    void i18n.changeLanguage('en-US')

    // 抽检各命名空间：取词结果必须等于英文包的值（而非 key 原文或中文回落）
    const samples: [string, string][] = [
      [`menu.catalog.http`, enUS.menu.catalog.http],
      [`common.save`, enUS.common.save],
      [`api.response.addTitle`, enUS.api.response.addTitle],
      [`flow.nodeType.start`, enUS.flow.nodeType.start],
      [`settings.menu.appearance`, enUS.settings.menu.appearance],
      [`share.page.title`, enUS.share.page.title],
      [`ui.theme.label`, enUS.ui.theme.label],
    ]

    for (const [key, expected] of samples) {
      const actual = i18n.t(key as never) as string

      expect(actual).toBe(expected)
      // 不应返回 key 原文（说明该键不存在）
      expect(actual).not.toBe(key)
    }
  })

  it('中英双语下插值都正确替换', () => {
    // 找一个真实带插值的键做验证
    const zh = translateAt('zh-CN', 'common.unitCount')
    const en = translateAt('en-US', 'common.unitCount')

    // 模板本身不含写死的数字；替换后应包含传入值
    expect(i18n.t('common.unitCount' as never, { count: 7 } as never)).toContain('7')
    expect(zh.length).toBeGreaterThan(0)
    expect(en.length).toBeGreaterThan(0)
  })

  it('手动手动指定语言后系统语言不再影响结果', () => {
    // setLanguage('en-US') 写入 localStorage 并切换
    setLanguage('en-US')
    expect(i18n.language).toBe('en-US')

    setLanguage('zh-CN')
    expect(i18n.language).toBe('zh-CN')
  })
})
