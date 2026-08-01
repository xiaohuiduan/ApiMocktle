import { Space, theme } from 'antd'

import { densityPresets } from './theme-data'
import type { Density } from './ThemeEditor.type'

interface DensityPickerProps {
  value?: Density
  onChange?: (value: Density) => void
}

/** 每档密度的预览卡片示意参数：行高与行间距，直观反映紧凑程度 */
const densityPreview: Record<Density, { rowHeight: number, rowGap: number, fontScale: number }> = {
  compact: { rowHeight: 10, rowGap: 3, fontScale: 0.82 },
  standard: { rowHeight: 14, rowGap: 6, fontScale: 1 },
  loose: { rowHeight: 20, rowGap: 10, fontScale: 1.08 },
}

export function DensityPicker(props: DensityPickerProps) {
  const { token } = theme.useToken()

  const { value, onChange } = props

  return (
    <Space wrap size={token.paddingLG}>
      {(Object.keys(densityPresets) as Density[]).map((densityKey) => {
        const matched = densityKey === (value ?? 'compact')
        const { name, description } = densityPresets[densityKey]
        const preview = densityPreview[densityKey]

        return (
          <Space
            key={densityKey}
            align="center"
            className={matched ? 'cursor-default' : 'cursor-pointer'}
            direction="vertical"
            onClick={() => {
              onChange?.(densityKey)
            }}
          >
            <div
              style={{
                width: 120,
                height: 80,
                borderRadius: token.borderRadiusLG,
                overflow: 'hidden',
                position: 'relative',
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                boxShadow: matched
                  ? `0 0 0 2px ${token.colorBgContainer}, 0 0 0 5px ${token.colorPrimary}`
                  : 'none',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: 10,
                gap: preview.rowGap,
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    height: preview.rowHeight,
                    borderRadius: 3,
                    background: i === 0 ? token.colorPrimary : token.colorFillSecondary,
                  }}
                />
              ))}
              <div
                style={{
                  fontSize: Math.round(11 * preview.fontScale),
                  color: token.colorTextSecondary,
                  marginTop: preview.rowGap,
                  lineHeight: 1.1,
                }}
              >
                Aa
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
              <div style={{ fontSize: 11, color: token.colorTextSecondary, maxWidth: 120 }}>
                {description}
              </div>
            </div>
          </Space>
        )
      })}
    </Space>
  )
}
