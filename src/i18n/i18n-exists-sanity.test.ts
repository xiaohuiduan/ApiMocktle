import { describe, expect, it } from 'vitest'

import { i18n } from '@/i18n'

/**
 * 反向验证「动态 key 校验」这道安全网本身有效。
 *
 * 若 `i18n.exists()` 对任何输入都返回 true，那 i18n-keys.test.ts 就是假绿。
 * 这里用必然不存在的 key 做反证。
 */
describe('exists 判定的可靠性（反证）', () => {
  it('对不存在的中文/英文 key 都返回 false', () => {
    expect(i18n.exists('menu.thisKeyDoesNotExist')).toBe(false)
    expect(i18n.exists('totally.bogus.path')).toBe(false)
    expect(i18n.exists('api.response.notARealKey')).toBe(false)
  })

  it('对真实存在的 key 返回 true', () => {
    expect(i18n.exists('menu.catalog.http')).toBe(true)
    expect(i18n.exists('common.save')).toBe(true)
  })

  it('中英两种语言下判定一致', () => {
    void i18n.changeLanguage('en-US')

    try {
      expect(i18n.exists('menu.catalog.http')).toBe(true)
      expect(i18n.exists('menu.thisKeyDoesNotExist')).toBe(false)
    }
    finally {
      void i18n.changeLanguage('zh-CN')
    }
  })
})
