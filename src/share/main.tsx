import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'

import { ThemeProviderClient } from '@/components/ThemeEditor'
import { i18n, initI18n, onLanguageChange, syncDayjs, syncDocument, t } from '@/i18n'

import { ShareApp } from './ShareApp'

import '@/styles/globals.css'

// 分享页是局域网访客用浏览器打开的独立入口：没有 Tauri IPC，也读不到分享者的
// 本地偏好，因此只能跟随访客自己的浏览器语言。语言同样要在首帧前确定。
initI18n({ mode: 'system' })
onLanguageChange((language) => {
  syncDocument(language, { isShare: true, shareTitle: () => t('share.page.title') })
  syncDayjs(language)
})

// 分享页跟随主应用主题（同域共享 localStorage 设置；独立域时自动使用默认主题）。
// ThemeProviderClient 内部已提供 ConfigProvider（含 locale 跟随语言）与 antd <App>，
// 此处不再叠加一层 ConfigProvider，避免 locale 与主题配置出现两个来源。
createRoot(document.getElementById('root')!).render(
  <I18nextProvider i18n={i18n}>
    <ThemeProviderClient autoSaveId="theme:persistence">
      <ShareApp />
    </ThemeProviderClient>
  </I18nextProvider>,
)
