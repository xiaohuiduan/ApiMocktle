import { useThemeContext } from '@/components/ThemeEditor/ThemeContext'
import type { DesignStyle } from '@/components/ThemeEditor/ThemeEditor.type'

/**
 * 获取当前设计风格及相关的布尔标志。
 * 用于组件中根据风格条件性地应用样式。
 */
export function useDesignStyle() {
  const { themeSetting } = useThemeContext()
  const designStyle: DesignStyle = themeSetting.designStyle ?? 'default'

  return {
    designStyle,
    isDefault: designStyle === 'default',
    isGlassmorphism: designStyle === 'glassmorphism',
    isSkeuomorphism: designStyle === 'skeuomorphism',
    isNeumorphism: designStyle === 'neumorphism',
    /** 是否为玻璃类风格 */
    isGlassStyle: designStyle === 'glassmorphism',
  }
}
