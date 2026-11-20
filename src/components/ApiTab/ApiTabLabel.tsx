import { useTranslation } from 'react-i18next'

import { Spin, theme } from 'antd'

import type { ApiMenuData } from '@/components/ApiMenu'
import { PageTabStatus } from '@/components/ApiTab/ApiTab.enum'
import type { ApiTabItem } from '@/components/ApiTab/ApiTab.type'
import { FolderIcon } from '@/components/icons/FolderIcon'
import { HttpMethodText } from '@/components/icons/HttpMethodText'
import { API_MENU_CONFIG } from '@/configs/static'
import { initialCreateApiDetailsData } from '@/data/remote'
import { CatalogType, MenuItemType } from '@/enums'
import { getCatalogType, getCreateType, hasAccentColor, isCreateType } from '@/helpers'

interface ApiTabLabelProps {
  menuData?: ApiMenuData
  tabItem: ApiTabItem
}

/** 目录页签的 contentType 集合（`const enum` 无法用 Object.values，显式列出）。 */
const CATALOG_TAB_TYPES: ReadonlySet<string> = new Set([
  CatalogType.Overview,
  CatalogType.Recycle,
  CatalogType.Http,
  CatalogType.Schema,
  CatalogType.Request,
  CatalogType.Markdown,
])

/** 页签 label 是否为「内置目录页签」而非用户数据。 */
function isCatalogTab(contentType: ApiTabItem['contentType']): contentType is CatalogType {
  return CATALOG_TAB_TYPES.has(contentType)
}

export function ApiTabLabel(props: ApiTabLabelProps) {
  const { menuData, tabItem } = props
  const { token } = theme.useToken()
  const { t } = useTranslation()

  const editStatus = tabItem.data?.editStatus

  // 状态标记优先级：保存中 > 保存失败 > 未保存（黄色 *，与参数有内容的绿色 * 区分）
  const showSaving = editStatus === 'saving'
  const showError = editStatus === 'error'
  const showUnsaved = !showSaving && !showError
    && (editStatus === 'changed' || tabItem.data?.tabStatus === PageTabStatus.Create)

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
      {/*
        目录页签的 label 存的是「目录类型」而非翻译结果：页签状态会被持久化，
        若存翻译后的文案，切换语言后旧文案会残留。用户数据页签才用 label 原文。
      */}
      <span>
        {menuData?.name
          ?? (isCatalogTab(tabItem.contentType)
            ? t(API_MENU_CONFIG[tabItem.contentType].titleKey)
            : tabItem.label)}
      </span>
      {showSaving && (
        <Spin
          aria-label={t('app.tabBar.saving')}
          className="ml-0.5"
          size="small"
          style={{ color: token.colorPrimary }}
        />
      )}
      {showError && (
        <span
          aria-label={t('app.tabBar.saveFailed')}
          className="ml-0.5 text-xs font-bold"
          style={{ color: token.colorError }}
        >
          !
        </span>
      )}
      {showUnsaved && (
        <span
          aria-label={t('app.tabBar.unsaved')}
          className="ml-0.5 text-xs"
          style={{ color: token.colorWarning }}
        >
          *
        </span>
      )}
    </span>
  )
}
