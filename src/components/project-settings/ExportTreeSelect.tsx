import { useMemo, useState } from 'react'

import { Checkbox, Input, Tree, Typography } from 'antd'
import type { CheckboxChangeEvent } from 'antd/es/checkbox'
import type { DataNode } from 'antd/es/tree'
import { SearchIcon } from 'lucide-react'

import type { ApiMenuData } from '@/components/ApiMenu'
import { ApiTreeTitle } from '@/components/project-settings/ApiTreeTitle'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { MenuItemType } from '@/enums'
import { getAllApiIds, menuItemMatchesSearch } from '@/helpers'

interface ExportTreeSelectProps {
  checkedApiIds: Set<string>
  onChange: (next: Set<string>) => void
}

interface ExportTree {
  treeData: DataNode[]
  /** 树中实际渲染出来的接口 id */
  renderedApiIds: Set<string>
  /** 没有搜索词时树里能渲染的接口 id（父目录缺失的接口不在其中） */
  selectableApiIds: Set<string>
}

/**
 * 构建导出用的接口树：按搜索词筛出可见接口，并保留其所属目录。
 * 目录名命中搜索词时，该目录下的全部接口都可见（便于整目录导出）。
 */
function buildExportTree(menuRawList: ApiMenuData[], query: string): ExportTree {
  const apis = menuRawList.filter((item) => item.type === MenuItemType.ApiDetail)
  const folders = menuRawList.filter((item) => item.type === MenuItemType.ApiDetailFolder)
  const folderIds = new Set(folders.map((folder) => folder.id))
  const q = query.trim()

  // 父目录不存在的接口建不出树节点，只能由「全选」勾上，不参与树内勾选
  const treeApis = apis.filter((api) => !api.parentId || folderIds.has(api.parentId))
  const selectableApiIds = new Set(treeApis.map((api) => api.id))
  const visibleApiIds = new Set<string>()

  if (!q) {
    for (const api of treeApis) {
      visibleApiIds.add(api.id)
    }
  }
  else {
    for (const api of treeApis) {
      if (menuItemMatchesSearch(api, q)) {
        visibleApiIds.add(api.id)
      }
    }

    for (const folder of folders) {
      if (!menuItemMatchesSearch(folder, q)) {
        continue
      }

      for (const api of treeApis) {
        if (api.parentId === folder.id) {
          visibleApiIds.add(api.id)
        }
      }
    }
  }

  const childrenMap = new Map<string, ApiMenuData[]>()
  const topLevel: ApiMenuData[] = []

  for (const api of treeApis) {
    if (!visibleApiIds.has(api.id)) {
      continue
    }

    if (api.parentId) {
      const children = childrenMap.get(api.parentId) ?? []

      children.push(api)
      childrenMap.set(api.parentId, children)
    }
    else {
      topLevel.push(api)
    }
  }

  const folderNodes: DataNode[] = []
  const renderedApiIds = new Set<string>()

  for (const folder of folders) {
    const children = childrenMap.get(folder.id) ?? []

    if (children.length > 0) {
      children.forEach((item) => renderedApiIds.add(item.id))
      folderNodes.push({
        key: folder.id,
        title: folder.name,
        selectable: false,
        children: children.map((item) => ({ key: item.id, title: <ApiTreeTitle item={item} /> })),
      })
    }
  }

  for (const item of topLevel) {
    renderedApiIds.add(item.id)
  }

  const topNodes = topLevel.map((item) => ({ key: item.id, title: <ApiTreeTitle item={item} /> }))

  return {
    treeData: [...folderNodes, ...topNodes],
    renderedApiIds,
    selectableApiIds,
  }
}

/**
 * 导出弹窗里的接口选择树，支持按接口名、路径、请求方法模糊查询。
 * 搜索只影响树的显示，导出范围始终是已选集合的全集。
 */
export function ExportTreeSelect(props: ExportTreeSelectProps) {
  const { checkedApiIds, onChange } = props
  const { menuRawList } = useMenuHelpersContext()
  const [query, setQuery] = useState('')

  const list = useMemo(() => menuRawList ?? [], [menuRawList])
  const { treeData, renderedApiIds, selectableApiIds } = useMemo(
    () => buildExportTree(list, query),
    [list, query],
  )
  const allApiIds = useMemo(() => getAllApiIds(list), [list])

  const isAllChecked = allApiIds.length > 0 && checkedApiIds.size === allApiIds.length
  const isIndeterminate = checkedApiIds.size > 0 && checkedApiIds.size < allApiIds.length
  const hasQuery = query.trim().length > 0

  // 只把树里渲染出来的接口的勾选状态交给 antd Tree，避免它丢弃不存在的 key
  const checkedKeys = useMemo(
    () => Array.from(checkedApiIds).filter((id) => renderedApiIds.has(id)),
    [checkedApiIds, renderedApiIds],
  )

  const handleCheck = (keys: React.Key[]) => {
    const next = new Set<string>()

    // 搜索只影响可见性：被搜索词隐藏的已选项保持勾选，导出范围不受搜索影响
    for (const id of checkedApiIds) {
      if (selectableApiIds.has(id) && !renderedApiIds.has(id)) {
        next.add(id)
      }
    }

    // antd 勾选回调返回全部已勾选的节点 key（目录 key 与其子项都在其中），只取接口 id
    for (const key of keys) {
      const id = String(key)

      if (renderedApiIds.has(id)) {
        next.add(id)
      }
    }

    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        allowClear
        placeholder="搜索接口名称、路径或请求方法"
        prefix={<SearchIcon size={14} />}
        value={query}
        onChange={(e) => { setQuery(e.target.value) }}
      />

      <div className="flex items-center justify-between gap-2">
        <Checkbox
          checked={isAllChecked}
          indeterminate={isIndeterminate}
          onChange={(e: CheckboxChangeEvent) => {
            onChange(e.target.checked ? new Set(allApiIds) : new Set())
          }}
        >
          全选 / 取消全选
        </Checkbox>
        <Typography.Text className="text-xs" type="secondary">
          已选 {checkedApiIds.size} / 共 {allApiIds.length}
        </Typography.Text>
      </div>

      {hasQuery && (
        <Typography.Text className="text-xs" type="secondary">
          导出范围以「已选 {checkedApiIds.size}」为准，搜索只影响树的显示
        </Typography.Text>
      )}

      {treeData.length > 0
        ? (
            <Tree
              blockNode
              checkable
              defaultExpandAll
              checkedKeys={checkedKeys}
              style={{ maxHeight: 300, overflow: 'auto' }}
              treeData={treeData}
              onCheck={(checkedKeys) => {
                const keys = Array.isArray(checkedKeys) ? checkedKeys : checkedKeys.checked

                handleCheck(keys)
              }}
            />
          )
        : (
            <Typography.Text type="secondary">
              {hasQuery ? '没有匹配的接口' : '暂无接口数据'}
            </Typography.Text>
          )}
    </div>
  )
}
