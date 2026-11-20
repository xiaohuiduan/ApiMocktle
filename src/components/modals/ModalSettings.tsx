import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Viewer } from '@bytemd/react'
import { create, useModal } from '@ebay/nice-modal-react'
import { invoke } from '@tauri-apps/api/core'
import { ConfigProvider, Menu, Modal, type ModalProps, theme } from 'antd'
import type { TFunction } from 'i18next'
import { Code2Icon, Globe, InfoIcon, KeyRoundIcon, LanguagesIcon, SendIcon, Share2, ShirtIcon, Zap } from 'lucide-react'

import { McpServerPanel } from '@/components/project-settings/McpServerPanel'
import { ShareServerPanel } from '@/components/project-settings/ShareServerPanel'
import { ProxySettingsForm } from '@/components/proxy-settings/ProxySettingsForm'
import { DynamicVariablePanel } from '@/components/settings/DynamicVariablePanel'
import { LanguageSettingPanel } from '@/components/settings/LanguageSettingPanel'
import { PersonalTokenPanel } from '@/components/settings/PersonalTokenPanel'
import { RequestSettingsPanel } from '@/components/settings/RequestSettingsPanel'
import { ThemeEditor, useThemeContext } from '@/components/ThemeEditor'
import { PROJECT_ABOUT_MARKDOWN } from '@/content/project-about'

export const enum SettingsMenuKey {
  Appearance = '0',
  About = '1',
  Proxy = '2',
  McpServer = '3',
  Tokens = '4',
  Request = '5',
  Share = '6',
  DynamicVariables = '7',
  Language = '8',
}

/**
 * 设置弹窗左侧菜单项。
 *
 * 必须是函数：菜单文案随语言变化，模块顶层只会在加载时求值一次，
 * 切换语言后永不刷新。消费方在渲染期用 `useMemo(() => createSettingMenuItems(t), [t])`。
 */
export interface SettingMenuItem {
  key: SettingsMenuKey
  icon: React.ReactNode
  label: string
}

export function createSettingMenuItems(t: TFunction): SettingMenuItem[] {
  return [
    {
      key: SettingsMenuKey.Appearance,
      icon: <ShirtIcon size={16} />,
      label: t('settings.menu.appearance'),
    },
    {
      // 语言紧跟外观：两者同属「界面呈现」偏好，放在一起符合心智
      key: SettingsMenuKey.Language,
      icon: <LanguagesIcon size={16} />,
      label: t('settings.menu.language'),
    },
    {
      key: SettingsMenuKey.Proxy,
      icon: <Globe size={16} />,
      label: t('settings.menu.proxy'),
    },
    {
      key: SettingsMenuKey.Request,
      icon: <SendIcon size={16} />,
      label: t('settings.menu.request'),
    },
    {
      key: SettingsMenuKey.Tokens,
      icon: <KeyRoundIcon size={16} />,
      label: t('settings.menu.tokens'),
    },
    {
      key: SettingsMenuKey.McpServer,
      icon: <Zap size={16} />,
      label: t('settings.menu.mcpServer'),
    },
    {
      key: SettingsMenuKey.Share,
      icon: <Share2 size={16} />,
      label: t('settings.menu.share'),
    },
    {
      key: SettingsMenuKey.DynamicVariables,
      icon: <Code2Icon size={16} />,
      label: t('settings.menu.dynamicVariables'),
    },
    {
      key: SettingsMenuKey.About,
      icon: <InfoIcon size={16} />,
      label: t('settings.menu.about'),
    },
  ]
}

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

    case SettingsMenuKey.Language:
      return <LanguageSettingPanel />

    case SettingsMenuKey.Proxy:
      return <ProxySettingsForm />

    case SettingsMenuKey.Request:
      return <RequestSettingsPanel />

    case SettingsMenuKey.McpServer:
      return <McpServerPanel />

    case SettingsMenuKey.Share:
      return <ShareServerPanel />

    case SettingsMenuKey.DynamicVariables:
      return <DynamicVariablePanel />

    case SettingsMenuKey.Tokens:
      return <PersonalTokenPanel />

    case SettingsMenuKey.About:
      return <AboutContent />
  }
}

function AboutContent() {
  const { t } = useTranslation()
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    invoke<string>('get_app_version').then(setVersion).catch(() => {
      setVersion('')
    })
  }, [])

  return (
    <div>
      <Viewer value={PROJECT_ABOUT_MARKDOWN} />
      {version && (
        <div className="mt-4 text-sm" style={{ color: 'var(--ds-node-text-secondary)' }}>{t('settings.menu.version', { version })}</div>
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
  const { t } = useTranslation()

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

  // t 作为依赖：语言切换时 t 引用变化，触发菜单文案重算
  const settingMenuItems = useMemo(() => createSettingMenuItems(t), [t])

  const selectedMenuItem = useMemo(() => {
    return settingMenuItems.find((item) => item.key === selectedKeys?.at(0))
  }, [settingMenuItems, selectedKeys])

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
              {t('settings.menu.title')}
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
