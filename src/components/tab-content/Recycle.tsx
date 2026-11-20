import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, ConfigProvider, Popconfirm, Table, Tabs, theme, Tooltip } from 'antd'

import { FileIcon } from '@/components/icons/FileIcon'
import { HttpMethodText } from '@/components/icons/HttpMethodText'
import { API_MENU_CONFIG } from '@/configs/static'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { CatalogType, MenuItemType } from '@/enums'
import { hasAccentColor } from '@/helpers'
import type { RecycleCatalogType, RecycleData, RecycleDataItem } from '@/types'

interface RecycleTableProps {
  catalogType: RecycleCatalogType
  selectedRecycleIds: string[]
  onSelectionChange: (selectedRecycleIds: string[]) => void
}

type SelectedRecycleIds = Record<RecycleCatalogType, string[]>

const EMPTY_SELECTED_RECYCLE_IDS: SelectedRecycleIds = {
  [CatalogType.Http]: [],
  [CatalogType.Schema]: [],
  [CatalogType.Request]: [],
}

/** 回收站页签顺序；label 在渲染期翻译，避免模块顶层求值。 */
const RECYCLE_TAB_KEYS: RecycleCatalogType[] = [CatalogType.Http, CatalogType.Schema, CatalogType.Request]

function filterSelectedRecycleIds(
  recycleData: RecycleData | undefined,
  catalogType: RecycleCatalogType,
  selectedRecycleIds: string[],
) {
  const list = recycleData?.[catalogType]?.list ?? []
  const availableIds = new Set(list.map(({ id }) => id))

  return selectedRecycleIds.filter((id) => availableIds.has(id))
}

function normalizeSelectedRecycleIds(
  recycleData: RecycleData | undefined,
  selectedRecycleIds: SelectedRecycleIds,
) {
  return {
    [CatalogType.Http]: filterSelectedRecycleIds(recycleData, CatalogType.Http, selectedRecycleIds[CatalogType.Http]),
    [CatalogType.Schema]: filterSelectedRecycleIds(
      recycleData,
      CatalogType.Schema,
      selectedRecycleIds[CatalogType.Schema],
    ),
    [CatalogType.Request]: filterSelectedRecycleIds(
      recycleData,
      CatalogType.Request,
      selectedRecycleIds[CatalogType.Request],
    ),
  } satisfies SelectedRecycleIds
}

function RecycleTable(props: RecycleTableProps) {
  const { token } = theme.useToken()
  const { t } = useTranslation()
  const { catalogType, selectedRecycleIds, onSelectionChange } = props

  const {
    recyleRawData,
    restoreMenuItem,
    restoreMenuItems,
    deleteRecycleItems,
  } = useMenuHelpersContext()
  const hasSelection = selectedRecycleIds.length > 0
  const recycleList = recyleRawData?.[catalogType]?.list ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span style={{ color: token.colorTextSecondary }}>
          {t('api.recycle.selectedCount', { count: selectedRecycleIds.length })}
        </span>
        <div className="flex items-center gap-2">
          <Popconfirm
            placement="left"
            title={t('api.recycle.confirmRestore', { count: selectedRecycleIds.length })}
            onConfirm={() => {
              onSelectionChange([])
              restoreMenuItems(selectedRecycleIds)
            }}
          >
            <Button disabled={!hasSelection}>{t('api.recycle.batchRestore')}</Button>
          </Popconfirm>
          <Popconfirm
            description={t('api.recycle.deleteIrreversible')}
            placement="left"
            title={t('api.recycle.confirmDelete', { count: selectedRecycleIds.length })}
            onConfirm={() => {
              onSelectionChange([])
              deleteRecycleItems(selectedRecycleIds)
            }}
          >
            <Button danger disabled={!hasSelection}>
              {t('api.recycle.batchDelete')}
            </Button>
          </Popconfirm>
        </div>
      </div>
      <Table<RecycleDataItem>
        className="overflow-hidden [&_.ant-table-row:last-of-type_>_.ant-table-cell]:border-none [&_.ant-table-thead_>_tr_>_.ant-table-cell]:font-normal"
        columns={[
          {
            title: t('api.recycle.fileName'),
            dataIndex: 'deletedItem',
            render: (x: RecycleDataItem['deletedItem']) => {
              const isHttp = x.type === MenuItemType.ApiDetail || x.type === MenuItemType.HttpRequest
              const { accentColor } = API_MENU_CONFIG[catalogType]

              return (
                <div className="inline-flex items-center gap-x-1">
                  {isHttp
                    ? (
                        <HttpMethodText className="text-xs font-bold" method={x.data?.method} />
                      )
                    : (
                        <FileIcon
                          size={15}
                          style={{ color: hasAccentColor(x.type) ? accentColor : undefined }}
                          type={x.type}
                        />
                      )}
                  <span>{x.name}</span>
                </div>
              )
            },
          },
          {
            title: t('api.recycle.operator'),
            dataIndex: 'creator',
            width: 150,
            render: (x: RecycleDataItem['creator']) => {
              return <Tooltip title={x.username}>{x.name}</Tooltip>
            },
          },
          { title: t('api.recycle.remaining'), dataIndex: 'expiredAt', width: 150 },
          {
            title: t('common.action'),
            width: 100,
            render: (_, record) => {
              return (
                <Popconfirm
                  placement="left"
                  title={t('api.recycle.confirmRestoreOne')}
                  onConfirm={() => {
                    onSelectionChange(selectedRecycleIds.filter((id) => id !== record.id))
                    restoreMenuItem({ restoreId: record.id })
                  }}
                >
                  <Button size="small" type="link">
                    {t('api.recycle.restore')}
                  </Button>
                </Popconfirm>
              )
            },
          },
        ]}
        dataSource={recycleList}
        pagination={false}
        rowKey="id"
        rowSelection={{
          selectedRowKeys: selectedRecycleIds,
          onChange: (selectedRowKeys) => {
            onSelectionChange(selectedRowKeys as string[])
          },
        }}
        style={{
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadius,
        }}
      />
    </div>
  )
}

export function Recycle() {
  const { token } = theme.useToken()
  const { t } = useTranslation()
  const { recyleRawData } = useMenuHelpersContext()
  const [selectedRecycleIds, setSelectedRecycleIds] = useState<SelectedRecycleIds>(
    EMPTY_SELECTED_RECYCLE_IDS,
  )

  useEffect(() => {
    setSelectedRecycleIds((current) => normalizeSelectedRecycleIds(recyleRawData, current))
  }, [recyleRawData])

  return (
    <ConfigProvider
      theme={{
        components: {
          Table: {
            headerColor: token.colorTextSecondary,
            headerBg: token.colorBgContainer,
          },
        },
      }}
    >
      <Tabs
        hideAdd
        className="[&_>_.ant-tabs-nav]:px-tabContent"
        hidden={false}
        items={RECYCLE_TAB_KEYS.map((key) => ({
          key,
          label: t(API_MENU_CONFIG[key].titleKey),
          children: (
            <div className="p-tabContent">
              <RecycleTable
                catalogType={key}
                selectedRecycleIds={selectedRecycleIds[key]}
                onSelectionChange={(nextSelectedRecycleIds) => {
                  setSelectedRecycleIds((current) => ({
                    ...current,
                    [key]: nextSelectedRecycleIds,
                  }))
                }}
              />
            </div>
          ),
        }))}
      />
    </ConfigProvider>
  )
}
