import { Button, theme } from 'antd'
import { SettingsIcon } from 'lucide-react'
import { show } from '@ebay/nice-modal-react'

import { IconLogo } from '@/components/icons/IconLogo'
import { UserMenu } from '@/components/UserMenu'
import { ModalSettings } from '@/components/modals/ModalSettings'

import { NavMenu } from './NavMenu'

export function SideNav() {
  const { token } = theme.useToken()

  return (
    <div className="flex h-full shrink-0 basis-[80px] flex-col items-center overflow-y-auto overflow-x-hidden px-1 pt-layoutHeader">
      <div
        className="mb-5 mt-2 size-10 rounded-xl p-[6px]"
        style={{ color: token.colorText, border: `1px solid ${token.colorBorder}` }}
      >
        <IconLogo />
      </div>

      <NavMenu />

      {/* 底部用户区域 */}
      <div className="mt-auto flex flex-col items-center gap-1 pb-3">
        <UserMenu />
        <Button
          type="text"
          size="small"
          icon={<SettingsIcon size={16} />}
          onClick={() => void show(ModalSettings)}
          title="设置"
        />
      </div>
    </div>
  )
}
