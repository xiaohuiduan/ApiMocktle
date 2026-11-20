import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Table } from 'antd'

import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { HttpMethodText } from '@/components/icons/HttpMethodText'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { MenuItemType } from '@/enums'
import { findChildrenById, findFolders } from '@/helpers'
import type { ApiDetails } from '@/types'

interface DataSource extends ApiDetails {
  groupPath?: string
}

export function FolderApiList() {
  const { t } = useTranslation()
  const { menuRawList } = useMenuHelpersContext()
  const { tabData } = useTabContentContext()

  const dataSource = useMemo(() => {
    if (menuRawList) {
      return findChildrenById(menuRawList, tabData.key)
        .filter((it) => it.type === MenuItemType.ApiDetail)
        .map((item) => {
          const groupPath
            = item.parentId
              && findFolders(menuRawList, [], item.parentId)
                .map((it) => it.name)
                .join(' / ')

          if (item.data) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            return { ...(item.data as ApiDetails), groupPath }
          }

          throw Error()
        })
    }
  }, [menuRawList, tabData])

  return (
    <div>
      <Table<DataSource>
        columns={[
          { title: t('api.folder.apiName'), dataIndex: 'name' },
          {
            title: t('api.folder.method'),
            dataIndex: 'method',
            render: (method) => (
              <HttpMethodText className="text-xs font-semibold" method={method} />
            ),
          },
          { title: t('api.folder.path'), dataIndex: 'path' },
          { title: t('api.folder.group'), dataIndex: 'groupPath' },
        ]}
        dataSource={dataSource}
        rowKey="id"
        rowSelection={{}}
      />
    </div>
  )
}
