import { useSyncExternalStore } from 'react'

import { getAntdLocale } from './antd-locale'
import { normalizeLanguage } from './detector'
import { i18n, type ResolvedLanguage } from './index'

/**
 * 订阅当前语言。
 *
 * 用 `useSyncExternalStore` 直接订阅 i18next 的 `languageChanged` 事件，
 * 而不是走 `useTranslation()`：这样不依赖组件树里是否存在 `I18nextProvider`，
 * 也能保证语言变化时必定重渲染（分享页与主应用两套树都适用）。
 */
export function useLanguage(): ResolvedLanguage {
  const subscribe = (onChange: () => void) => {
    i18n.on('languageChanged', onChange)

    return () => {
      i18n.off('languageChanged', onChange)
    }
  }

  const getSnapshot = () => normalizeLanguage(i18n.language)

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** 订阅当前语言并返回对应的 antd locale。 */
export function useAntdLocale() {
  return getAntdLocale(useLanguage())
}
