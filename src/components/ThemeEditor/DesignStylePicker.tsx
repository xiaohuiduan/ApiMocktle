import { Space, theme } from 'antd'

import { designStylePresets, presetDesignStyles } from './theme-data'
import type { DesignStyle } from './ThemeEditor.type'

interface DesignStylePickerProps {
  value?: DesignStyle
  onChange?: (value: DesignStyle) => void
}

/** 每种风格的预览卡片样式 */
const stylePreviews: Record<DesignStyle, React.CSSProperties> = {
  default: {
    backgroundColor: '#ffffff',
    border: '1px solid #e4e7ec',
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  },
  glassmorphism: {
    background: 'rgba(255,255,255,0.2)',
    backdropFilter: 'blur(10px) saturate(150%)',
    border: '1px solid rgba(255,255,255,0.3)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
  },
  skeuomorphism: {
    background: '#f5f0eb',
    border: '1px solid #c8bfb4',
    boxShadow:
      '0 2px 8px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.5) inset, 0 -1px 0 rgba(0,0,0,0.04) inset',
  },
  neumorphism: {
    background: '#e0e5ec',
    border: 'none',
    boxShadow: '4px 4px 8px #b8bec7, -4px -4px 8px #ffffff',
  },
}

/** 各风格预设主色，用于预览卡片内部装饰 */
const styleColors: Record<DesignStyle, string> = {
  default: designStylePresets.default.colorPrimary,
  glassmorphism: designStylePresets.glassmorphism.colorPrimary,
  skeuomorphism: designStylePresets.skeuomorphism.colorPrimary,
  neumorphism: designStylePresets.neumorphism.colorPrimary,
}

/** 预览卡片内部装饰元素的样式 */
const innerDecorations: Record<
  DesignStyle,
  { box1: React.CSSProperties; box2: React.CSSProperties }
> = {
  default: {
    box1: { backgroundColor: '#f0f0f0', border: '1px solid #e4e7ec', borderRadius: 4 },
    box2: { backgroundColor: styleColors.default, borderRadius: 4 },
  },
  glassmorphism: {
    box1: {
      background: 'rgba(255,255,255,0.3)',
      backdropFilter: 'blur(6px)',
      border: '1px solid rgba(255,255,255,0.4)',
      borderRadius: 6,
    },
    box2: {
      background: styleColors.glassmorphism,
      borderRadius: 6,
    },
  },
  skeuomorphism: {
    box1: {
      background: 'linear-gradient(145deg, #faf8f5, #e8e0d8)',
      border: '1px solid #c8bfb4',
      borderRadius: 4,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 1px 0 rgba(255,255,255,0.5) inset',
    },
    box2: {
      background: `linear-gradient(145deg, color-mix(in srgb, ${styleColors.skeuomorphism} 80%, white), ${styleColors.skeuomorphism})`,
      borderRadius: 4,
      boxShadow: '0 2px 4px rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.3) inset',
    },
  },
  neumorphism: {
    box1: {
      background: '#e0e5ec',
      borderRadius: 6,
      boxShadow: '3px 3px 6px #b8bec7, -3px -3px 6px #ffffff',
    },
    box2: {
      background: styleColors.neumorphism,
      borderRadius: 6,
      boxShadow: '2px 2px 4px #b8bec7, -2px -2px 4px #ffffff',
    },
  },
}

export function DesignStylePicker(props: DesignStylePickerProps) {
  const { token } = theme.useToken()

  const { value, onChange } = props

  return (
    <Space wrap size={token.paddingLG}>
      {Object.entries(presetDesignStyles).map(([styleKey, { name, description }]) => {
        const style = styleKey as DesignStyle
        const matched = style === (value ?? 'default')
        const preview = stylePreviews[style]
        const deco = innerDecorations[style]

        return (
          <Space
            key={styleKey}
            align="center"
            className={matched ? 'cursor-default' : 'cursor-pointer'}
            direction="vertical"
            onClick={() => {
              onChange?.(style)
            }}
          >
            <div
              style={{
                width: 120,
                height: 80,
                borderRadius: token.borderRadiusLG,
                overflow: 'hidden',
                position: 'relative',
                boxShadow: matched
                  ? `0 0 0 2px ${token.colorBgContainer}, 0 0 0 5px ${styleColors[style]}`
                  : 'none',
              }}
            >
              {/* 中性渐变背景（玻璃风格） */}
              {style === 'glassmorphism' ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(135deg, #e8eaed 0%, #d0d3d9 50%, #c8ccd3 100%)',
                  }}
                />
              ) : null}
              {/* 主卡片 */}
              <div
                style={{
                  position: 'absolute',
                  inset: 8,
                  borderRadius: 8,
                  ...preview,
                }}
              >
                {/* 内部装饰 */}
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    width: 50,
                    height: 12,
                    ...deco.box1,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 28,
                    left: 10,
                    width: 36,
                    height: 8,
                    ...deco.box2,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 10,
                    right: 10,
                    width: 30,
                    height: 20,
                    ...deco.box1,
                  }}
                />
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
