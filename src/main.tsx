import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes } from 'react-router'

import { loader } from '@monaco-editor/react'

import { AuthProvider } from '@/contexts/auth'
import { ProjectTabsProvider } from '@/contexts/project-tabs'
import { ProxyConfigProvider } from '@/contexts/proxy-config'
import { SessionVariablesProvider } from '@/contexts/session-variables'
import { ensureAnchorExternalLinkHandler } from '@/utils/anchor-external-link'

import { appRoutes } from './routes'

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

import '@/styles/globals.css'

// Markdown 预览里的外链交给系统浏览器：bytemd Viewer 只拦 `#` 锚点，
// 其余链接会让 WebView 整体导航到外站，而主窗口没有后退按钮
ensureAnchorExternalLinkHandler()

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
  </StrictMode>,
)
