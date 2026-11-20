import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * 语言包规模与覆盖度快照。
 *
 * 目的不是断言「翻译质量」，而是把迁移成果固化成可度量的基线：
 * 若某次改动意外删掉一整组 key，或某个命名空间没被迁移，这里会立刻暴露。
 */
const LOCALES_DIR = join(process.cwd(), 'src/i18n/locales')

function countLeafStrings(language: 'zh-CN' | 'en-US', domain: string): number {
  // 直接读源码文本统计中文字符/英文条目，避免依赖运行时资源结构
  const source = readFileSync(join(LOCALES_DIR, language, `${domain}.ts`), 'utf-8')
  // 统计形如 key: 'value' 的条目数
  return (source.match(/^\s+\w+:\s*'/gm) ?? []).length
}

describe('语言包覆盖度基线', () => {
  const domains = ['common', 'menu', 'api', 'flow', 'settings', 'share', 'app', 'ui'] as const

  it.each(domains)('%s 命名空间在两种语言下条目数一致', (domain) => {
    const zh = countLeafStrings('zh-CN', domain)
    const en = countLeafStrings('en-US', domain)

    expect(zh).toBeGreaterThan(0)
    expect(en).toBe(zh)
  })

  it('全部命名空间合计超过 1000 条文案', () => {
    const total = domains.reduce((sum, domain) => sum + countLeafStrings('zh-CN', domain), 0)

    // 迁移前前端约 1,370 条含中文字符串，扣除协议常量/注释/测试后应在此量级
    expect(total).toBeGreaterThan(1000)
  })

  it('英文语言包不含中日韩字符（语言名与注释除外）', () => {
    const offenders: string[] = []

    for (const domain of domains) {
      const source = readFileSync(join(LOCALES_DIR, 'en-US', `${domain}.ts`), 'utf-8')

      for (const [index, line] of source.split('\n').entries()) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) {
          continue // 注释
        }

        // 语言名按惯例用本语言书写，允许出现「中文」
        const withoutLanguageName = line.replace(/'中文'/g, '')

        if (/[\u4e00-\u9fa5]/.test(withoutLanguageName)) {
          offenders.push(`en-US/${domain}.ts:${index + 1}: ${line.trim()}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
