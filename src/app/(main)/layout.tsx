'use client'

import { theme } from 'antd'
import { Outlet } from 'react-router'

import { SideNav } from '@/app/(main)/components/SideNav'
import { LayoutProvider } from '@/contexts/layout-settings'
import { MenuTabProvider } from '@/contexts/menu-tab-settings'
import { useCssVariable } from '@/hooks/useCssVariable'

export default function MainLayout() {
  const { token } = theme.useToken()

  const cssVar = useCssVariable()

  return (
    <MenuTabProvider>
      <div className="flex h-full" style={{ backgroundColor: token.colorFillTertiary, ...cssVar }}>
        <SideNav />

        <div className="flex h-full flex-1 flex-col overflow-hidden pb-main pr-main">
          <div
            className="relative flex-1 overflow-y-auto border border-solid"
            style={{
              borderColor: token.colorFillSecondary,
              backgroundColor: token.colorBgContainer,
              borderRadius: 10,
            }}
          >
            <LayoutProvider>
              <Outlet />
            </LayoutProvider>
          </div>
        </div>
      </div>
    </MenuTabProvider>
  )
}
