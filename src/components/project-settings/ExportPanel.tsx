import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, message, Modal, Typography } from 'antd'
import { DownloadIcon, GlobeIcon } from 'lucide-react'

import { api } from '@/api-client'
import { ExportTreeSelect } from '@/components/project-settings/ExportTreeSelect'
import { useAuth } from '@/contexts/auth'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { MenuItemType } from '@/enums'
import { getAllApiIds } from '@/helpers'
import type { ApiDetails } from '@/types'
import { downloadMarkdown, type ExportTreeInput } from '@/utils/api-doc-markdown'
import { downloadMhtml } from '@/utils/api-doc-mhtml'

interface ProjectInfo {
  id: string
  name: string
}

export function ExportPanel({ projectId }: { projectId?: string }) {
  const { t } = useTranslation()
  const { sessionId } = useAuth()
  const { menuRawList } = useMenuHelpersContext()
  const [msgApi, contextHolder] = message.useMessage()

  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<'markdown' | 'mhtml'>('markdown')
  const [checkedApiIds, setCheckedApiIds] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  const handleExport = async (format: 'markdown' | 'mhtml') => {
    if (!projectId || !sessionId) {
      return
    }

    if (checkedApiIds.size === 0) {
      msgApi.error(t('settings.export.selectAtLeastOne'))

      return
    }

    try {
      setExporting(true)

      // Get project name
      const projectPayload = await api<{ project: ProjectInfo }>('get_project', {
        sessionId,
        projectId,
      })
      const projectName = projectPayload.project.name

      // Collect selected API items with their full data (only ApiDetail type)
      const apiItems = menuRawList!
        .filter((item) => checkedApiIds.has(item.id) && item.type === MenuItemType.ApiDetail && item.data)
        .map((item) => ({
          id: item.id,
          name: item.name,
          parentId: item.parentId,
          data: item.data as ApiDetails,
        }))

      if (apiItems.length === 0) {
        msgApi.error(t('settings.export.noSelectedData'))

        return
      }

      // Build folder tree from menuRawList
      const folders = menuRawList!.filter((f) => f.type === MenuItemType.ApiDetailFolder)
      const treeInput: ExportTreeInput = { folders: [], ungrouped: [], totalCount: apiItems.length }

      for (const folder of folders) {
        const children = apiItems.filter((api) => api.parentId === folder.id)

        if (children.length > 0) {
          treeInput.folders.push({
            name: folder.name,
            children: children.map(({ id, name, data }) => ({ id, name, data })),
          })
        }
      }

      treeInput.ungrouped = apiItems
        .filter((api) => !api.parentId || !folders.some((f) => f.id === api.parentId))
        .map(({ id, name, data }) => ({ id, name, data }))

      // Generate and show save dialog
      const saved = format === 'markdown'
        ? await downloadMarkdown(projectName, treeInput)
        : await downloadMhtml(projectName, treeInput)

      if (saved) {
        msgApi.success(t('settings.export.exported', { count: treeInput.totalCount }))
        setExportModalOpen(false)
      }
    }
    catch (err) {
      const msg = typeof err === 'string' ? err : (err as Error).message || String(err)
      msgApi.error(msg || t('settings.export.failed'))
    }
    finally {
      setExporting(false)
    }
  }

  const openExportModal = (format: 'markdown' | 'mhtml') => {
    setExportFormat(format)
    setCheckedApiIds(new Set(getAllApiIds(menuRawList ?? [])))
    setExportModalOpen(true)
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {contextHolder}

      <div className="flex items-center gap-2">
        <Button icon={<DownloadIcon size={14} />} type="primary" onClick={() => { openExportModal('markdown') }}>
          {t('settings.export.exportMarkdown')}
        </Button>
        <Button icon={<GlobeIcon size={14} />} onClick={() => { openExportModal('mhtml') }}>
          {t('settings.export.exportMhtml')}
        </Button>
      </div>

      <Modal
        destroyOnClose
        confirmLoading={exporting}
        okText={t('settings.export.ok')}
        open={exportModalOpen}
        title={exportFormat === 'markdown' ? t('settings.export.markdownTitle') : t('settings.export.mhtmlTitle')}
        width={640}
        onCancel={() => { setExportModalOpen(false) }}
        onOk={() => void handleExport(exportFormat)}
      >
        <div className="flex flex-col gap-4">
          <div>
            <Typography.Text className="mb-2 block text-sm">{t('settings.transfer.selectExportApis')}</Typography.Text>
            <ExportTreeSelect checkedApiIds={checkedApiIds} onChange={setCheckedApiIds} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
