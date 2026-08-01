import { useMemo } from 'react'

import { show } from '@ebay/nice-modal-react'
import { Button, theme } from 'antd'
import { SettingsIcon } from 'lucide-react'

import { IconLogo } from '@/components/icons/IconLogo'
import { ModalSettings } from '@/components/modals/ModalSettings'
import { SessionVariablesPanel } from '@/components/SessionVariablesPanel'
import { UserMenu } from '@/components/UserMenu'
import { useDesignStyle } from '@/hooks/useDesignStyle'

import { NavMenu } from './NavMenu'

export function SideNav() {
  const { token } = theme.useToken()
  const { isGlassStyle, isSkeuomorphism, isNeumorphism } = useDesignStyle()

  const sideNavStyle = useMemo(() => {
    if (isGlassStyle) {
      return {
        backgroundColor: 'var(--ds-bg-surface)',
        backdropFilter: 'blur(var(--ds-blur))',
        WebkitBackdropFilter: 'blur(var(--ds-blur))' as string,
        borderRight: 'var(--ds-border-subtle)',
        boxShadow: 'var(--ds-shadow-sm)',
      }
    }

    if (isNeumorphism) {
      return {
        backgroundColor: 'var(--ds-bg-surface)',
        boxShadow: 'none',
        borderRight: 'none',
      }
    }

    if (isSkeuomorphism) {
      return {
        backgroundColor: 'var(--ds-bg-surface)',
        backgroundImage: 'var(--ds-texture)',
        borderRight: 'var(--ds-border)',
        boxShadow: 'var(--ds-shadow-sm)',
      }
    }

    return {}
  }, [isGlassStyle, isNeumorphism, isSkeuomorphism])

  const logoBorderStyle = useMemo(() => {
    if (isGlassStyle) {
      return {
        color: token.colorText,
        border: 'var(--ds-border)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }
    }

    if (isNeumorphism) {
      return {
        color: token.colorText,
        boxShadow: 'var(--ds-shadow-sm)',
        border: 'none',
      }
    }

    if (isSkeuomorphism) {
      return {
        color: token.colorText,
        border: 'var(--ds-border)',
        boxShadow: 'var(--ds-shadow-sm)',
      }
    }

    return { color: token.colorText, border: `1px solid ${token.colorBorder}` }
  }, [isGlassStyle, isNeumorphism, isSkeuomorphism, token])

  return (
    <div
      className="flex h-full shrink-0 basis-[80px] flex-col items-center overflow-y-auto overflow-x-hidden px-1 pt-layoutHeader"
      style={sideNavStyle}
    >
      <div className="mb-5 mt-2 size-10 rounded-xl p-[6px]" style={logoBorderStyle}>
        <IconLogo />
      </div>

      <NavMenu />

      {/* 底部用户区域 */}
      <div className="mt-auto flex flex-col items-center gap-1 pb-3">
        <SessionVariablesPanel />
        <UserMenu showUsername={false} />
        <Button
          icon={<SettingsIcon size={16} />}
          size="small"
          title="全局设置"
          type="text"
          onClick={() => void show(ModalSettings)}
        />
      </div>
    </div>
  )
}
