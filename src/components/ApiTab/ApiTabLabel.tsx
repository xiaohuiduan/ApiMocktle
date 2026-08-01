import { theme } from 'antd'

import type { ApiMenuData } from '@/components/ApiMenu'
import { PageTabStatus } from '@/components/ApiTab/ApiTab.enum'
import type { ApiTabItem } from '@/components/ApiTab/ApiTab.type'
import { FolderIcon } from '@/components/icons/FolderIcon'
import { HttpMethodText } from '@/components/icons/HttpMethodText'
import { API_MENU_CONFIG } from '@/configs/static'
import { initialCreateApiDetailsData } from '@/data/remote'
import { MenuItemType } from '@/enums'
import { getCatalogType, getCreateType, hasAccentColor, isCreateType } from '@/helpers'

interface ApiTabLabelProps {
  menuData?: ApiMenuData
  tabItem: ApiTabItem
}

export function ApiTabLabel(props: ApiTabLabelProps) {
  const { menuData, tabItem } = props
  const { token } = theme.useToken()

  // 未保存标记：编辑中或新建中的标签显示黄色 *（与参数有内容的绿色 * 区分）
  const hasUnsaved = tabItem.data?.editStatus === 'changed'
    || tabItem.data?.tabStatus === PageTabStatus.Create

  return (
    <span className="ui-tabs-tab-label flex items-center gap-1">
      {menuData?.type === MenuItemType.ApiDetail || menuData?.type === MenuItemType.HttpRequest
        ? (
            <span className="mr-1 font-semibold">
              <HttpMethodText method={menuData.data?.method} />
            </span>
          )
        : tabItem.contentType === MenuItemType.ApiDetail
          && tabItem.data?.tabStatus === PageTabStatus.Create
          ? (
              <span className="mr-1 font-semibold">
                <HttpMethodText method={initialCreateApiDetailsData.method} />
              </span>
            )
          : (
              <FolderIcon
                size={16}
                style={{
                  color:
              isCreateType(tabItem.contentType) && hasAccentColor(tabItem.contentType)
                ? API_MENU_CONFIG[getCatalogType(getCreateType(tabItem.contentType))].accentColor
                : undefined,
                }}
                type={tabItem.contentType}
              />
            )}
      <span>{menuData?.name ?? tabItem.label}</span>
      {hasUnsaved && (
        <span
          aria-label="有未保存修改"
          className="ml-0.5 text-xs"
          style={{ color: token.colorWarning }}
        >
          *
        </span>
      )}
    </span>
  )
}
