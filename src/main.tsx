import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes } from 'react-router'

import { loader } from '@monaco-editor/react'

import { AuthProvider } from '@/contexts/auth'

// Monaco Editor 本地加载（离线可用）
loader.config({ paths: { vs: '/monaco-editor/vs' } })

import { appRoutes } from './routes'

import '@/styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <Routes>
          {appRoutes}
        </Routes>
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
