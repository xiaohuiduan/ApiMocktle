import { Card, Descriptions, Table, Tag, Typography } from 'antd'
import { FileJson2 } from 'lucide-react'

import { schemaExample, schemaTree, type SchemaTreeNode } from '../schema-example'

import { MethodBadge } from './MethodBadge'

const { Paragraph, Title } = Typography

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre
      className="m-0 overflow-auto rounded-md p-3 text-xs"
      style={{
        backgroundColor: '#f6f8fa',
        border: '1px solid #e5e7eb',
        maxHeight: 480,
        lineHeight: 1.7,
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

interface SchemaSectionProps {
  title: string
  schema?: unknown
}

function SchemaSection({ title, schema }: SchemaSectionProps) {
  if (!schema || typeof schema !== 'object') {
    return null
  }

  const treeData = schemaTree(schema)
  const example = schemaExample(schema)

  return (
    <div className="mt-3">
      <Title className="!mt-0" level={5}>{title}</Title>
      {treeData.length > 0 && (
        <Table<SchemaTreeNode>
          className="mb-2"
          columns={[
            {
              title: '字段',
              dataIndex: 'name',
              render: (value: string) => <span className="font-mono">{value}</span>,
            },
            {
              title: '类型',
              dataIndex: 'type',
              width: 140,
              render: (value: string) => <span className="font-mono">{value}</span>,
            },
            {
              title: '必填',
              dataIndex: 'required',
              width: 80,
              render: (value: boolean) => (value ? <Tag color="red">必填</Tag> : <Tag>可选</Tag>),
            },
            {
              title: '说明',
              dataIndex: 'description',
              render: (value?: string) => value ?? '-',
            },
          ]}
          dataSource={treeData}
          expandable={{ defaultExpandAllRows: true }}
          pagination={false}
          rowKey={(row) => row.name}
          size="small"
        />
      )}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <FileJson2 size={14} />
        {' '}
        示例
      </div>
      <JsonBlock value={example} />
    </div>
  )
}

interface ParameterRow {
  id: string
  name?: string
  description?: string
  required?: boolean
  type?: string
  example?: string | string[]
}

function ParameterTable({ parameters }: { parameters: ParameterRow[] }) {
  if (parameters.length === 0) {
    return null
  }

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          <th className="border border-gray-200 bg-gray-50 p-2 text-left">参数名</th>
          <th className="border border-gray-200 bg-gray-50 p-2 text-left">类型</th>
          <th className="border border-gray-200 bg-gray-50 p-2 text-left">必填</th>
          <th className="border border-gray-200 bg-gray-50 p-2 text-left">示例</th>
          <th className="border border-gray-200 bg-gray-50 p-2 text-left">说明</th>
        </tr>
      </thead>
      <tbody>
        {parameters.map((p) => (
          <tr key={p.id}>
            <td className="border border-gray-200 p-2 font-mono">{p.name ?? '-'}</td>
            <td className="border border-gray-200 p-2 font-mono">{p.type ?? '-'}</td>
            <td className="border border-gray-200 p-2">
              {p.required ? <Tag color="red">必填</Tag> : <Tag>可选</Tag>}
            </td>
            <td className="border border-gray-200 p-2 font-mono">
              {Array.isArray(p.example) ? p.example.join(', ') : (p.example ?? '-')}
            </td>
            <td className="border border-gray-200 p-2">{p.description ?? '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ApiDetailView({ data }: { data: unknown }) {
  const details = (data ?? {}) as {
    name?: string
    method?: string
    path?: string
    description?: string
    serverUrl?: string
    parameters?: Record<string, ParameterRow[] | undefined>
    requestBody?: {
      type?: string
      parameters?: ParameterRow[]
      rawText?: string
      jsonSchema?: unknown
    }
    responses?: {
      code: number | string
      name?: string
      contentType?: string
      jsonSchema?: unknown
    }[]
    tags?: string[]
  }

  const parameters = details.parameters ?? {}
  const requestBody = details.requestBody

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        {details.method && <MethodBadge method={details.method} />}
        <Title className="!mb-0 font-mono" level={4}>{details.path ?? details.name ?? '未命名接口'}</Title>
      </div>

      {details.name && details.path !== details.name && (
        <div className="text-gray-500">{details.name}</div>
      )}

      {details.tags && details.tags.length > 0 && (
        <div className="flex gap-1">
          {details.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
        </div>
      )}

      {(details.serverUrl ?? details.description) && (
        <Card size="small">
          {details.serverUrl && (
            <Descriptions column={1} size="small">
              <Descriptions.Item label="前置 URL">{details.serverUrl}</Descriptions.Item>
            </Descriptions>
          )}
          {details.description && (
            <Paragraph className="!mb-0 whitespace-pre-wrap">{details.description}</Paragraph>
          )}
        </Card>
      )}

      {(['path', 'query', 'header', 'cookie'] as const).some((k) => (parameters[k]?.length ?? 0) > 0) && (
        <Card size="small" title="请求参数">
          {(['path', 'query', 'header', 'cookie'] as const).map((section) => {
            const items = parameters[section] ?? []

            if (items.length === 0) {
              return null
            }

            const sectionNames: Record<string, string> = {
              path: '路径参数',
              query: 'Query 参数',
              header: 'Header 参数',
              cookie: 'Cookie 参数',
            }

            return (
              <div key={section} className="mb-3 last:mb-0">
                <div className="mb-1 text-sm font-medium">{sectionNames[section]}</div>
                <ParameterTable parameters={items} />
              </div>
            )
          })}
        </Card>
      )}

      {requestBody?.type && requestBody.type !== 'none' && (
        <Card size="small" title="请求体">
          <div className="mb-2">
            <Tag>{requestBody.type}</Tag>
          </div>
          {requestBody.parameters && requestBody.parameters.length > 0 && (
            <ParameterTable parameters={requestBody.parameters} />
          )}
          {requestBody.rawText && <JsonBlock value={requestBody.rawText} />}
          {!!requestBody.jsonSchema && <SchemaSection schema={requestBody.jsonSchema} title="请求体结构" />}
        </Card>
      )}

      {details.responses && details.responses.length > 0 && (
        <Card size="small" title="响应">
          {details.responses.map((resp) => (
            <div key={`${resp.code}-${resp.name ?? ''}`} className="mb-4 last:mb-0">
              <div className="mb-2 flex items-center gap-2">
                <Tag color={Number(resp.code) >= 400 ? 'red' : 'green'}>{resp.code}</Tag>
                <span className="text-sm">{resp.name ?? ''}</span>
                {resp.contentType && <span className="text-xs text-gray-400">{resp.contentType}</span>}
              </div>
              <SchemaSection schema={resp.jsonSchema} title="响应结构" />
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
