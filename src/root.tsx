import { Outlet, useLocation } from 'react-router'

import { ProjectTabBar } from '@/components/ProjectTabBar'
import { ThemeProviderClient } from '@/components/ThemeEditor'
import { GlobalContextProvider } from '@/contexts/global'

export default function Root() {
  const { pathname } = useLocation()
  const showProjectBar = pathname.startsWith('/projects')

  return (
    <ThemeProviderClient autoSaveId="theme:persistence">
      <main className="flex h-full flex-col">
        <GlobalContextProvider>
          {showProjectBar && <ProjectTabBar />}
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
        </GlobalContextProvider>
      </main>
    </ThemeProviderClient>
  )
}
