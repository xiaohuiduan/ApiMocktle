import { Button, Popconfirm } from 'antd'

import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { useMenuTabHelpers } from '@/contexts/menu-tab-settings'

export function ApiRemoveButton(props: { tabKey: string }) {
  const { tabKey } = props

  const { removeMenuItem, discardDraft } = useMenuHelpersContext()
  const { removeTabItem } = useMenuTabHelpers()

  return (
    <Popconfirm
      placement="bottom"
      title="确定删除该接口？"
      onConfirm={() => {
        removeTabItem({ key: tabKey })
        void removeMenuItem({ id: tabKey }).then((ok) => {
          if (ok) {
            discardDraft(tabKey)
          }
        })
      }}
    >
      <Button>删除</Button>
    </Popconfirm>
  )
}
