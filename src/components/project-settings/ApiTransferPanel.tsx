import { useMemo, useState } from 'react'
import { useLocation } from 'react-router'

import { Button, Input, message, Progress, Space, theme, Typography } from 'antd'

import { type ProjectStateSnapshot, useMenuHelpersContext } from '@/contexts/menu-helpers'

interface ImportApiResponse {
  ok: boolean
  data: {
    state: ProjectStateSnapshot
    created: number
    updated: number
  } | null
  error: string | null
}

interface UploadApiFileOptions {
  projectId: string
  file: File
  onProgress: (percent: number) => void
}

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

async function importApiDocumentFromUrl(
  projectId: string,
  url: string,
): Promise<ImportApiResponse> {
  const response = await fetch(`/api/v1/projects/${projectId}/imports`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  })

  let payload: ImportApiResponse

  try {
    payload = await response.json() as ImportApiResponse
  }
  catch {
    throw new Error('导入失败：服务端返回异常')
  }

  if (response.ok && payload.ok) {
    return payload
  }

  throw new Error(payload.error ?? '导入失败')
}

function uploadApiFile(props: UploadApiFileOptions) {
  const { projectId, file, onProgress } = props

  return new Promise<ImportApiResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)

    xhr.open('POST', `/api/v1/projects/${projectId}/imports`)
    xhr.withCredentials = true

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return
      }

      const percent = Math.min(99, Math.round((event.loaded / event.total) * 100))
      onProgress(percent)
    }

    xhr.onerror = () => {
      reject(new Error('网络异常，请稍后重试'))
    }

    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText) as ImportApiResponse

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload)

          return
        }

        reject(new Error(payload.error ?? '导入失败'))
      }
      catch {
        reject(new Error('导入失败：服务端返回异常'))
      }
    }

    xhr.send(formData)
  })
}

export function ApiTransferPanel() {
  const { token } = theme.useToken()
  const { pathname } = useLocation()
  const { applyServerState, reloadState } = useMenuHelpersContext()
  const [msgApi, contextHolder] = message.useMessage()
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importFileName, setImportFileName] = useState<string>()
  const [importUrl, setImportUrl] = useState('')
  const [isUrlImporting, setIsUrlImporting] = useState(false)

  const projectId = useMemo(() => resolveProjectId(pathname), [pathname])

  const handleExport = async (format: 'json' | 'yaml') => {
    if (!projectId) {
      msgApi.error('请在项目页面执行导出')

      return
    }

    const response = await fetch(`/api/v1/projects/${projectId}/openapi/export?format=${format}`, {
      method: 'GET',
      credentials: 'include',
    })

    if (!response.ok) {
      msgApi.error('导出失败')

      return
    }

    downloadFile(await response.blob(), `openapi.${format}`)
  }

  const handleImport = async (file: File) => {
    if (!projectId) {
      msgApi.error('请在项目页面执行导入')

      return
    }

    setIsImporting(true)
    setImportProgress(0)
    setImportFileName(file.name)
    msgApi.open({ key: 'api-import', type: 'loading', content: '导入中 0%', duration: 0 })

    try {
      const payload = await uploadApiFile({
        projectId,
        file,
        onProgress: (percent) => {
          setImportProgress(percent)
          msgApi.open({
            key: 'api-import',
            type: 'loading',
            content: `导入中 ${percent}%`,
            duration: 0,
          })
        },
      })

      if (!payload.ok) {
        throw new Error(payload.error ?? '导入失败')
      }

      if (payload.data) {
        applyServerState(payload.data.state)
      }
      else {
        await reloadState()
      }

      setImportProgress(100)

      const created = payload.data?.created ?? 0
      const updated = payload.data?.updated ?? 0
      const parts: string[] = []

      if (created > 0) {
        parts.push(`新增 ${created} 个`)
      }

      if (updated > 0) {
        parts.push(`更新 ${updated} 个`)
      }

      const summary = parts.length > 0 ? parts.join('，') : '已合并到当前项目'
      msgApi.open({ key: 'api-import', type: 'success', content: `导入成功！${summary}` })
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
    if (!projectId) {
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
      const payload = await importApiDocumentFromUrl(projectId, trimmed)

      if (payload.data) {
        applyServerState(payload.data.state)
      }
      else {
        await reloadState()
      }

      const created = payload.data?.created ?? 0
      const updated = payload.data?.updated ?? 0
      const parts: string[] = []

      if (created > 0) {
        parts.push(`新增 ${created} 个`)
      }

      if (updated > 0) {
        parts.push(`更新 ${updated} 个`)
      }

      const summary = parts.length > 0 ? parts.join('，') : '已合并到当前项目'
      msgApi.open({ key: 'api-import-url', type: 'success', content: `导入成功！${summary}` })
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
        <Typography.Title level={5}>导出 OpenAPI</Typography.Title>
        <Typography.Paragraph className="!mb-4" type="secondary">
          如果需要备份或迁移当前项目，也可以直接导出 OpenAPI 文档。
        </Typography.Paragraph>

        <Space wrap size={12}>
          <Button onClick={() => void handleExport('json')}>导出 OpenAPI JSON</Button>
          <Button onClick={() => void handleExport('yaml')}>导出 OpenAPI YAML</Button>
        </Space>
      </section>
    </div>
  )
}
