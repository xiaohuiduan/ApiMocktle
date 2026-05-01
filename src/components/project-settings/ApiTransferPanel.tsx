import { useMemo, useState } from 'react'
import { useLocation } from 'react-router'

import { Button, Checkbox, Input, message, Modal, Progress, Space, theme, Tree, Typography } from 'antd'
import type { CheckboxChangeEvent } from 'antd/es/checkbox'
import type { DataNode } from 'antd/es/tree'

import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'
import { MenuItemType } from '@/enums'
import type { ApiMenuData } from '@/components/ApiMenu'
import { type ProjectStateSnapshot, useMenuHelpersContext } from '@/contexts/menu-helpers'

function resolveProjectId(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)

  return parts.at(0) === 'projects' ? parts.at(1) : undefined
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
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

export function ApiTransferPanel() {
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

  // 构建 API 接口树
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

  const initSelectiveExport = () => {
    setCheckedApiIds(new Set(allApiIds))
    setSelectModalOpen(true)
  }

  const handleCheckAll = (e: CheckboxChangeEvent) => {
    setCheckedApiIds(e.target.checked ? new Set(allApiIds) : new Set())
  }

  const handleSelectiveExport = async (specFormat: 'openapi' | 'swagger') => {
    if (!projectId || !sessionId) {
      msgApi.error('请在项目页面执行导出')
      return
    }
    if (checkedApiIds.size === 0) {
      msgApi.error('请至少选择一个接口')
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
      const blob = new Blob([payload.content], { type: 'application/json' })
      const specName = specFormat === 'swagger' ? 'swagger' : 'openapi'
      downloadFile(blob, `${specName}.json`)
      setSelectModalOpen(false)
    } catch (err) {
      msgApi.error((err as Error).message)
    } finally {
      setIsExporting(false)
    }
  }

  const handleExport = async (format: 'json' | 'yaml') => {
    if (!projectId || !sessionId) {
      msgApi.error('请在项目页面执行导出')
      return
    }

    try {
      const payload = await api<{ content: string, format: string }>('export_openapi', {
        sessionId,
        projectId,
        format,
      })
      const mimeType = format === 'yaml' ? 'text/yaml' : 'application/json'
      const blob = new Blob([payload.content], { type: mimeType })
      downloadFile(blob, `openapi.${format}`)
    } catch (err) {
      msgApi.error((err as Error).message)
    }
  }

  const handleImport = async (file: File) => {
    if (!projectId || !sessionId) {
      msgApi.error('请在项目页面执行导入')
      return
    }

    setIsImporting(true)
    setImportProgress(0)
    setImportFileName(file.name)
    msgApi.open({ key: 'api-import', type: 'loading', content: '导入中 0%', duration: 0 })

    try {
      const content = await file.text()
      setImportProgress(50)
      msgApi.open({ key: 'api-import', type: 'loading', content: '导入中 50%', duration: 0 })

      const format = file.name.endsWith('.yaml') || file.name.endsWith('.yml')
        ? 'yaml'
        : file.name.endsWith('.json')
          ? 'json'
          : 'auto'

      const payload = await api<{ imported: { format: string }, state: ProjectStateSnapshot }>('import_api_document', {
        sessionId,
        projectId,
        payload: { format, content },
      })

      if (payload.state) {
        applyServerState(payload.state)
      } else {
        await reloadState()
      }

      setImportProgress(100)
      msgApi.open({ key: 'api-import', type: 'success', content: '导入成功！' })
    }
    catch (error) {
      msgApi.open({
        key: 'api-import',
        type: 'error',
        content: error instanceof Error ? error.message : '导入失败',
      })
    }
    finally {
      setIsImporting(false)
    }
  }

  const handleImportFromUrl = async () => {
    if (!projectId || !sessionId) {
      msgApi.error('请在项目页面执行导入')
      return
    }

    const trimmed = importUrl.trim()

    if (!trimmed) {
      msgApi.error('请填写 OpenAPI 或 Postman 文档的 URL')
      return
    }

    let parsed: URL

    try {
      parsed = new URL(trimmed)
    }
    catch {
      msgApi.error('链接格式不正确')
      return
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      msgApi.error('仅支持 http 或 https 链接')
      return
    }

    setIsUrlImporting(true)
    msgApi.open({ key: 'api-import-url', type: 'loading', content: '正在从链接拉取并导入…', duration: 0 })

    try {
      const response = await fetch(trimmed)
      if (!response.ok) {
        throw new Error(`下载失败: HTTP ${response.status}`)
      }
      const content = await response.text()

      const payload = await api<{ imported: { format: string }, state: ProjectStateSnapshot }>('import_api_document', {
        sessionId,
        projectId,
        payload: { format: 'auto', content },
      })

      if (payload.state) {
        applyServerState(payload.state)
      } else {
        await reloadState()
      }

      msgApi.open({ key: 'api-import-url', type: 'success', content: '导入成功！' })
    }
    catch (error) {
      msgApi.open({
        key: 'api-import-url',
        type: 'error',
        content: error instanceof Error ? error.message : '导入失败',
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
        <Typography.Title level={4}>导入接口</Typography.Title>
        <Typography.Paragraph type="secondary">
          支持导入 OpenAPI 3.x / Swagger 2.0 的 JSON 或 YAML，以及 Postman Collection v2/v2.1 的 JSON 文件。
          导入后会静默合并到当前项目里的接口、请求目录与模型数据，不会清空已有内容。
        </Typography.Paragraph>
        <Typography.Paragraph className="!mb-4" type="secondary">
          选择文件或从 URL 导入后会直接开始合并，不再弹出覆盖确认。URL 需可被本服务访问（例如本机后端请使用局域网 IP 或主机名，勿写浏览器专属地址）。
        </Typography.Paragraph>

        <Space className="w-full max-w-2xl" direction="vertical" size={12}>
          <div>
            <Typography.Text className="mb-2 block text-sm" type="secondary">
              通过文档链接导入（GET 返回 JSON 或 YAML 正文，如 SpringDoc 的 /v3/api-docs 或 Swagger 的 /v2/api-docs）
            </Typography.Text>
            <Space.Compact className="w-full">
              <Input
                allowClear
                disabled={isImporting || isUrlImporting}
                placeholder="https://example.com/v3/api-docs"
                value={importUrl}
                onChange={(e) => { setImportUrl(e.target.value) }}
                onPressEnter={() => {
                  void handleImportFromUrl()
                }}
              />
              <Button
                disabled={isImporting || isUrlImporting}
                loading={isUrlImporting}
                type="primary"
                onClick={() => void handleImportFromUrl()}
              >
                从 URL 导入
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
            选择文件导入接口文档
          </Button>

          {isImporting && (
            <div className="w-full max-w-md">
              <div className="mb-1 text-xs" style={{ color: token.colorTextSecondary }}>
                正在导入：{importFileName ?? '接口文档文件'}
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
        <Typography.Title level={5}>导出文档</Typography.Title>
        <Typography.Paragraph className="!mb-4" type="secondary">
          导出 OpenAPI 3.0 或 Swagger 2.0 格式文档。也可通过"选择性导出"仅导出指定接口。
        </Typography.Paragraph>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Typography.Text className="text-xs" type="secondary">OpenAPI 3.0：</Typography.Text>
            <Space size={8}>
              <Button size="small" onClick={() => void handleExport('json')}>导出 JSON</Button>
              <Button size="small" onClick={() => void handleExport('yaml')}>导出 YAML</Button>
            </Space>
          </div>
          <div className="flex items-center gap-2">
            <Typography.Text className="text-xs" type="secondary">Swagger 2.0：</Typography.Text>
            <Space size={8}>
              <Button
                size="small"
                onClick={() => {
                  void handleExport('json').catch(() => {})
                }}
              >
                导出 JSON
              </Button>
            </Space>
          </div>
          <div>
            <Button type="primary" size="small" onClick={initSelectiveExport}>
              选择性导出
            </Button>
          </div>
        </div>
      </section>

      <Modal
        destroyOnClose
        open={selectModalOpen}
        title="选择要导出的接口"
        width={640}
        onCancel={() => setSelectModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setSelectModalOpen(false)}>
            取消
          </Button>,
          <Button
            key="openapi"
            loading={isExporting}
            type="primary"
            onClick={() => void handleSelectiveExport('openapi')}
          >
            导出 OpenAPI 3.0
          </Button>,
          <Button
            key="swagger"
            loading={isExporting}
            type="primary"
            onClick={() => void handleSelectiveExport('swagger')}
          >
            导出 Swagger 2.0
          </Button>,
        ]}
      >
        <div className="mb-3">
          <Checkbox
            checked={isAllChecked}
            indeterminate={isIndeterminate}
            onChange={handleCheckAll}
          >
            <span className="text-sm">全选 / 取消全选</span>
          </Checkbox>
        </div>
        {apiTreeData.length > 0
          ? (
              <Tree
                checkable
                blockNode
                checkedKeys={Array.from(checkedApiIds)}
                defaultExpandAll
                treeData={apiTreeData}
                onCheck={(_keys, info) => {
                  // Filter to only leaf node keys (ApiDetail items)
                  const leafKeys = info.checkedNodes
                    .filter((n) => n.isLeaf)
                    .map((n) => n.key as string)
                  setCheckedApiIds(new Set(leafKeys))
                }}
              />
            )
          : (
              <Typography.Text type="secondary">暂无接口数据</Typography.Text>
            )}
      </Modal>
    </div>
  )
}
