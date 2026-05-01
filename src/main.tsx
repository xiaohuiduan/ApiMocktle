import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes } from 'react-router'

import { AuthProvider } from '@/contexts/auth'

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
