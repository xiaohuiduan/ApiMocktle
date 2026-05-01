import { useMemo, useState } from 'react'

import { Button, Modal, Typography, message } from 'antd'
import type { CheckboxChangeEvent } from 'antd/es/checkbox'
import { Checkbox } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { Tree } from 'antd'
import { DownloadIcon } from 'lucide-react'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'
import { MenuItemType } from '@/enums'
import type { ApiMenuData } from '@/components/ApiMenu'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import type { ApiDetails } from '@/types'
import { downloadMhtml } from '@/utils/api-doc-html'

interface ProjectInfo {
  id: string
  name: string
}

export function ExportPanel({ projectId }: { projectId?: string }) {
  const { sessionId } = useAuth()
  const { menuRawList } = useMenuHelpersContext()
  const [msgApi, contextHolder] = message.useMessage()

  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [checkedApiIds, setCheckedApiIds] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  const apiTreeData = useMemo((): DataNode[] => {
    if (!menuRawList) return []

    const apis = menuRawList.filter((item) => item.type === MenuItemType.ApiDetail)
    const childrenMap = new Map<string, ApiMenuData[]>()
    const topLevel: ApiMenuData[] = []

    for (const api of apis) {
      if (api.parentId) {
        const children = childrenMap.get(api.parentId) ?? []
        children.push(api)
        childrenMap.set(api.parentId, children)
      } else {
        topLevel.push(api)
      }
    }

    function buildNodes(items: ApiMenuData[]): DataNode[] {
      return items.map((item) => ({
        key: item.id,
        title: `${(item.data as { method?: string })?.method ?? 'GET'} ${(item.data as { path?: string })?.path ?? item.name}`,
      }))
    }

    const folders = menuRawList.filter((f) => f.type === MenuItemType.ApiDetailFolder)
    const folderNodes = folders.map((folder) => ({
      key: folder.id,
      title: folder.name,
      selectable: false,
      checkable: false,
      children: buildNodes(childrenMap.get(folder.id) ?? []),
    }))

    return [...folderNodes, ...buildNodes(topLevel)]
  }, [menuRawList])

  const allApiIds = useMemo(() => {
    if (!menuRawList) return []
    return menuRawList.filter((i) => i.type === MenuItemType.ApiDetail).map((i) => i.id)
  }, [menuRawList])

  const isAllChecked = allApiIds.length > 0 && checkedApiIds.size === allApiIds.length
  const isIndeterminate = checkedApiIds.size > 0 && checkedApiIds.size < allApiIds.length

  const handleExport = async () => {
    if (!projectId || !sessionId) return
    if (checkedApiIds.size === 0) {
      msgApi.error('请至少选择一个接口')
      return
    }

    try {
      setExporting(true)

      // Get project name
      const projectPayload = await api<{ project: ProjectInfo }>('get_project', {
        sessionId,
        projectId,
      })
      const projectName = projectPayload.project?.name ?? 'API文档'

      // Collect selected API items with their full data (only ApiDetail type)
      const selectedItems = menuRawList!
        .filter((item) => checkedApiIds.has(item.id) && item.type === MenuItemType.ApiDetail && item.data)
        .map((item) => ({
          id: item.id,
          name: item.name,
          data: item.data as import('@/types').ApiDetails,
        }))

      if (selectedItems.length === 0) {
        msgApi.error('所选接口暂无数据')
        return
      }

      // Generate and show save dialog
      const saved = await downloadMhtml(projectName, selectedItems)
      if (saved) {
        msgApi.success(`已导出 ${selectedItems.length} 个接口`)
        setExportModalOpen(false)
      }
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err as Error).message || String(err)
      msgApi.error(msg || '导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  const openExportModal = () => {
    setCheckedApiIds(new Set(allApiIds))
    setExportModalOpen(true)
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {contextHolder}

      <div className="flex items-center justify-between">
        <Button type="primary" icon={<DownloadIcon size={14} />} onClick={openExportModal}>
          接口分享
        </Button>
      </div>

      <Modal
        destroyOnClose
        open={exportModalOpen}
        title="接口分享 — 导出 MHTML 文档"
        width={640}
        onCancel={() => setExportModalOpen(false)}
        onOk={() => void handleExport()}
        okText="导出"
        confirmLoading={exporting}
      >
        <div className="flex flex-col gap-4">
          <div>
            <Typography.Text className="mb-2 block text-sm">选择要导出的接口</Typography.Text>
            <div className="mb-2">
              <Checkbox
                checked={isAllChecked}
                indeterminate={isIndeterminate}
                onChange={(e: CheckboxChangeEvent) => {
                  setCheckedApiIds(e.target.checked ? new Set(allApiIds) : new Set())
                }}
              >
                全选 / 取消全选
              </Checkbox>
            </div>
            {apiTreeData.length > 0
              ? (
                  <Tree
                    checkable
                    blockNode
                    checkedKeys={Array.from(checkedApiIds)}
                    defaultExpandAll
                    style={{ maxHeight: 300, overflow: 'auto' }}
                    treeData={apiTreeData}
                    onCheck={(checkedKeys) => {
                      const keys = Array.isArray(checkedKeys)
                        ? checkedKeys
                        : checkedKeys.checked
                      setCheckedApiIds(new Set(keys as string[]))
                    }}
                  />
                )
              : (
                  <Typography.Text type="secondary">暂无接口数据</Typography.Text>
                )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
