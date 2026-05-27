'use client'

import { useMemo } from 'react'

import { theme } from 'antd'
import { Outlet } from 'react-router'

import { SideNav } from '@/app/(main)/components/SideNav'
import { SessionVariablesPanel } from '@/components/SessionVariablesPanel'
import { LayoutProvider } from '@/contexts/layout-settings'
import { MenuTabProvider } from '@/contexts/menu-tab-settings'
import { useCssVariable } from '@/hooks/useCssVariable'
import { useDesignStyle } from '@/hooks/useDesignStyle'
import { useThemeContext } from '@/components/ThemeEditor/ThemeContext'

export default function MainLayout() {
  const { token } = theme.useToken()

  const cssVar = useCssVariable()
  const { isGlassStyle } = useDesignStyle()
  const { isDarkMode } = useThemeContext()

  // 玻璃风格：中性灰调渐变背景，衬托透明折射效果
  const glassGradient = useMemo(() => {
    if (!isGlassStyle) return undefined
    return isDarkMode
      ? 'linear-gradient(180deg, #1a1d23 0%, #22252b 40%, #1e2128 100%)'
      : 'linear-gradient(180deg, #f0f2f5 0%, #e8eaed 40%, #f5f5f7 100%)'
  }, [isGlassStyle, isDarkMode])

  return (
    <MenuTabProvider>
      <div
        className="flex h-full"
        style={{
          background: glassGradient ?? token.colorFillTertiary,
          ...cssVar,
        }}
      >
        <SideNav />

        <SessionVariablesPanel />

        <div className="flex h-full flex-1 flex-col overflow-hidden pb-main pr-main">
          <div
            className="relative flex-1 overflow-y-auto"
            style={{
              border: isGlassStyle ? 'var(--ds-border)' : `1px solid ${token.colorFillSecondary}`,
              backgroundColor: isGlassStyle ? 'var(--ds-bg-surface)' : token.colorBgContainer,
              backdropFilter: isGlassStyle ? 'blur(var(--ds-blur))' : undefined,
              WebkitBackdropFilter: isGlassStyle ? 'blur(var(--ds-blur))' : undefined,
              borderRadius: 10,
              boxShadow: isGlassStyle ? 'var(--ds-shadow-md)' : undefined,
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
