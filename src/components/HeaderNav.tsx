import { useState } from 'react'

import { show } from '@ebay/nice-modal-react'
import { Button, Dropdown, Space } from 'antd'
import { ArrowLeftIcon, InfoIcon, RefreshCw, SettingsIcon } from 'lucide-react'
import { useNavigate } from 'react-router'

import { useMenuHelpersContext } from '@/contexts/menu-helpers'

import { IconLogo } from '@/components/icons/IconLogo'
import { ModalSettings, SettingsMenuKey } from '@/components/modals/ModalSettings'
import { ProjectQuickSwitch } from '@/components/ProjectQuickSwitch'
import { UserMenu } from '@/components/UserMenu'

const ABOUT_MENU_KEY = 'about'

export function HeaderNav() {
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)
  const { reloadState } = useMenuHelpersContext()

  return (
    <div className="flex h-full items-center">
      <div className="ml-auto">
        <Space size={4}>
          <Button
            icon={<RefreshCw size={14} />}
            size="small"
            loading={refreshing}
            onClick={async () => {
              setRefreshing(true)
              await reloadState()
              setRefreshing(false)
            }}
          >
            刷新
          </Button>
          <Button icon={<ArrowLeftIcon size={14} />} size="small" onClick={() => navigate('/projects')}>
            项目列表
          </Button>
          <ProjectQuickSwitch />
          <UserMenu />
          <Button icon={<SettingsIcon size={14} />} size="small" type="text" onClick={() => void show(ModalSettings)} />
          <Dropdown
            menu={{
              items: [{ key: ABOUT_MENU_KEY, label: '关于项目', icon: <InfoIcon size={16} /> }],
              onClick: ({ key }) => {
                if (key === ABOUT_MENU_KEY) void show(ModalSettings, { selectedKey: SettingsMenuKey.About })
              },
            }}
          >
            <Button icon={<div className="inline-flex size-4 items-center justify-center"><IconLogo /></div>} size="small" type="text" />
          </Dropdown>
        </Space>
      </div>
    </div>
  )
}
