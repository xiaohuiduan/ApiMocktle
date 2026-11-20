import type { ResolvedLanguage } from './detector'

/** 主应用标题。产品名不翻译，但 `html lang` 必须跟随语言。 */
const APP_TITLE = 'ApiMocktle'

interface SyncDocumentOptions {
  /** 是否为分享页（分享页的 title 需翻译）。 */
  isShare?: boolean
  /** 分享页标题取词函数，避免此模块直接依赖 i18n 造成循环引用。 */
  shareTitle?: () => string
}

/**
 * 同步文档元信息。
 *
 * `<html lang>` 影响辅助技术与分享页的 SEO/朗读语言，必须随语言切换更新；
 * 分享页的 `<title>` 是面向访客的可见文案，需要翻译。
 */
export function syncDocument(language: ResolvedLanguage, options: SyncDocumentOptions = {}): void {
  document.documentElement.lang = language

  if (options.isShare) {
    const title = options.shareTitle?.()

    if (title) {
      document.title = title
    }

    return
  }

  document.title = APP_TITLE
}
