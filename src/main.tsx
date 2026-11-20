import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { HashRouter, Routes } from 'react-router'

import { loader } from '@monaco-editor/react'

import { AuthProvider } from '@/contexts/auth'
import { ProjectTabsProvider } from '@/contexts/project-tabs'
import { ProxyConfigProvider } from '@/contexts/proxy-config'
import { SessionVariablesProvider } from '@/contexts/session-variables'
import { i18n, initI18n, onLanguageChange, syncDayjs, syncDocument } from '@/i18n'

// 语言必须在首次渲染前同步确定：resources 已打进内存，init 后立即可 t()，
// 因此不会出现「先中文闪一下再切英文」。
initI18n()
onLanguageChange((language) => {
  syncDocument(language)
  syncDayjs(language)
})

// Monaco Editor 本地加载（离线可用）
loader.config({ paths: { vs: '/monaco-editor/vs' } })

// JSON 编辑器允许注释（JSONC），发送请求前会自动剥离
void loader.init().then((monaco) => {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    comments: 'ignore',
    trailingCommas: 'error',
  })
})

import { appRoutes } from './routes'

import '@/styles/globals.css'

// 桌面应用：阻止浏览器默认右键菜单（刷新/另存为等），
// 但放行文本输入区（接口路径、Body 编辑器等高频粘贴/撤销场景）
document.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement | null

  if (target?.closest('input, textarea, [contenteditable="true"], [contenteditable=""], .monaco-editor')) {
    return
  }

  e.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <HashRouter>
        <AuthProvider>
          <ProxyConfigProvider>
            <ProjectTabsProvider>
              <SessionVariablesProvider>
                <Routes>
                  {appRoutes}
                </Routes>
              </SessionVariablesProvider>
            </ProjectTabsProvider>
          </ProxyConfigProvider>
        </AuthProvider>
      </HashRouter>
    </I18nextProvider>
  </StrictMode>,
)
