import { useTranslation } from 'react-i18next'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { t } from '@/i18n'

/**
 * 回归防线：组件测试全部裸 `render()`（不包任何 Provider）。
 *
 * 这里专门验证 `useTranslation()` 在没有 <I18nextProvider> 时也能工作——
 * 它依赖 `initI18n()` 里注册的 `initReactI18next`。若该注册丢失，
 * `t()` 会返回 key 原文，项目里 52 行中文文案断言会集体失败。
 */
function Probe() {
  const { t: hookT } = useTranslation()

  return (
    <div>
      <span data-testid="hook">{hookT('menu.catalog.http')}</span>
      <span data-testid="singleton">{t('menu.catalog.http')}</span>
    </div>
  )
}

describe('无 Provider 下的取词', () => {
  it('useTranslation 在无 I18nextProvider 时仍返回中文而非 key', () => {
    render(<Probe />)

    // 中文界面下目录标题应为「接口」，而不是 key 原文 'menu.catalog.http'
    expect(screen.getByTestId('hook').textContent).toBe('接口')
    expect(screen.getByTestId('hook').textContent).not.toContain('menu.catalog')
  })

  it('单例 t() 与 hook 取词结果一致', () => {
    render(<Probe />)

    expect(screen.getByTestId('singleton').textContent).toBe(
      screen.getByTestId('hook').textContent,
    )
  })
})
