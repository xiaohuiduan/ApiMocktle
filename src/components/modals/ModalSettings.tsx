import { useEffect, useMemo, useState } from 'react'

import { Viewer } from '@bytemd/react'
import { create, useModal } from '@ebay/nice-modal-react'
import { ConfigProvider, Menu, type MenuProps, Modal, type ModalProps, theme } from 'antd'
import { InfoIcon, ShirtIcon } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

import { PROJECT_ABOUT_MARKDOWN } from '@/content/project-about'
import { ThemeEditor, useThemeContext } from '@/components/ThemeEditor'

export const enum SettingsMenuKey {
  Appearance = '0',
  About = '1',
}

const settingMenuItems = [
  {
    key: SettingsMenuKey.Appearance,
    icon: <ShirtIcon size={16} />,
    label: '外观',
  },
  {
    key: SettingsMenuKey.About,
    icon: <InfoIcon size={16} />,
    label: '关于此项目',
  },
] satisfies MenuProps['items']

function ThemeEditorWrapper() {
  const { themeSetting, setThemeSetting, autoSaveId } = useThemeContext()

  return (
    <ThemeEditor
      autoSaveId={autoSaveId}
      value={themeSetting}
      onChange={(value) => {
        if (value) {
          setThemeSetting(value)
        }
      }}
    />
  )
}

const renderMenuContent = (props: { menuKey: SettingsMenuKey }) => {
  switch (props.menuKey) {
    case SettingsMenuKey.Appearance:
      return <ThemeEditorWrapper />

    case SettingsMenuKey.About:
      return <AboutContent />
  }
}

function AboutContent() {
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    invoke<string>('get_app_version').then(setVersion).catch(() => setVersion(''))
  }, [])

  return (
    <div>
      <Viewer value={PROJECT_ABOUT_MARKDOWN} />
      {version && (
        <div className="mt-4 text-sm text-gray-500">版本 {version}</div>
      )}
    </div>
  )
}

interface ModalSettingsProps extends Omit<ModalProps, 'open' | 'footer'> {
  defaultSelectedKey?: SettingsMenuKey
  selectedKey?: SettingsMenuKey
}

export const ModalSettings = create((props: ModalSettingsProps) => {
  const { token } = theme.useToken()

  const { selectedKey, defaultSelectedKey, ...restModalProps } = props

  const modal = useModal()

  const [selectedKeys, setSelectedKeys] = useState<[SettingsMenuKey]>()

  useEffect(() => {
    if (selectedKey) {
      setSelectedKeys([selectedKey])
    }
    else {
      setSelectedKeys([defaultSelectedKey ?? SettingsMenuKey.Appearance])
    }
  }, [selectedKey, defaultSelectedKey])

  const selectedMenuItem = useMemo(() => {
    return settingMenuItems.find((item) => item.key === selectedKeys?.at(0))
  }, [selectedKeys])

  const renderMenuKey = selectedKeys?.at(0)

  return (
    <ConfigProvider
      theme={{
        components: {
          Modal: {
            paddingMD: 0,
            paddingContentHorizontalLG: 0,
          },
        },
      }}
    >
      <Modal
        width={950}
        {...restModalProps}
        footer={false}
        open={modal.visible}
        onCancel={(...parmas) => {
          props.onCancel?.(...parmas)
          void modal.hide()
        }}
      >
        <div className="flex">
          <div
            className="w-64"
            style={{
              padding: `${token.paddingMD}px 0`,
              backgroundColor: token.colorFillQuaternary,
            }}
          >
            <div
              className="text-lg"
              style={{
                padding: `0 ${token.paddingMD}px ${token.paddingMD}px ${token.paddingMD}px`,
              }}
            >
              设置
            </div>

            <div style={{ padding: `0 ${token.paddingMD}px` }}>
              <ConfigProvider
                theme={{
                  components: {
                    Menu: {
                      colorBgContainer: 'transparent',
                      itemHoverBg: 'transparent',
                      itemHoverColor: token.colorPrimary,
                      itemBorderRadius: token.borderRadiusSM,
                    },
                  },
                }}
              >
                <Menu
                  className="!border-none"
                  items={settingMenuItems}
                  selectedKeys={selectedKeys}
                  onClick={({ key }) => {
                    setSelectedKeys([key as SettingsMenuKey])
                  }}
                />
              </ConfigProvider>
            </div>
          </div>

          <div className="flex-1" style={{ padding: `${token.paddingMD}px` }}>
            <div className="text-lg" style={{ padding: `0 0 ${token.paddingMD}px 0` }}>
              {selectedMenuItem?.label}
            </div>

            {!!renderMenuKey && renderMenuContent({ menuKey: renderMenuKey })}
          </div>
        </div>
      </Modal>
    </ConfigProvider>
  )
})
