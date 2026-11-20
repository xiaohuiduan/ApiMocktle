import { useTranslation } from 'react-i18next'

import { Button, Popconfirm } from 'antd'

import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useMenuTabHelpers } from '@/contexts/menu-tab-settings'

export function ApiRemoveButton(props: { tabKey: string }) {
  const { tabKey } = props
  const { t } = useTranslation()

  const { removeMenuItem, discardDraft } = useMenuHelpersContext()
  const { removeTabItem } = useMenuTabHelpers()

  return (
    <Popconfirm
      placement="bottom"
      title={t('api.doc.confirmDeleteApi')}
      onConfirm={() => {
        removeTabItem({ key: tabKey })
        void removeMenuItem({ id: tabKey }).then((ok) => {
          if (ok) {
            discardDraft(tabKey)
          }
        })
      }}
    >
      <Button>{t('common.delete')}</Button>
    </Popconfirm>
  )
}
