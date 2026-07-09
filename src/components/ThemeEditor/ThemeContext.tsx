import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { setTwoToneColor } from '@ant-design/icons'
import { ConfigProvider, theme } from 'antd'
import type { ThemeConfig } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import { designStylePresets, presetThemes } from './theme-data'
import { restoreThemeSetting } from './ThemeEditor.helper'
import type { DesignStyle, ThemeSetting } from './ThemeEditor.type'

const { defaultAlgorithm, darkAlgorithm } = theme

/**
 * 根据设计风格构建 antd 组件 token 覆盖。
 * 这些覆盖会让所有 antd 组件自动遵循所选风格。
 */
function getDesignStyleComponents(
  designStyle: DesignStyle,
  isDark: boolean,
): ThemeConfig['components'] {
  if (designStyle === 'default') return undefined

  // 玻璃风格
  if (designStyle === 'glassmorphism') {
    const bg = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.24)'
    const bgElevated = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.36)'
    const border = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.32)'
    const bgHover = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.3)'
    const bgActive = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.4)'

    return {
      Button: {
        defaultBg: bg,
        defaultBorderColor: border,
        defaultHoverBg: bgHover,
        defaultActiveBg: bgActive,
      },
      Input: {
        colorBgContainer: bg,
        colorBorder: border,
        hoverBorderColor: border,
        activeBorderColor: border,
      },
      Select: {
        colorBgContainer: bg,
        colorBorder: border,
        optionSelectedBg: bgHover,
      },
      Table: {
        colorBgContainer: 'transparent',
        headerBg: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.06)',
        rowHoverBg: bgHover,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.12)',
      },
      Card: {
        colorBgContainer: bg,
        colorBorderSecondary: border,
      },
      Modal: {
        contentBg: bgElevated,
        headerBg: bg,
        colorBgMask: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.25)',
      },
      Drawer: {
        colorBgElevated: isDark ? 'rgba(30, 33, 40, 0.95)' : 'rgba(255, 255, 255, 0.92)',
      },
      Dropdown: {
        colorBgElevated: bgElevated,
      },
      Tooltip: {
        colorBgSpotlight: bgElevated,
      },
      Tag: {
        colorBgContainer: bg,
      },
      Tabs: {
        colorBgContainer: 'transparent',
      },
      Menu: {
        colorBgContainer: 'transparent',
        colorItemBg: 'transparent',
        colorItemBgHover: bgHover,
        colorItemBgSelected: bgActive,
      },
      Tree: {
        colorBgContainer: 'transparent',
      },
      Collapse: {
        colorBgContainer: 'transparent',
        colorBorder: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.15)',
      },
      Switch: {
        colorPrimary: isDark ? 'rgba(99, 102, 241, 0.6)' : 'rgba(99, 102, 241, 0.5)',
      },
    }
  }

  // 新拟态
  if (designStyle === 'neumorphism') {
    const neuBg = isDark ? '#2d3436' : '#e0e5ec'
    const neuBorder = 'transparent'
    const neuShadow = isDark
      ? '3px 3px 6px #1a1d1e, -3px -3px 6px #404b4e'
      : '3px 3px 6px #b8bec7, -3px -3px 6px #ffffff'
    const neuShadowSm = isDark
      ? '2px 2px 4px #1a1d1e, -2px -2px 4px #404b4e'
      : '2px 2px 4px #b8bec7, -2px -2px 4px #ffffff'

    return {
      Button: {
        defaultBg: neuBg,
        defaultBorderColor: neuBorder,
        defaultShadow: neuShadowSm,
        primaryShadow: neuShadowSm,
      },
      Input: {
        colorBgContainer: neuBg,
        colorBorder: neuBorder,
        activeBorderColor: neuBorder,
        hoverBorderColor: neuBorder,
      },
      Select: {
        colorBgContainer: neuBg,
        colorBorder: neuBorder,
      },
      Table: {
        colorBgContainer: neuBg,
        colorBorderSecondary: neuBorder,
        headerBg: isDark ? '#252a2c' : '#d8dde4',
      },
      Card: {
        colorBgContainer: neuBg,
        colorBorderSecondary: neuBorder,
      },
      Modal: {
        contentBg: neuBg,
      },
      Dropdown: {
        colorBgElevated: neuBg,
      },
      Tooltip: {
        colorBgSpotlight: neuBg,
      },
      Tag: {
        colorBgContainer: neuBg,
      },
      Menu: {
        colorBgContainer: 'transparent',
        colorItemBg: 'transparent',
      },
      Tree: {
        colorBgContainer: 'transparent',
      },
      Drawer: {
        colorBgElevated: neuBg,
      },
      Collapse: {
        colorBgContainer: 'transparent',
        colorBorder: 'transparent',
      },
      Switch: {
        colorPrimary: isDark ? '#5b8fa8' : '#5b8fa8',
      },
    }
  }

  // 拟物化
  if (designStyle === 'skeuomorphism') {
    const skeuoBg = isDark ? '#2a2520' : '#f5f0eb'
    const skeuoBgLight = isDark ? '#332e28' : '#faf8f5'
    const skeuoBorder = isDark ? '1px solid #4a4035' : '1px solid #c8bfb4'
    const skeuoShadow =
      '0 1px 3px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.5) inset'
    const skeuoShadowPrimary =
      '0 2px 4px rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.3) inset'

    return {
      Button: {
        defaultBg: skeuoBg,
        defaultBorderColor: skeuoBorder,
        defaultShadow: skeuoShadow,
        primaryShadow: skeuoShadowPrimary,
      },
      Input: {
        colorBgContainer: skeuoBgLight,
        colorBorder: skeuoBorder,
      },
      Select: {
        colorBgContainer: skeuoBgLight,
        colorBorder: skeuoBorder,
      },
      Table: {
        colorBgContainer: skeuoBg,
        colorBorderSecondary: skeuoBorder,
        headerBg: isDark ? '#252019' : '#ece7e0',
      },
      Card: {
        colorBgContainer: skeuoBg,
        colorBorderSecondary: skeuoBorder,
      },
      Modal: {
        contentBg: skeuoBg,
      },
      Dropdown: {
        colorBgElevated: skeuoBgLight,
      },
      Tooltip: {
        colorBgSpotlight: skeuoBg,
      },
      Tag: {
        colorBgContainer: skeuoBg,
      },
      Menu: {
        colorBgContainer: 'transparent',
        colorItemBg: 'transparent',
      },
      Tree: {
        colorBgContainer: 'transparent',
      },
      Drawer: {
        colorBgElevated: skeuoBgLight,
      },
      Collapse: {
        colorBgContainer: skeuoBg,
        colorBorderSecondary: skeuoBorder,
      },
      Switch: {
        colorPrimary: isDark ? '#b8860b' : '#b8860b',
      },
    }
  }

  return undefined
}

/**
 * 根据设计风格构建全局 token 覆盖。
 * 这些 token 会被所有使用 antd token 的组件自动继承。
 */
function getDesignStyleToken(designStyle: DesignStyle, isDark: boolean) {
  if (designStyle === 'default') return {}

  if (designStyle === 'glassmorphism') {
    return {
      colorBgContainer: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)',
      colorBgElevated: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.18)',
      colorBgLayout: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
      colorFillQuaternary: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.04)',
      colorFillTertiary: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.08)',
      colorFillSecondary: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.14)',
      colorBorderSecondary: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
    }
  }

  if (designStyle === 'neumorphism') {
    return {
      colorBgContainer: isDark ? '#2d3436' : '#e0e5ec',
      colorBgElevated: isDark ? '#2d3436' : '#e0e5ec',
      colorBgLayout: isDark ? '#2d3436' : '#e0e5ec',
      colorFillQuaternary: isDark ? '#252a2c' : '#d8dde4',
      colorFillTertiary: isDark ? '#252a2c' : '#d8dde4',
      colorFillSecondary: isDark ? '#1e2224' : '#ccd1d9',
      colorBorderSecondary: 'transparent',
    }
  }

  if (designStyle === 'skeuomorphism') {
    return {
      colorBgContainer: isDark ? '#2a2520' : '#f5f0eb',
      colorBgElevated: isDark ? '#332e28' : '#faf8f5',
      colorBgLayout: isDark ? '#1e1a16' : '#ece7e0',
      colorFillQuaternary: isDark ? '#252019' : '#ece7e0',
      colorFillTertiary: isDark ? '#252019' : '#ece7e0',
      colorFillSecondary: isDark ? '#3d3529' : '#e2dbd3',
      colorBorderSecondary: isDark ? '#4a4035' : '#c8bfb4',
    }
  }

  return {}
}

interface ThemeContextData {
  themeSetting: ThemeSetting
  setThemeSetting: React.Dispatch<React.SetStateAction<ThemeSetting>>
  autoSaveId: string | undefined
  isDarkMode: boolean
}

const ThemeContext = createContext({} as ThemeContextData)

interface ThemeProviderProps {
  initialValue: ThemeSetting
  autoSaveId?: ThemeContextData['autoSaveId']
}

export function ThemeProvider(props: React.PropsWithChildren<ThemeProviderProps>) {
  const { token } = theme.useToken()

  const { children, initialValue, autoSaveId } = props

  const [themeSetting, setThemeSetting] = useState<ThemeSetting>(initialValue)

  const { themeMode, designStyle } = themeSetting

  const isDarkMode = themeMode === 'darkDefault'

  const algorithm = useMemo(() => {
    return isDarkMode ? darkAlgorithm : defaultAlgorithm
  }, [isDarkMode])

  // 从设计风格预设中自动获取主色和圆角
  const stylePreset = designStylePresets[designStyle] ?? designStylePresets.default

  const themePresetTokens = useMemo(() => {
    const preset = presetThemes[themeMode]
    return {
      ...preset.token,
      colorPrimary: stylePreset.colorPrimary,
      borderRadius: stylePreset.borderRadius,
      borderRadiusLG: stylePreset.borderRadiusLG,
      borderRadiusSM: stylePreset.borderRadiusSM,
    }
  }, [themeMode, stylePreset])

  // 设计风格全局 token 覆盖
  const designStyleToken = useMemo(
    () => getDesignStyleToken(designStyle, isDarkMode),
    [designStyle, isDarkMode],
  )

  // 设计风格组件级 token 覆盖
  const designStyleComponents = useMemo(
    () => getDesignStyleComponents(designStyle, isDarkMode),
    [designStyle, isDarkMode],
  )

  useEffect(() => {
    document.documentElement.setAttribute('theme', themeMode)
  }, [themeMode])

  useEffect(() => {
    document.documentElement.setAttribute('data-design-style', designStyle)
  }, [designStyle])

  // 首次渲染后标记 theme-ready，启用过渡动画
  useEffect(() => {
    // 使用双 rAF 确保浏览器已完成首次样式计算
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.add('theme-ready')
      })
    })
  }, [])

  useEffect(() => {
    if (themePresetTokens.colorPrimary) {
      setTwoToneColor(themePresetTokens.colorPrimary)
      document.documentElement.style.setProperty('--ds-primary-color', themePresetTokens.colorPrimary)
    }
  }, [themePresetTokens.colorPrimary])

  // 合并基础组件覆盖和设计风格组件覆盖
  const mergedComponents = useMemo(() => {
    const base: ThemeConfig['components'] = {
      Modal: { colorBgMask: isDarkMode ? token.colorBgMask : 'rgb(255 255 255 / 0.72)' },
      Tooltip:
        !isDarkMode
          ? {
              colorTextLightSolid: token.colorText,
              colorBgSpotlight: token.colorBgContainer,
            }
          : undefined,
    }

    if (!designStyleComponents) return base

    // 深度合并：设计风格覆盖基础设置
    const merged: ThemeConfig['components'] = { ...base }
    for (const [component, overrides] of Object.entries(designStyleComponents)) {
      merged[component as keyof typeof merged] = {
        ...(base[component as keyof typeof base] as Record<string, unknown>),
        ...overrides,
      } as never
    }
    return merged
  }, [isDarkMode, token, designStyleComponents])

  return (
    <ThemeContext.Provider value={{ themeSetting, setThemeSetting, autoSaveId, isDarkMode }}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm,
          token: { ...themePresetTokens, ...designStyleToken },
          components: mergedComponents,
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}

export function ThemeProviderClient(
  props: React.PropsWithChildren<Pick<ThemeProviderProps, 'autoSaveId'>>,
) {
  const { children, autoSaveId } = props

  const [themeSetting, setThemeSetting] = useState<ThemeSetting>()

  useEffect(() => {
    setThemeSetting(restoreThemeSetting(autoSaveId))
  }, [autoSaveId])

  if (!themeSetting) {
    return null
  }

  return (
    <ThemeProvider autoSaveId={autoSaveId} initialValue={themeSetting}>
      {children}
    </ThemeProvider>
  )
}

export const useThemeContext = () => useContext(ThemeContext)
