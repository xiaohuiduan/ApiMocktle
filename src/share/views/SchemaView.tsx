import { useTranslation } from 'react-i18next'

import { Card, Table, Tag } from 'antd'

import { schemaExample, schemaTree, type SchemaTreeNode } from '../schema-example'

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

export function SchemaView({ data }: { data: unknown }) {
  const { t } = useTranslation()
  const schema = (data ?? {}) as Record<string, unknown>

  const name = typeof schema.name === 'string' ? schema.name : undefined
  const description = typeof schema.description === 'string' ? schema.description : undefined
  const jsonSchema = schema.jsonSchema ?? schema.schema ?? schema.data

  const treeData = jsonSchema ? schemaTree(jsonSchema) : []
  const example = jsonSchema ? schemaExample(jsonSchema) : null

  return (
    <div className="space-y-4 p-4">
      {name && <h3 className="mb-0 text-lg font-medium">{name}</h3>}
      {description && <p className="whitespace-pre-wrap text-gray-500">{description}</p>}
      {jsonSchema
        ? (
            <Card size="small">
              {treeData.length > 0 && (
                <Table<SchemaTreeNode>
                  className="mb-3"
                  columns={[
                    {
                      title: t('share.table.field'),
                      dataIndex: 'name',
                      render: (value: string) => <span className="font-mono">{value}</span>,
                    },
                    {
                      title: t('share.table.type'),
                      dataIndex: 'type',
                      width: 140,
                      render: (value: string) => <span className="font-mono">{value}</span>,
                    },
                    {
                      title: t('share.table.required'),
                      dataIndex: 'required',
                      width: 80,
                      render: (value: boolean) => (value
                        ? <Tag color="red">{t('share.table.required')}</Tag>
                        : <Tag>{t('share.table.optional')}</Tag>),
                    },
                    {
                      title: t('share.table.description'),
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
              <div className="mb-1 text-xs text-gray-500">{t('share.schema.example')}</div>
              <JsonBlock value={example} />
            </Card>
          )
        : (
            <JsonBlock value={data} />
          )}
    </div>
  )
}
