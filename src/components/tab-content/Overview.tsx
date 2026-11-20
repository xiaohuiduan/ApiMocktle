import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Col, Empty, Row, Space, theme } from 'antd'

import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useMenuTabHelpers } from '@/contexts/menu-tab-settings'
import { MenuItemType } from '@/enums'
import { useHelpers } from '@/hooks/useHelpers'

export function Overview() {
  const { token } = theme.useToken()
  const { t } = useTranslation()
  const { menuRawList } = useMenuHelpersContext()
  const { addTabItem } = useMenuTabHelpers()
  const { createApiDetails, createApiRequest, createDoc, createApiSchema } = useHelpers()
  const stats = useMemo(() => {
    const list = menuRawList ?? []
    const apiCount = list.filter(({ type }) => type === MenuItemType.ApiDetail).length
    const apiCaseCount = list.filter(({ type }) => type === MenuItemType.HttpRequest).length
    const docCount = list.filter(({ type }) => type === MenuItemType.Doc).length
    const schemaCount = list.filter(({ type }) => type === MenuItemType.ApiSchema).length

    return {
      apiCount,
      apiCaseCount,
      docCount,
      schemaCount,
      testScenarioCount: apiCaseCount,
    }
  }, [menuRawList])

  const recentItems = useMemo(() => {
    return [...(menuRawList ?? [])]
      .filter((item) => item.type !== MenuItemType.ApiDetailFolder)
      .sort((a, b) => {
        const ta = (a as unknown as { updatedAt?: string }).updatedAt
          ?? (a.data as { updatedAt?: string } | undefined)?.updatedAt
          ?? ''
        const tb = (b as unknown as { updatedAt?: string }).updatedAt
          ?? (b.data as { updatedAt?: string } | undefined)?.updatedAt
          ?? ''

        return tb.localeCompare(ta)
      })
      .slice(0, 6)
  }, [menuRawList])

  return (
    <Row className="w-full overflow-hidden p-tabContent" gutter={[token.padding, token.padding]}>
      <Col span={24}>
        <div
          style={{
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadius,
            padding: token.padding,
          }}
        >
          <div className="mb-4 text-lg">{t('api.overview.stats')}</div>
          <div className="flex flex-wrap">
            <div className="w-1/5">
              <div className="text-2xl">{stats.apiCount}</div>
              <div className="mt-1 text-xs" style={{ color: token.colorTextTertiary }}>
                {t('api.overview.apiCount')}
              </div>
            </div>
            <div className="w-1/5">
              <div className="text-2xl">{stats.apiCaseCount}</div>
              <div className="mt-1 text-xs" style={{ color: token.colorTextTertiary }}>
                {t('api.overview.apiCaseCount')}
              </div>
            </div>
            <div className="w-1/5">
              <div className="text-2xl">{stats.docCount}</div>
              <div className="mt-1 text-xs" style={{ color: token.colorTextTertiary }}>
                {t('api.overview.docCount')}
              </div>
            </div>
            <div className="w-1/5">
              <div className="text-2xl">{stats.schemaCount}</div>
              <div className="mt-1 text-xs" style={{ color: token.colorTextTertiary }}>
                {t('api.overview.schemaCount')}
              </div>
            </div>
            <div className="w-1/5">
              <div className="text-2xl">{stats.testScenarioCount}</div>
              <div className="mt-1 text-xs" style={{ color: token.colorTextTertiary }}>
                {t('api.overview.testScenarioCount')}
              </div>
            </div>
          </div>
        </div>
      </Col>

      <Col span={16}>
        <div
          style={{
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadius,
            padding: token.padding,
          }}
        >
          <div className="mb-3 text-base">{t('api.overview.recent')}</div>
          {recentItems.length === 0
            ? (
                <Empty description={t('api.overview.recentEmpty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )
            : (
                <div className="flex flex-col gap-2">
                  {recentItems.map((item) => (
                    <Button
                      key={item.id}
                      className="!flex !items-center !justify-start !px-2 !text-left"
                      type="text"
                      onClick={() => {
                        addTabItem({
                          key: item.id,
                          label: item.name,
                          contentType: item.type,
                        })
                      }}
                    >
                      <span className="truncate">{item.name}</span>
                    </Button>
                  ))}
                </div>
              )}
        </div>
      </Col>

      <Col span={8}>
        <div
          style={{
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadius,
            padding: token.padding,
          }}
        >
          <div className="mb-3 text-base">{t('api.overview.quickCreate')}</div>
          <Space className="w-full" direction="vertical">
            <Button block onClick={() => { createApiDetails() }}>{t('menu.catalogNew.http')}</Button>
            <Button block onClick={() => { createApiRequest() }}>{t('menu.catalogNew.request')}</Button>
            <Button block onClick={() => { createDoc() }}>{t('menu.catalogNew.markdown')}</Button>
            <Button block onClick={() => { createApiSchema() }}>{t('menu.catalogNew.schema')}</Button>
          </Space>
        </div>
      </Col>
    </Row>
  )
}
