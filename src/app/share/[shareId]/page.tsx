'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Card,
  Input,
  Result,
  Spin,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useParams } from 'react-router'

import { BodyType } from '@/enums'
import { SchemaType, type JsonSchema } from '@/components/JsonSchema'
import type { ApiDetails, Parameter } from '@/types'

interface ShareInfo {
  id: string
  title: string
  expiresAt: string | null
  needsPassword: boolean
}

interface ShareApiData {
  title: string
  projectId: string
  items: Array<{
    id: string
    name: string
    type: string
    parentId: string | null
    data: ApiDetails | null
  }>
}

interface ApiResponse {
  ok: boolean
  data?: unknown
  error: string | null
}

const HTTP_METHOD_CONFIG: Record<string, { color: string }> = {
  GET: { color: '#52c41a' },
  POST: { color: '#1677ff' },
  PUT: { color: '#fa8c16' },
  DELETE: { color: '#ff4d4f' },
  PATCH: { color: '#722ed1' },
}

function HttpMethodTag({ method }: { method?: string }) {
  const m = (method ?? 'GET').toUpperCase()
  return (
    <span
      className="inline-block shrink-0 px-1.5 py-0.5 text-xs font-bold text-white"
      style={{
        backgroundColor: HTTP_METHOD_CONFIG[m]?.color ?? '#8c8c8c',
        borderRadius: 3,
      }}
    >
      {m}
    </span>
  )
}

function ParamsTable({ params, title }: { params?: Parameter[]; title: string }) {
  if (!params || params.length === 0) return null

  return (
    <div className="mb-4">
      <Typography.Text strong className="mb-2 block text-sm">{title}</Typography.Text>
      <div className="overflow-x-auto rounded border" style={{ borderColor: '#f0f0f0' }}>
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
              <th className="px-3 py-2 text-left font-medium">参数名</th>
              <th className="px-3 py-2 text-left font-medium">类型</th>
              <th className="px-3 py-2 text-left font-medium">必填</th>
              <th className="px-3 py-2 text-left font-medium">说明</th>
              <th className="px-3 py-2 text-left font-medium">示例</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td className="px-3 py-2"><code className="text-xs">{p.name}</code></td>
                <td className="px-3 py-2 text-xs">{p.type}</td>
                <td className="px-3 py-2 text-xs">{p.required ? '是' : '否'}</td>
                <td className="px-3 py-2 text-xs">{p.description ?? '-'}</td>
                <td className="px-3 py-2 text-xs">{p.example != null ? String(p.example) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function getTypeLabel(node: JsonSchema): string {
  if (node.type === SchemaType.Array) {
    const itemType = getTypeLabel(node.items)
    return `array<${itemType}>`
  }
  if (node.type === SchemaType.Refer) {
    return node.$ref
  }
  return node.type
}

interface SchemaFieldRow {
  key: string
  name: string
  typeLabel: string
  description?: string
  depth: number
}

function buildSchemaRows(schema?: JsonSchema): SchemaFieldRow[] {
  if (!schema) return []
  if (schema.type !== SchemaType.Object || !Array.isArray(schema.properties)) return []

  const rows: SchemaFieldRow[] = []

  const walk = (properties: JsonSchema[], depth: number) => {
    properties.forEach((field, index) => {
      const name = field.name ?? `field_${index + 1}`
      rows.push({
        key: `${depth}-${name}-${index}`,
        name,
        typeLabel: getTypeLabel(field),
        description: field.description,
        depth,
      })

      if (field.type === SchemaType.Object && Array.isArray(field.properties)) {
        walk(field.properties, depth + 1)
      }
      if (field.type === SchemaType.Array) {
        const items = field.items
        if (items.type === SchemaType.Object && Array.isArray(items.properties)) {
          walk(items.properties, depth + 1)
        }
      }
    })
  }

  walk(schema.properties, 0)
  return rows
}

function buildSchemaExample(schema?: JsonSchema): unknown {
  if (!schema) return {}

  switch (schema.type) {
    case SchemaType.String: return 'string'
    case SchemaType.Integer: return 0
    case SchemaType.Number: return 0
    case SchemaType.Boolean: return true
    case SchemaType.Null: return null
    case SchemaType.Refer: return {}
    case SchemaType.Any: return {}
    case SchemaType.Array:
      return [buildSchemaExample(schema.items)]
    case SchemaType.Object: {
      const output: Record<string, unknown> = {}
      schema.properties?.forEach((field, index) => {
        const fieldName = field.name ?? `field_${index + 1}`
        output[fieldName] = buildSchemaExample(field)
      })
      return output
    }
    default: return {}
  }
}

function SchemaPanel({ schema }: { schema?: JsonSchema }) {
  const [msgApi] = message.useMessage()

  if (!schema) return <Typography.Text type="secondary">无</Typography.Text>

  if (schema.type === SchemaType.Object && schema.properties) {
    const rows = buildSchemaRows(schema)
    const example = buildSchemaExample(schema)

    return (
      <div className="rounded border" style={{ borderColor: '#f0f0f0', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1fr) minmax(240px, 0.9fr)', minHeight: 200 }}>
          <div style={{ minWidth: 0 }}>
            <div className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: '1px solid #f0f0f0', background: '#fafafa', fontSize: 12 }}>
              <span className="opacity-60">参数名</span>
              <span className="opacity-40">{rows.length} fields</span>
            </div>
            {rows.length > 0
              ? (
                  <div style={{ maxHeight: 320, overflow: 'auto' }}>
                    <div className="grid px-3 py-1" style={{ gridTemplateColumns: '2fr 1.2fr 0.8fr 2fr', gap: 8, borderBottom: '1px solid #f0f0f0', background: '#fafafa', fontSize: 12, position: 'sticky', top: 0 }}>
                      <span className="font-medium opacity-50">字段名</span>
                      <span className="font-medium opacity-50">类型</span>
                      <span className="font-medium opacity-50">必填</span>
                      <span className="font-medium opacity-50">说明</span>
                    </div>
                    {rows.map((row) => (
                      <div key={row.key} className="grid px-3 py-1" style={{ gridTemplateColumns: '2fr 1.2fr 0.8fr 2fr', gap: 8, borderBottom: '1px solid #f5f5f5', minHeight: 32, alignItems: 'center' }}>
                        <span style={{ paddingLeft: row.depth * 16 }}>
                          <code className="text-xs" style={{ background: '#e6f4ff', color: '#1677ff', padding: '1px 6px', borderRadius: 4 }}>{row.name}</code>
                        </span>
                        <span className="text-xs opacity-70" style={{ fontFamily: 'monospace' }}>{row.typeLabel}</span>
                        <span className="text-xs opacity-50">可选</span>
                        <span className="text-xs opacity-50 truncate">{row.description ?? '-'}</span>
                      </div>
                    ))}
                  </div>
                )
              : <div className="px-3 py-4 text-xs opacity-40">暂无字段</div>}
          </div>

          <div style={{ minWidth: 0, borderLeft: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: '1px solid #f0f0f0', background: '#fafafa', fontSize: 12 }}>
              <span className="opacity-60">示例</span>
              <Button
                size="small"
                type="link"
                onClick={() => {
                  void navigator.clipboard.writeText(JSON.stringify(example, null, 2)).then(() => {
                    msgApi.success('已复制')
                  })
                }}
              >
                复制
              </Button>
            </div>
            <pre className="m-0 flex-1 p-3 text-xs" style={{ overflow: 'auto', background: '#fafafa', lineHeight: 1.7, maxHeight: 320 }}>
              {JSON.stringify(example, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    )
  }

  if (schema.type === SchemaType.Array) {
    return (
      <div>
        <Tag color="cyan">array</Tag>
        <div className="mt-1">
          <SchemaPanel schema={schema.items} />
        </div>
      </div>
    )
  }

  return <Tag>{getTypeLabel(schema)}</Tag>
}

function ApiDetailView({ data }: { data: ApiDetails }) {
  const method = (data.method ?? 'GET').toUpperCase()
  const path = data.path ?? '/'
  const hasParams = !!data.parameters?.path?.length || !!data.parameters?.query?.length
    || !!data.parameters?.header?.length || !!data.parameters?.cookie?.length
  const hasBody = data.requestBody && data.requestBody.type !== BodyType.None
  const hasResponses = !!data.responses?.length

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <HttpMethodTag method={method} />
        <Typography.Text strong className="text-lg">{path}</Typography.Text>
      </div>
      <Typography.Title level={5} style={{ marginTop: 0 }}>{data.name}</Typography.Title>

      {data.description && (
        <Typography.Paragraph type="secondary">{data.description}</Typography.Paragraph>
      )}

      {hasParams && (
        <div className="mb-6">
          <Typography.Title level={5} className="!mb-3">请求参数</Typography.Title>
          <ParamsTable params={data.parameters?.path} title="Path 参数" />
          <ParamsTable params={data.parameters?.query} title="Query 参数" />
          <ParamsTable params={data.parameters?.header} title="Header 参数" />
          <ParamsTable params={data.parameters?.cookie} title="Cookie 参数" />
        </div>
      )}

      {hasBody && (
        <div className="mb-6">
          <Typography.Title level={5} className="!mb-3">
            请求体
            <Tag className="ml-2">
              {data.requestBody!.type === BodyType.Json ? 'JSON'
                : data.requestBody!.type === BodyType.FormData ? 'Form Data'
                : data.requestBody!.type === BodyType.UrlEncoded ? 'URL Encoded'
                : data.requestBody!.type === BodyType.Xml ? 'XML'
                : data.requestBody!.type === BodyType.Binary ? 'Binary'
                : 'Raw'}
            </Tag>
          </Typography.Title>

          {data.requestBody!.parameters && data.requestBody!.parameters.length > 0 && (
            <div className="mb-3 rounded border p-3" style={{ borderColor: '#f0f0f0' }}>
              {data.requestBody!.parameters.map((param) => (
                <div key={param.id} className="mb-1 flex items-center gap-2 text-sm">
                  <code className="text-xs" style={{ background: '#e6f4ff', color: '#1677ff', padding: '1px 6px', borderRadius: 4 }}>{param.name}</code>
                  <span className="opacity-50">{param.type}</span>
                  <span className="opacity-50">{param.required ? '必填' : '可选'}</span>
                  <span className="opacity-50">{param.description}</span>
                  <span className="text-xs opacity-40">示例: {String(param.example ?? '-')}</span>
                </div>
              ))}
            </div>
          )}

          {data.requestBody!.jsonSchema && (
            <SchemaPanel schema={data.requestBody!.jsonSchema} />
          )}

          {data.requestBody!.type === BodyType.Json && data.requestBody!.jsonSchema && (
            <div className="mt-3">
              <Typography.Text strong className="mb-2 block text-sm">请求示例</Typography.Text>
              <pre className="m-0 rounded border p-3 text-xs" style={{ background: '#fafafa', lineHeight: 1.7, borderColor: '#f0f0f0', overflow: 'auto' }}>
                {JSON.stringify(buildSchemaExample(data.requestBody!.jsonSchema), null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {hasResponses && (
        <div>
          <Typography.Title level={5} className="!mb-3">返回响应</Typography.Title>
          <Tabs
            className="[&_.ant-tabs-content-holder]:border [&_.ant-tabs-content-holder]:border-t-0 [&_.ant-tabs-content-holder]:rounded-b-lg"
            items={data.responses!.map((resp) => {
              const resSchema = resp.jsonSchema
              const resExample = buildSchemaExample(resSchema)

              return {
                key: resp.id,
                label: (
                  <span>
                    <Tag color={String(resp.code).startsWith('2') ? 'green' : String(resp.code).startsWith('4') ? 'orange' : 'red'}>
                      {resp.code}
                    </Tag>
                    {resp.name}
                  </span>
                ),
                children: (
                  <div className="p-4">
                    <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
                      <span>
                        <span className="opacity-50">HTTP 状态码：</span>
                        <span>{resp.code}</span>
                      </span>
                      <span>
                        <span className="opacity-50">内容格式：</span>
                        <span>{resp.contentType}</span>
                      </span>
                    </div>

                    {resSchema && resSchema.type === SchemaType.Object && resSchema.properties && resSchema.properties.length > 0
                      ? (
                          <div className="mb-3">
                            <Typography.Text strong className="mb-2 block text-sm">返回参数</Typography.Text>
                            <SchemaPanel schema={resSchema} />
                          </div>
                        )
                      : null}

                    <div>
                      <Typography.Text strong className="mb-2 block text-sm">返回示例</Typography.Text>
                      <pre className="m-0 rounded border p-3 text-xs" style={{ background: '#fafafa', lineHeight: 1.7, borderColor: '#f0f0f0', overflow: 'auto' }}>
                        {JSON.stringify(resExample, null, 2)}
                      </pre>
                    </div>
                  </div>
                ),
              }
            })}
            size="small"
            type="card"
          />
        </div>
      )}
    </div>
  )
}

export default function SharePage() {
  const { shareId } = useParams()
  const [msgApi, contextHolder] = message.useMessage()

  const [loading, setLoading] = useState(true)
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null)
  const [apiData, setApiData] = useState<ShareApiData | null>(null)
  const [error, setError] = useState<string>()
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [activeApiId, setActiveApiId] = useState<string>()

  const apiItems = useMemo(() => {
    return (apiData?.items ?? []).filter((item) => item.data)
  }, [apiData])

  useEffect(() => {
    if (!shareId) {
      setError('分享链接不存在')
      setLoading(false)
      return
    }

    let cancelled = false

    const fetchShareInfo = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/v1/public/shares/${shareId}`)
        const payload = await response.json() as ApiResponse & { data?: ShareInfo }

        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error ?? '加载失败')
        }

        if (cancelled) return

        const info = payload.data as ShareInfo
        setShareInfo(info)
        setNeedsPassword(info.needsPassword)
        setError(undefined)

        if (!info.needsPassword) {
          await fetchApiData()
        } else {
          const urlParams = new URLSearchParams(window.location.search)
          const pwd = urlParams.get('pwd')
          if (pwd) {
            setPassword(pwd)
            await fetchApiData(pwd)
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const fetchApiData = async (pwd?: string) => {
      try {
        setVerifying(true)
        const response = await fetch(`/api/v1/public/shares/${shareId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pwd ? { password: pwd } : {}),
        })
        const payload = await response.json() as ApiResponse & { data?: ShareApiData }

        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error ?? '获取数据失败')
        }

        if (!cancelled) {
          setApiData(payload.data as ShareApiData)
          setNeedsPassword(false)
        }
      } catch (err) {
        if (!cancelled) msgApi.error((err as Error).message)
      } finally {
        if (!cancelled) setVerifying(false)
      }
    }

    void fetchShareInfo()

    return () => { cancelled = true }
  }, [shareId])

  useEffect(() => {
    if (apiItems.length > 0 && !activeApiId) {
      setActiveApiId(apiItems[0].id)
    }
  }, [apiItems, activeApiId])

  const handleVerify = async () => {
    if (!shareId || !password.trim()) return

    try {
      setVerifying(true)
      const response = await fetch(`/api/v1/public/shares/${shareId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const payload = await response.json() as ApiResponse & { data?: ShareApiData }

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? '验证失败')
      }

      setApiData(payload.data as ShareApiData)
      setNeedsPassword(false)
    } catch (err) {
      msgApi.error((err as Error).message)
    } finally {
      setVerifying(false)
    }
  }

  const activeItem = apiItems.find((item) => item.id === activeApiId)

  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#f5f5f5' }}>
      {contextHolder}

      {loading
        ? (
            <div className="flex flex-1 justify-center py-20">
              <Spin size="large" />
            </div>
          )
        : error
          ? (
              <div className="flex flex-1 items-center justify-center">
                <Result status="warning" subTitle={error} title="无法访问" />
              </div>
            )
          : needsPassword
            ? (
                <div className="flex flex-1 items-center justify-center">
                  <Card className="w-full max-w-md">
                    <Typography.Title level={4}>需要密码访问</Typography.Title>
                    {shareInfo?.title && (
                      <Typography.Text className="!mb-4 block" type="secondary">
                        {shareInfo.title}
                      </Typography.Text>
                    )}
                    <Input.Password
                      className="!mb-3"
                      placeholder="请输入访问密码"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onPressEnter={() => void handleVerify()}
                    />
                    <Button block loading={verifying} type="primary" onClick={() => void handleVerify()}>
                      验证
                    </Button>
                  </Card>
                </div>
              )
            : apiData
              ? (
                  <>
                    <div className="flex items-center gap-4 border-b bg-white px-6 py-3" style={{ borderColor: '#f0f0f0' }}>
                      <Typography.Title level={4} style={{ margin: 0 }}>
                        {apiData.title || 'API 文档分享'}
                      </Typography.Title>
                      {shareInfo?.expiresAt && (
                        <Typography.Text type="secondary" className="text-sm">
                          有效期至 {dayjs(shareInfo.expiresAt).format('YYYY-MM-DD HH:mm')}
                        </Typography.Text>
                      )}
                    </div>

                    <div className="flex flex-1" style={{ height: 'calc(100vh - 53px)' }}>
                      {/* left sidebar */}
                      <div
                        className="shrink-0 overflow-auto"
                        style={{ width: 260, borderRight: '1px solid #f0f0f0', background: '#fff' }}
                      >
                        <div className="px-3 py-2 text-xs font-medium opacity-40">
                          接口列表 ({apiItems.length})
                        </div>
                        {apiItems.map((item) => {
                          const data = item.data as ApiDetails
                          const method = (data.method ?? 'GET').toUpperCase()

                          return (
                            <div
                              key={item.id}
                              className="flex cursor-pointer items-center gap-2 border-b px-3 py-2.5 text-sm transition-colors hover:bg-blue-50"
                              style={{
                                borderColor: '#f5f5f5',
                                background: activeApiId === item.id ? '#e6f4ff' : undefined,
                              }}
                              onClick={() => setActiveApiId(item.id)}
                            >
                              <HttpMethodTag method={method} />
                              <span
                                className="truncate text-xs"
                                style={{ color: '#333' }}
                              >
                                {item.name}
                              </span>
                            </div>
                          )
                        })}
                      </div>

                      {/* right detail panel */}
                      <div className="flex-1 overflow-auto p-6">
                        {activeItem
                          ? (
                              <ApiDetailView data={activeItem.data as ApiDetails} />
                            )
                          : (
                              <Result subTitle="请从左侧选择一个接口" title="选择接口" />
                            )}
                      </div>
                    </div>
                  </>
                )
              : null}
    </div>
  )
}
