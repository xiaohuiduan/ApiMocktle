'use client'

import { lazy, Suspense, useEffect, useState } from 'react'

import { Button, ConfigProvider, Dropdown, Flex, Skeleton, theme } from 'antd'
import { PlusIcon } from 'lucide-react'

import { ApiMenuContextProvider } from '@/components/ApiMenu/ApiMenuContext'
import { FileIcon } from '@/components/icons/FileIcon'
import { IconText } from '@/components/IconText'
import { InputSearch } from '@/components/InputSearch'
import { API_MENU_CONFIG } from '@/configs/static'
import { MenuItemType } from '@/enums'
import { getCatalogType } from '@/helpers'
import { useHelpers } from '@/hooks/useHelpers'

import { PanelLayout } from '../components/PanelLayout'

const ApiMenu = lazy(async () => {
  const mod = await import('@/components/ApiMenu')

  return { default: mod.ApiMenu }
})

const ApiTab = lazy(async () => {
  const mod = await import('@/components/ApiTab')

  return { default: mod.ApiTab }
})

function LoadingPlaceholder() {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <Skeleton.Input active block />
      <Skeleton active paragraph={{ rows: 10 }} title={false} />
    </div>
  )
}

function HomeContent() {
  const { token } = theme.useToken()
  const [showHeavyContent, setShowHeavyContent] = useState(false)

  const { createTabItem } = useHelpers()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowHeavyContent(true)
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <PanelLayout
      layoutName="接口管理"
      left={(
        <>
          <Flex gap={token.paddingXXS} style={{ padding: token.paddingXS }}>
            <InputSearch />

            <ConfigProvider
              theme={{
                components: {
                  Button: {
                    paddingInline: token.paddingXS,
                    defaultBorderColor: token.colorBorderSecondary,
                  },
                },
              }}
            >
              <Dropdown
                menu={{
                  items: [
                    ...[
                      MenuItemType.ApiDetail,
                      MenuItemType.HttpRequest,
                      MenuItemType.Doc,
                      MenuItemType.ApiSchema,
                    ].map((t) => {
                      const { newLabel } = API_MENU_CONFIG[getCatalogType(t)]

                      return {
                        key: t,
                        label: t === MenuItemType.Doc ? '新建 Markdown' : newLabel,
                        icon: <FileIcon size={16} style={{ color: token.colorPrimary }} type={t} />,
                        onClick: () => {
                          createTabItem(t)
                        },
                      }
                    }),
                  ],
                }}
              >
                <Button type="primary">
                  <IconText icon={<PlusIcon size={18} />} />
                </Button>
              </Dropdown>
            </ConfigProvider>
          </Flex>

          <div className="ui-menu flex-1 overflow-hidden">
            <ApiMenuContextProvider>
              {showHeavyContent
                ? (
                    <Suspense fallback={<LoadingPlaceholder />}>
                      <ApiMenu />
                    </Suspense>
                  )
                : <LoadingPlaceholder />}
            </ApiMenuContextProvider>
          </div>
        </>
      )}
      right={showHeavyContent
        ? (
            <Suspense fallback={<LoadingPlaceholder />}>
              <ApiTab />
            </Suspense>
          )
        : <LoadingPlaceholder />}
    />
  )
}

export default function HomePage() {
  return <HomeContent />
}
