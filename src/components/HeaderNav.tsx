import { useEffect, useMemo, useState } from 'react'

import { show } from '@ebay/nice-modal-react'
import { Button, Dropdown, Space, type MenuProps } from 'antd'
import { ArrowLeftIcon, InfoIcon, LogOutIcon, SettingsIcon, UserCircle2Icon } from 'lucide-react'
import { useNavigate } from 'react-router'

import { IconLogo } from '@/components/icons/IconLogo'
import { ModalSettings, SettingsMenuKey } from '@/components/modals/ModalSettings'
import { ProjectQuickSwitch } from '@/components/ProjectQuickSwitch'

const ABOUT_MENU_KEY = 'about'

function useUsername() {
  const [username, setUsername] = useState<string>()

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const response = await fetch('/api/v1/auth/me', { credentials: 'include' })

        if (!response.ok) {
          return
        }

        const payload = await response.json() as {
          ok: boolean
          data?: { user?: { username?: string } }
        }

        if (payload.ok) {
          setUsername(payload.data?.user?.username)
        }
      }
      catch {
        // ignore
      }
    }

    void fetchMe()
  }, [])

  return username
}

export function HeaderNav() {
  const navigate = useNavigate()
  const username = useUsername()
  const accountMenu = useMemo<MenuProps>(() => ({
    items: [
      {
        key: 'projects',
        label: '项目列表',
        icon: <UserCircle2Icon size={16} />,
      },
      {
        key: 'logout',
        label: '退出登录',
        icon: <LogOutIcon size={16} />,
      },
    ],
    onClick: ({ key }) => {
      if (key === 'projects') {
        navigate('/projects')
        return
      }

      if (key === 'logout') {
        void fetch('/api/v1/auth/logout', {
          method: 'POST',
          credentials: 'include',
        }).finally(() => {
          navigate('/login', { replace: true })
        })
      }
    },
  }), [navigate])

  return (
    <div className="flex h-full items-center">
      <div className="ml-auto">
        <Space size={4}>
          <Button
            icon={<ArrowLeftIcon size={14} />}
            size="small"
            onClick={() => {
              navigate('/projects')
            }}
          >
            项目列表
          </Button>

          <ProjectQuickSwitch />

          {username && (
            <Dropdown menu={accountMenu}>
              <Button size="small" type="text">
                {username}
              </Button>
            </Dropdown>
          )}

          <Button
            icon={<SettingsIcon size={14} />}
            size="small"
            type="text"
            onClick={() => {
              void show(ModalSettings)
            }}
          />

          <Dropdown
            menu={{
              items: [
                {
                  key: ABOUT_MENU_KEY,
                  label: '关于项目',
                  icon: <InfoIcon size={16} />,
                },
              ],
              onClick: ({ key }) => {
                if (key === ABOUT_MENU_KEY) {
                  void show(ModalSettings, { selectedKey: SettingsMenuKey.About })
                }
              },
            }}
          >
            <Button
              icon={(
                <div className="inline-flex size-4 items-center justify-center">
                  <IconLogo />
                </div>
              )}
              size="small"
              type="text"
            />
          </Dropdown>
        </Space>
      </div>
    </div>
  )
}
