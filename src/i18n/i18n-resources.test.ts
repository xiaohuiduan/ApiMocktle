import { describe, expect, it } from 'vitest'

import { enUS, zhCN } from '@/i18n/resources'

/** 把嵌套语言包拍平成点分 key 列表，用于比对两种语言的键集合。 */
function flattenKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') {
    return [prefix]
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('i18n 语言包', () => {
  it('中英语言包的键集合完全一致', () => {
    const zhKeys = flattenKeys(zhCN).sort()
    const enKeys = flattenKeys(enUS).sort()

    expect(enKeys).toEqual(zhKeys)
  })

  it('所有文案值都是非空字符串', () => {
    const emptyValues: string[] = []

    const walk = (value: unknown, path: string) => {
      if (typeof value === 'string') {
        if (!value.trim()) {
          emptyValues.push(path)
        }

        return
      }

      if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          walk(child, path ? `${path}.${key}` : key)
        }
      }
    }

    walk(zhCN, '')
    walk(enUS, '')

    expect(emptyValues).toEqual([])
  })

  it('同一 key 的中英文案不应完全相同（除专有名词与语言自称）', () => {
    // 这些值在两种语言下天然相同，不视为未翻译
    const allowSame = new Set([
      // 品牌名与格式专有名词
      'menu.app.title',
      'menu.catalog.markdown',
      'menu.catalogNew.markdown',
      'menu.catalogTip.markdown',
      // 语言名用本语言书写，固定不译
      'settings.language.zhCN',
      'settings.language.enUS',
      // 纯技术表达式 / 占位符模板：只有 {{}} 变量与协议关键字，两种语言写法相同
      'api.run.headersCount', // '{{label}} ({{count}})'
      'flow.node.loop.whileExpression', // 'while: {{expression}}'
      'flow.exec.log.httpOk', // 'HTTP {{status}} ({{duration}}ms)'
      // 第三方框架专有名词，官方名称不翻译
      'flow.enum.mockTargetType.feign', // 'Feign Client'
      'flow.enum.mockTargetType.mapper', // 'MyBatis Mapper'
      // 编程概念符咒：forEach 的语义在两种语言下都用同一组标识符表达
      'flow.exec.source.forEach',
    ])

    const same: string[] = []

    const walk = (zh: unknown, en: unknown, path: string) => {
      if (typeof zh === 'string' && typeof en === 'string') {
        if (zh === en && !allowSame.has(path)) {
          same.push(path)
        }

        return
      }

      if (zh && en && typeof zh === 'object' && typeof en === 'object') {
        for (const key of Object.keys(zh as Record<string, unknown>)) {
          walk(
            (zh as Record<string, unknown>)[key],
            (en as Record<string, unknown>)[key],
            path ? `${path}.${key}` : key,
          )
        }
      }
    }

    walk(zhCN, enUS, '')

    expect(same).toEqual([])
  })
})
