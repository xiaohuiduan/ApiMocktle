import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes } from 'react-router'

import { loader } from '@monaco-editor/react'

import { AuthProvider } from '@/contexts/auth'
import { ProxyConfigProvider } from '@/contexts/proxy-config'

// Monaco Editor 本地加载（离线可用）
loader.config({ paths: { vs: '/monaco-editor/vs' } })

import { appRoutes } from './routes'

import '@/styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <ProxyConfigProvider>
          <Routes>
            {appRoutes}
          </Routes>
        </ProxyConfigProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
