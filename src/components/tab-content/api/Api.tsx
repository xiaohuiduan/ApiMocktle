import { useMemo } from 'react'

import { ConfigProvider, Tabs, type TabsProps, theme } from 'antd'

import { PageTabStatus } from '@/components/ApiTab/ApiTab.enum'
import { ApiTabContentWrapper } from '@/components/ApiTab/ApiTabContentWrapper'
import { useTabContentContext } from '@/components/ApiTab/TabContentContext'

import { ApiDoc } from './ApiDoc'
import { ApiDocEditing } from './ApiDocEditing'
import { RunTab } from './RunTab'

export function Api() {
  const { token } = theme.useToken()

  const { tabData } = useTabContentContext()

  const apiTabItems = useMemo<TabsProps['items']>(() => {
    return [
      {
        key: 'doc',
        label: '文档',
        children: (
          <ApiTabContentWrapper>
            <ApiDoc />
          </ApiTabContentWrapper>
        ),
      },
      {
        key: 'docEdit',
        label: '修改文档',
        children: (
          <ApiTabContentWrapper>
            <ApiDocEditing />
          </ApiTabContentWrapper>
        ),
      },
      {
        key: 'run',
        label: '运行',
        children: (
          <ApiTabContentWrapper>
            <RunTab />
          </ApiTabContentWrapper>
        ),
      },
    ]
  }, [])

  return (
    <div className="h-full overflow-hidden">
      <ConfigProvider
        theme={{
          components: {
            Form: {
              labelColor: token.colorTextSecondary,
              verticalLabelPadding: 0,
            },
            Tabs: {
              itemColor: token.colorTextSecondary,
              horizontalItemPadding: '8px 0',
              horizontalItemGutter: 6,
            },
          },
        }}
      >
        {tabData.data?.tabStatus === PageTabStatus.Create
          ? (
              <ApiTabContentWrapper>
                <ApiDocEditing />
              </ApiTabContentWrapper>
            )
          : (
              <div className="flex h-full overflow-hidden">
                <Tabs
                  animated={false}
                  className="api-details-tabs flex-1"
                  defaultActiveKey="doc"
                  items={apiTabItems}
                />
              </div>
            )}
      </ConfigProvider>
    </div>
  )
}
