import { theme } from 'antd'

import { useDesignStyle } from './useDesignStyle'

export function useCssVariable(): React.CSSProperties {
  const { token } = theme.useToken()
  const { isGlassStyle, designStyle } = useDesignStyle()

  return {
    '--ui-tabs-hover-color': token.colorTextBase,
    '--ui-tabs-hover-bg': token.colorFillContent,
    // 设计风格相关变量，供需要的组件通过 inline style 使用
    '--ui-ds-blur': isGlassStyle ? 'var(--ds-blur)' : 'none',
    '--ui-ds-style': designStyle,
  } as React.CSSProperties
}
