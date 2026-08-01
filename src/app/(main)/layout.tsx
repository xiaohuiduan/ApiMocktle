'use client'

import { useMemo } from 'react'
import { Outlet } from 'react-router'

import { theme } from 'antd'

import { SideNav } from '@/app/(main)/components/SideNav'
import { useThemeContext } from '@/components/ThemeEditor/ThemeContext'
import { LayoutProvider } from '@/contexts/layout-settings'
import { MenuTabProvider } from '@/contexts/menu-tab-settings'
import { useCssVariable } from '@/hooks/useCssVariable'
import { useDesignStyle } from '@/hooks/useDesignStyle'

export default function MainLayout() {
  const { token } = theme.useToken()

  const cssVar = useCssVariable()
  const { isGlassStyle } = useDesignStyle()
  const { isDarkMode } = useThemeContext()

  // 玻璃风格：彩色光晕径向渐变背景，为半透明面板提供可模糊的可见素材，使磨砂玻璃质感真正成立
  const glassGradient = useMemo(() => {
    if (!isGlassStyle) { return undefined }

    return isDarkMode
      ? 'radial-gradient(45% 55% at 80% 12%, rgba(99,102,241,0.28), transparent 70%), radial-gradient(40% 50% at 12% 85%, rgba(16,185,129,0.22), transparent 70%), radial-gradient(42% 48% at 55% 50%, rgba(236,72,153,0.16), transparent 72%), linear-gradient(160deg, #15171c, #1d2026)'
      : 'radial-gradient(45% 55% at 80% 12%, rgba(99,102,241,0.30), transparent 70%), radial-gradient(40% 50% at 12% 85%, rgba(236,72,153,0.22), transparent 70%), radial-gradient(42% 48% at 55% 50%, rgba(16,185,129,0.20), transparent 72%), linear-gradient(160deg, #eef2ff, #f7f3ff)'
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
