import { useState } from 'react'

import { show } from '@ebay/nice-modal-react'
import { Button, Space } from 'antd'
import { ArrowLeftIcon, RefreshCw, SettingsIcon } from 'lucide-react'
import { useNavigate } from 'react-router'

import { useMenuHelpersContext } from '@/contexts/menu-helpers'

import { ModalSettings } from '@/components/modals/ModalSettings'
import { ProjectQuickSwitch } from '@/components/ProjectQuickSwitch'
import { UserMenu } from '@/components/UserMenu'

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
        </Space>
      </div>
    </div>
  )
}
