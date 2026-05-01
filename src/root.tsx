import { Outlet } from 'react-router'

import { ThemeProviderClient } from '@/components/ThemeEditor'
import { GlobalContextProvider } from '@/contexts/global'

export default function Root() {
  return (
    <ThemeProviderClient autoSaveId="theme:persistence">
      <main className="h-full">
        <GlobalContextProvider>
          <Outlet />
        </GlobalContextProvider>
      </main>
    </ThemeProviderClient>
  )
}
