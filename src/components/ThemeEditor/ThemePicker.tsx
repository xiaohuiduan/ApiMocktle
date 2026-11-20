import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Space, theme } from 'antd'

import { presetThemeNameKeys, presetThemes } from './theme-data'

interface ThemePickerProps {
  value?: string
  onChange?: (value: ThemePickerProps['value']) => void
}

export function ThemePicker(props: ThemePickerProps) {
  const { token } = theme.useToken()

  const { t } = useTranslation()

  const { value, onChange } = props

  // t 作为依赖：语言切换时重新取配色模式展示名
  const themeNames = useMemo(() => {
    return {
      lightDefault: t(presetThemeNameKeys.lightDefault),
      darkDefault: t(presetThemeNameKeys.darkDefault),
    }
  }, [t])

  return (
    <Space wrap size={token.paddingLG}>
      {Object.entries(presetThemes).map(([themeName, { preview }]) => {
        const matched = themeName === value
        const name = themeNames[themeName as keyof typeof themeNames]

        return (
          <Space
            key={themeName}
            align="center"
            className={matched ? 'cursor-default' : 'cursor-pointer'}
            direction="vertical"
            onClick={() => {
              onChange?.(themeName)
            }}
          >
            <div
              className="h-[80px] w-[120px] overflow-hidden"
              style={{
                borderRadius: token.borderRadiusLG,
                boxShadow: matched
                  ? `0 0 0 2px ${token.colorBgContainer}, 0 0 0 5px ${token.colorPrimary}`
                  : 'none',
              }}
            >
              {preview}
            </div>
            <span>{name}</span>
          </Space>
        )
      })}
    </Space>
  )
}
