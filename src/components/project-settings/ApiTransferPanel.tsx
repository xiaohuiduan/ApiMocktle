import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'

import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { Button, Input, message, Modal, Progress, Space, theme, Typography } from 'antd'

import { api } from '@/api-client'
import { ExportPanel } from '@/components/project-settings/ExportPanel'
import { ExportTreeSelect } from '@/components/project-settings/ExportTreeSelect'
import { useAuth } from '@/contexts/auth'
import { type ProjectStateSnapshot, useMenuHelpersContext } from '@/contexts/menu-helpers'
import { getAllApiIds } from '@/helpers'

function resolveProjectId(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)

  return parts.at(0) === 'projects' ? parts.at(1) : undefined
}

async function saveExportFile(specName: string, format: string, content: string) {
  const ext = format === 'yaml' ? 'yaml' : 'json'
  const filePath = await save({
    defaultPath: `${specName}.${ext}`,
    filters: [{ name: format === 'yaml' ? 'YAML' : 'JSON', extensions: [ext] }],
  })

  if (filePath) {
    await invoke('write_export_file', { path: filePath, content })

    return true
  }

  return false
}

function pickImportFile(onSelect: (file: File) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.yaml,.yml'

  input.onchange = () => {
    const file = input.files?.item(0)

    if (file) {
      onSelect(file)
    }
  }

  input.click()
}

function countOpenApiPaths(content: string): number | null {
  try {
    const doc = JSON.parse(content) as { paths?: unknown }

    if (doc.paths && typeof doc.paths === 'object') {
      return Object.keys(doc.paths).length
    }
  }
  catch {
    // YAML 或其它格式无法用 JSON 统计
  }

  return null
}

export function ApiTransferPanel() {
  const { t } = useTranslation()
  const { token } = theme.useToken()
  const { pathname } = useLocation()
  const { sessionId } = useAuth()
  const { applyServerState, reloadState, menuRawList } = useMenuHelpersContext()
  const [msgApi, contextHolder] = message.useMessage()
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importFileName, setImportFileName] = useState<string>()
  const [importUrl, setImportUrl] = useState('')
  const [isUrlImporting, setIsUrlImporting] = useState(false)

  // 选择性导出
  const [selectModalOpen, setSelectModalOpen] = useState(false)
  const [checkedApiIds, setCheckedApiIds] = useState<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)

  const projectId = useMemo(() => resolveProjectId(pathname), [pathname])

  const initSelectiveExport = () => {
    setCheckedApiIds(new Set(getAllApiIds(menuRawList ?? [])))
    setSelectModalOpen(true)
  }

  const handleSelectiveExport = async (specFormat: 'openapi' | 'swagger') => {
    if (!projectId || !sessionId) {
      msgApi.error(t('settings.transfer.notInProjectExport'))

      return
    }

    if (checkedApiIds.size === 0) {
      msgApi.error(t('settings.export.selectAtLeastOne'))

      return
    }

    setIsExporting(true)

    try {
      const menuIds = Array.from(checkedApiIds).join(',')
      const formatParam = specFormat === 'swagger' ? 'swagger' : 'json'
      const payload = await api<{ content: string, format: string }>('export_openapi', {
        sessionId,
        projectId,
        format: formatParam,
        menuIds,
      })
      const specName = specFormat === 'swagger' ? 'swagger' : 'openapi'
      const saved = await saveExportFile(specName, 'json', payload.content)

      if (saved) {
        setSelectModalOpen(false)
      }
    }
    catch (err) {
      msgApi.error((err as Error).message)
    }
    finally {
      setIsExporting(false)
    }
  }

  const handleExport = async (format: 'json' | 'yaml') => {
    if (!projectId || !sessionId) {
      msgApi.error(t('settings.transfer.notInProjectExport'))

      return
    }

    try {
      const payload = await api<{ content: string, format: string }>('export_openapi', {
        sessionId,
        projectId,
        format,
      })
      await saveExportFile('openapi', format, payload.content)
    }
    catch (err) {
      msgApi.error((err as Error).message)
    }
  }

  const handleExportSwagger = async () => {
    if (!projectId || !sessionId) {
      msgApi.error(t('settings.transfer.notInProjectExport'))

      return
    }

    try {
      const payload = await api<{ content: string, format: string }>('export_openapi', {
        sessionId,
        projectId,
        format: 'swagger',
      })
      await saveExportFile('swagger', 'json', payload.content)
    }
    catch (err) {
      msgApi.error((err as Error).message)
    }
  }

  const doImport = async (file: File) => {
    if (!projectId || !sessionId) {
      msgApi.error(t('settings.transfer.notInProjectImport'))

      return
    }

    setIsImporting(true)
    setImportProgress(0)
    setImportFileName(file.name)
    msgApi.open({ key: 'api-import', type: 'loading', content: t('settings.transfer.importing', { percent: 0 }), duration: 0 })

    try {
      const content = await file.text()
      setImportProgress(50)
      msgApi.open({ key: 'api-import', type: 'loading', content: t('settings.transfer.importing', { percent: 50 }), duration: 0 })

      const format = file.name.endsWith('.yaml') || file.name.endsWith('.yml')
        ? 'yaml'
        : file.name.endsWith('.json')
          ? 'json'
          : 'auto'

      // 来源标识 = 文件名（不含扩展名）：不同来源的同名接口 / 目录 / 模型互不覆盖
      const source = file.name.replace(/\.[^.]+$/, '')

      const payload = await api<{ imported: { format: string }, state?: ProjectStateSnapshot }>('import_api_document', {
        sessionId,
        projectId,
        payload: { format, content, source },
      })

      if (payload.state) {
        applyServerState(payload.state)
      }
      else {
        await reloadState()
      }

      setImportProgress(100)
      msgApi.open({ key: 'api-import', type: 'success', content: t('settings.transfer.importSuccess') })
    }
    catch (error) {
      msgApi.open({
        key: 'api-import',
        type: 'error',
        content: error instanceof Error ? error.message : t('settings.transfer.importFailed'),
      })
    }
    finally {
      setIsImporting(false)
    }
  }

  const handleImport = async (file: File) => {
    if (!projectId || !sessionId) {
      msgApi.error(t('settings.transfer.notInProjectImport'))

      return
    }

    let pathsCount: number | null = null

    try {
      pathsCount = countOpenApiPaths(await file.text())
    }
    catch {
      // 忽略读取失败，仍允许确认
    }

    Modal.confirm({
      title: t('settings.transfer.importConfirmTitle'),
      content: pathsCount !== null
        ? t('settings.transfer.importConfirmWithPaths', { count: pathsCount })
        : t('settings.transfer.importConfirmContent'),
      okText: t('settings.transfer.startImport'),
      cancelText: t('common.cancel'),
      onOk: () => doImport(file),
    })
  }

  const handleImportFromUrl = () => {
    if (!projectId || !sessionId) {
      msgApi.error(t('settings.transfer.notInProjectImport'))

      return
    }

    Modal.confirm({
      title: t('settings.transfer.importFromUrlTitle'),
      content: t('settings.transfer.importConfirmContent'),
      okText: t('settings.transfer.startImport'),
      cancelText: t('common.cancel'),
      onOk: () => doImportFromUrl(),
    })
  }

  const doImportFromUrl = async () => {
    if (!projectId || !sessionId) {
      msgApi.error(t('settings.transfer.notInProjectImport'))

      return
    }

    const trimmed = importUrl.trim()

    if (!trimmed) {
      msgApi.error(t('settings.transfer.urlRequired'))

      return
    }

    let parsed: URL

    try {
      parsed = new URL(trimmed)
    }
    catch {
      msgApi.error(t('settings.transfer.urlInvalid'))

      return
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      msgApi.error(t('settings.transfer.urlProtocol'))

      return
    }

    setIsUrlImporting(true)
    msgApi.open({ key: 'api-import-url', type: 'loading', content: t('settings.transfer.urlImporting'), duration: 0 })

    try {
      const response = await fetch(trimmed)

      if (!response.ok) {
        throw new Error(t('settings.transfer.downloadFailed', { status: response.status }))
      }

      const content = await response.text()

      // 链接导入：用链接本身当来源标识，避免与其它来源的同名接口互相覆盖
      const source = trimmed

      const payload = await api<{ imported: { format: string }, state?: ProjectStateSnapshot }>('import_api_document', {
        sessionId,
        projectId,
        payload: { format: 'auto', content, source },
      })

      if (payload.state) {
        applyServerState(payload.state)
      }
      else {
        await reloadState()
      }

      msgApi.open({ key: 'api-import-url', type: 'success', content: t('settings.transfer.importSuccess') })
    }
    catch (error) {
      msgApi.open({
        key: 'api-import-url',
        type: 'error',
        content: error instanceof Error ? error.message : t('settings.transfer.importFailed'),
      })
    }
    finally {
      setIsUrlImporting(false)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {contextHolder}

      <section
        className="rounded-xl border border-solid p-5"
        style={{ borderColor: token.colorBorderSecondary, backgroundColor: token.colorFillAlter }}
      >
        <Typography.Title level={4}>{t('settings.transfer.importSectionTitle')}</Typography.Title>
        <Typography.Paragraph type="secondary">
          {t('settings.transfer.importDescription')}
        </Typography.Paragraph>
        <Typography.Paragraph className="!mb-4" type="secondary">
          {t('settings.transfer.importUrlHint')}
        </Typography.Paragraph>

        <Space className="w-full max-w-2xl" direction="vertical" size={12}>
          <div>
            <Typography.Text className="mb-2 block text-sm" type="secondary">
              {t('settings.transfer.importUrlLabel')}
            </Typography.Text>
            <Space.Compact className="w-full">
              <Input
                allowClear
                disabled={isImporting || isUrlImporting}
                placeholder="https://example.com/v3/api-docs"
                value={importUrl}
                onChange={(e) => { setImportUrl(e.target.value) }}
                onPressEnter={() => {
                  handleImportFromUrl()
                }}
              />
              <Button
                disabled={isImporting || isUrlImporting}
                loading={isUrlImporting}
                type="primary"
                onClick={() => { handleImportFromUrl() }}
              >
                {t('settings.transfer.importFromUrl')}
              </Button>
            </Space.Compact>
          </div>

          <Button
            disabled={isImporting || isUrlImporting}
            loading={isImporting}
            type="primary"
            onClick={() => {
              pickImportFile((file) => {
                void handleImport(file)
              })
            }}
          >
            {t('settings.transfer.selectFile')}
          </Button>

          {isImporting && (
            <div className="w-full max-w-md">
              <div className="mb-1 text-xs" style={{ color: token.colorTextSecondary }}>
                {t('settings.transfer.importingFile', { name: importFileName ?? t('settings.transfer.importFileFallback') })}
              </div>
              <Progress percent={importProgress} size="small" status="active" />
            </div>
          )}
        </Space>
      </section>

      <section
        className="rounded-xl border border-solid p-5"
        style={{ borderColor: token.colorBorderSecondary }}
      >
        <Typography.Title level={5}>{t('settings.transfer.exportSectionTitle')}</Typography.Title>
        <Typography.Paragraph className="!mb-4" type="secondary">
          {t('settings.transfer.exportDescription')}
        </Typography.Paragraph>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Typography.Text className="text-xs" type="secondary">
              {t('settings.transfer.formatLabel', { format: 'OpenAPI 3.0' })}
            </Typography.Text>
            <Space size={8}>
              <Button size="small" onClick={() => void handleExport('json')}>{t('settings.transfer.exportJson')}</Button>
              <Button size="small" onClick={() => void handleExport('yaml')}>{t('settings.transfer.exportYaml')}</Button>
            </Space>
          </div>
          <div className="flex items-center gap-2">
            <Typography.Text className="text-xs" type="secondary">
              {t('settings.transfer.formatLabel', { format: 'Swagger 2.0' })}
            </Typography.Text>
            <Space size={8}>
              <Button
                size="small"
                onClick={() => {
                  void handleExportSwagger()
                }}
              >
                {t('settings.transfer.exportJson')}
              </Button>
            </Space>
          </div>
          <div>
            <Button size="small" type="primary" onClick={initSelectiveExport}>
              {t('settings.transfer.selectiveExport')}
            </Button>
          </div>
        </div>
      </section>

      <section
        className="rounded-xl border border-solid p-5"
        style={{ borderColor: token.colorBorderSecondary }}
      >
        <Typography.Title level={5}>{t('settings.transfer.exportMarkdownSectionTitle')}</Typography.Title>
        <Typography.Paragraph className="!mb-4" type="secondary">
          {t('settings.transfer.exportMarkdownDescription')}
        </Typography.Paragraph>
        <ExportPanel projectId={projectId} />
      </section>

      <Modal
        destroyOnClose
        footer={[
          <Button key="cancel" onClick={() => { setSelectModalOpen(false) }}>
            {t('common.cancel')}
          </Button>,
          <Button
            key="openapi"
            loading={isExporting}
            type="primary"
            onClick={() => void handleSelectiveExport('openapi')}
          >
            {t('settings.transfer.exportOpenApi')}
          </Button>,
          <Button
            key="swagger"
            loading={isExporting}
            type="primary"
            onClick={() => void handleSelectiveExport('swagger')}
          >
            {t('settings.transfer.exportSwagger')}
          </Button>,
        ]}
        open={selectModalOpen}
        title={t('settings.transfer.selectExportApis')}
        width={640}
        onCancel={() => { setSelectModalOpen(false) }}
      >
        <div className="mb-3">
          <ExportTreeSelect checkedApiIds={checkedApiIds} onChange={setCheckedApiIds} />
        </div>
      </Modal>
    </div>
  )
}
