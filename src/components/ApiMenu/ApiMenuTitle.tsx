import { theme, Tooltip } from 'antd'

import { AppMenuControls } from '@/components/ApiMenu/AppMenuControls'
import { DropdownActions } from '@/components/ApiMenu/DropdownActions'
import { isMenuFolder } from '@/helpers'

import type { CatalogDataNode } from './ApiMenu.type'

interface ApiMenuTitleProps {
  node: CatalogDataNode
  name: string
  /** 类型图标(GET/POST 徽标、文件图标等):可拖节点时由 icon 槽移入此处,渲染在名称左侧 */
  leadingIcon?: React.ReactNode
  actions?: React.ReactNode
}

/**
 * 普通菜单项标题。
 */
export function ApiMenuTitle(props: ApiMenuTitleProps) {
  const { token } = theme.useToken()

  const { node, name, leadingIcon, actions } = props

  const catalog = node.customData.catalog
  const isFolder = isMenuFolder(catalog.type)
  const isDraft = catalog.__isDraft === true

  const count = isFolder ? node.customData.leafCount ?? 0 : 0

  return (
    <DropdownActions catalog={catalog} isFolder={isFolder} trigger={['contextMenu']}>
      <span className="flex w-full items-center truncate">
        {leadingIcon}

        <span className="flex items-center truncate pr-1">
          <span className="truncate">{name}</span>

          {isDraft && (
            <Tooltip title="未保存">
              <span className="ml-0.5 shrink-0" style={{ color: token.colorError }}>*</span>
            </Tooltip>
          )}

          {isFolder && count > 0 && (
            <span className="ml-1 text-xs" style={{ color: token.colorTextTertiary }}>
              ({count})
            </span>
          )}
        </span>

        <AppMenuControls>{actions}</AppMenuControls>
      </span>
    </DropdownActions>
  )
}
