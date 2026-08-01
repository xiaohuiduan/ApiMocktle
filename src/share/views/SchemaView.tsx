import { Card } from 'antd'

import { schemaExample, schemaRows } from '../schema-example'

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
  const schema = (data ?? {}) as Record<string, unknown>

  const name = typeof schema.name === 'string' ? schema.name : undefined
  const description = typeof schema.description === 'string' ? schema.description : undefined
  const jsonSchema = schema.jsonSchema ?? schema.schema ?? schema.data

  const rows = jsonSchema ? schemaRows(jsonSchema) : []
  const example = jsonSchema ? schemaExample(jsonSchema) : null

  return (
    <div className="space-y-4 p-4">
      {name && <h3 className="mb-0 text-lg font-medium">{name}</h3>}
      {description && <p className="whitespace-pre-wrap text-gray-500">{description}</p>}
      {jsonSchema
        ? (
            <Card size="small">
              {rows.length > 0 && (
                <table className="mb-3 w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border border-gray-200 bg-gray-50 p-2 text-left">字段</th>
                      <th className="border border-gray-200 bg-gray-50 p-2 text-left">类型</th>
                      <th className="border border-gray-200 bg-gray-50 p-2 text-left">必填</th>
                      <th className="border border-gray-200 bg-gray-50 p-2 text-left">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.name}>
                        <td className="border border-gray-200 p-2 font-mono">{row.name}</td>
                        <td className="border border-gray-200 p-2 font-mono">{row.type}</td>
                        <td className="border border-gray-200 p-2">{row.required ? '必填' : '可选'}</td>
                        <td className="border border-gray-200 p-2">{row.description ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mb-1 text-xs text-gray-500">示例</div>
              <JsonBlock value={example} />
            </Card>
          )
        : (
            <JsonBlock value={data} />
          )}
    </div>
  )
}
