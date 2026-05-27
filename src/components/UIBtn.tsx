import { useDesignStyle } from '@/hooks/useDesignStyle'
import { useStyles } from '@/hooks/useStyle'

import { css } from '@emotion/css'

interface UIBtnProps extends React.PropsWithChildren, React.ComponentProps<'button'> {
  primary?: boolean
}

export function UIButton(props: UIBtnProps) {
  const { children, primary, className = '', ...rest } = props
  const { isGlassStyle, isNeumorphism, isSkeuomorphism } = useDesignStyle()

  const { styles } = useStyles(({ token }) => ({
    btn: css({
      padding: `${token.paddingXXS}px ${token.paddingXS}px`,
      backgroundColor: primary ? token.colorPrimaryBg : token.colorFillTertiary,
      borderRadius: token.borderRadiusSM,
      color: primary ? token.colorPrimary : token.colorTextSecondary,
      border: isNeumorphism ? 'none' : undefined,
      boxShadow: isNeumorphism
        ? 'var(--ds-shadow-sm)'
        : isSkeuomorphism
          ? 'var(--ds-shadow-sm)'
          : undefined,
      backdropFilter: isGlassStyle ? 'blur(8px)' : undefined,
      WebkitBackdropFilter: isGlassStyle ? 'blur(8px)' : undefined,

      '&:hover': {
        backgroundColor: primary ? token.colorPrimaryBg : token.colorFillSecondary,
      },
      '&:active': {
        boxShadow: isNeumorphism || isSkeuomorphism ? 'var(--ds-inner-shadow)' : undefined,
        transform: isNeumorphism || isSkeuomorphism ? 'translateY(1px)' : undefined,
      },
    }),
  }))

  return (
    <button
      type="button"
      {...rest}
      className={`cursor-pointer border-none text-xs outline-none ${styles.btn} ${className}`}
    >
      {children}
    </button>
  )
}
