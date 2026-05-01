import { describe, expect, it } from 'vitest'
import { SchemaType, type JsonSchema } from '@/components/JsonSchema'
import { generateApiDocMarkdown, type ExportApi, type ExportFolder, type ExportTreeInput } from './api-doc-markdown'

function makeApiDetail(opts?: { id?: string; name?: string; dataOverrides?: Record<string, unknown> }) {
  const { id = 'api-1', name = 'Test API', dataOverrides = {} } = opts ?? {}
  return {
    id,
    name,
    data: {
      method: 'GET',
      path: '/api/test',
      description: 'A test API',
      parameters: {
        path: [{ name: 'id', type: 'string', required: true, description: 'Resource ID', example: '123' }],
        query: [{ name: 'page', type: 'integer', required: false, description: 'Page number', example: 1 }],
        header: [],
        cookie: [],
      },
      requestBody: {
        type: 'application/json',
        jsonSchema: {
          type: SchemaType.Object,
          name: 'body',
          properties: [
            { name: 'title', type: SchemaType.String, description: 'Title field' },
            { name: 'count', type: SchemaType.Integer, description: 'Count field' },
            {
              name: 'nested',
              type: SchemaType.Object,
              properties: [
                { name: 'deep', type: SchemaType.String },
              ],
            },
          ] satisfies JsonSchema[],
        } satisfies JsonSchema,
      },
      responses: [
        {
          code: 200,
          name: 'OK',
          contentType: 'application/json',
          jsonSchema: {
            type: SchemaType.Object,
            properties: [
              { name: 'result', type: SchemaType.String },
            ] satisfies JsonSchema[],
          } satisfies JsonSchema,
        },
      ],
      ...dataOverrides,
    },
  }
}

function treeInput(projectName: string, items: ReturnType<typeof makeApiDetail>[]): ExportTreeInput {
  return { folders: [], ungrouped: items, totalCount: items.length }
}

function treeFromFolder(name: string, items: ReturnType<typeof makeApiDetail>[]): ExportTreeInput {
  return { folders: [{ name, children: items }], ungrouped: [], totalCount: items.length }
}

// ── generateApiDocMarkdown ──

describe('generateApiDocMarkdown', () => {
  it('generates valid markdown for a single API', () => {
    const md = generateApiDocMarkdown('Test Project', [], [makeApiDetail()], 1)
    expect(md).toContain('# Test Project - API 文档')
    expect(md).toContain('> 共 1 个接口')
    expect(md).toContain('### GET /api/test')
    expect(md).toContain('**Test API**')
    expect(md).toContain('A test API')
    expect(md).toContain('| id | string | 是 | Resource ID | 123 |')
    expect(md).toContain('| page | integer | 否 | Page number | 1 |')
    expect(md).toContain('| title | string | 可选 | Title field |')
    expect(md).toContain('| nested | object | 可选 | - |')
    expect(md).toContain('| result | string | 可选 | - |')
    expect(md).toContain('```json')
  })

  it('generates table of contents with folder tree', () => {
    const items = [makeApiDetail({ id: 'a1', name: 'First API' })]
    const md = generateApiDocMarkdown('TOC', [{ name: '我的文件夹', children: items }], [], 1)
    expect(md).toContain('## 目录')
    expect(md).toContain('- **我的文件夹**')
    expect(md).toContain('  - GET /api/test First API')
  })

  it('handles empty items', () => {
    const md = generateApiDocMarkdown('Empty', [], [], 0)
    expect(md).toContain('> 共 0 个接口')
    expect(md).not.toContain('###')
  })

  it('handles multiple APIs in ungrouped list', () => {
    const items = [
      makeApiDetail({ id: 'api-1', name: 'First API' }),
      makeApiDetail({ id: 'api-2', name: 'Second API' }),
    ]
    const md = generateApiDocMarkdown('Multi', [], items, 2)
    expect(md).toContain('> 共 2 个接口')
    expect(md).toContain('**First API**')
    expect(md).toContain('**Second API**')
  })

  it('renders folder and ungrouped sections', () => {
    const grouped = [makeApiDetail({ id: 'g1', name: 'Grouped API' })]
    const ungrouped = [makeApiDetail({ id: 'u1', name: 'Ungrouped API' })]
    const md = generateApiDocMarkdown('Mixed', [{ name: 'Test Folder', children: grouped }], ungrouped, 2)
    expect(md).toContain('## Test Folder')
    expect(md).toContain('**Grouped API**')
    expect(md).toContain('## 未分组')
    expect(md).toContain('**Ungrouped API**')
  })

  it('escapes markdown special characters in names', () => {
    const api = makeApiDetail({ name: 'API | with ` backticks' })
    const md = generateApiDocMarkdown('Escape', [], [api], 1)
    expect(md).toContain('API \\| with \\` backticks')
  })
})

// ── Schema rendering ──

describe('schema rendering in markdown', () => {
  it('renders Object schema with field table', () => {
    const item = makeApiDetail()
    const md = generateApiDocMarkdown('Schema', [], [item], 1)
    expect(md).toContain('| 字段名 | 类型 | 必填 | 说明 |')
    expect(md).toContain('| title | string | 可选 | Title field |')
    expect(md).toContain('|   deep | string | 可选 | - |')
  })

  it('renders primitive schema type', () => {
    const item = makeApiDetail()
    item.data.requestBody!.jsonSchema = { type: SchemaType.String, name: 'text' } as JsonSchema
    const md = generateApiDocMarkdown('Primitive', [], [item], 1)
    expect(md).toContain('`string`')
  })

  it('renders Array schema with Object items', () => {
    const item = makeApiDetail()
    item.data.requestBody!.jsonSchema = {
      type: SchemaType.Array,
      name: 'list',
      items: {
        type: SchemaType.Object,
        name: 'item',
        properties: [
          { name: 'id', type: SchemaType.Integer },
        ] satisfies JsonSchema[],
      } as JsonSchema,
    } as JsonSchema
    const md = generateApiDocMarkdown('Array', [], [item], 1)
    expect(md).toContain('array')
    expect(md).toContain('| id | integer |')
  })

  it('handles Object schema with non-array properties', () => {
    const item = makeApiDetail()
    ;(item.data.requestBody!.jsonSchema!.properties as unknown) = { foo: 'bar' }
    expect(() => generateApiDocMarkdown('Bug', [], [item], 1)).not.toThrow()
  })

  it('handles schema node with undefined type (the replace bug)', () => {
    const item = makeApiDetail()
    ;(item.data.requestBody!.jsonSchema!.properties as any)[0]!.type = undefined as any
    expect(() => generateApiDocMarkdown('Missing Type', [], [item], 1)).not.toThrow()
  })

  it('handles null properties gracefully', () => {
    const item = makeApiDetail()
    ;(item.data.requestBody!.jsonSchema!.properties as unknown) = null
    expect(() => generateApiDocMarkdown('Null', [], [item], 1)).not.toThrow()
  })
})

// ── Edge cases ──

describe('edge cases in markdown generation', () => {
  it('handles API without parameters', () => {
    const item = makeApiDetail()
    item.data.parameters = { path: [], query: [], header: [], cookie: [] }
    const md = generateApiDocMarkdown('No Params', [], [item], 1)
    expect(md).not.toContain('请求参数')
  })

  it('handles API without requestBody', () => {
    const item = makeApiDetail()
    item.data.requestBody = undefined as unknown as typeof item.data.requestBody
    const md = generateApiDocMarkdown('No Body', [], [item], 1)
    expect(md).toContain('**Test API**')
  })

  it('handles API without responses', () => {
    const item = makeApiDetail()
    item.data.responses = []
    const md = generateApiDocMarkdown('No Responses', [], [item], 1)
    expect(md).toContain('**Test API**')
    expect(md).not.toContain('返回响应')
  })

  it('handles all HTTP methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    for (const method of methods) {
      const item = makeApiDetail()
      item.data.method = method
      const md = generateApiDocMarkdown('Methods', [], [item], 1)
      expect(md).toContain(`### ${method}`)
    }
  })

  it('includes response status code and example', () => {
    const item = makeApiDetail()
    const md = generateApiDocMarkdown('Resp', [], [item], 1)
    expect(md).toContain('##### 200 OK')
    expect(md).toContain('| 200 | application/json |')
  })

  it('does not include HTML tags', () => {
    const md = generateApiDocMarkdown('NoHTML', [], [makeApiDetail()], 1)
    expect(md).not.toContain('<div')
    expect(md).not.toContain('<script')
    expect(md).not.toContain('<style')
  })
})

// ── generateMhtml is removed; downloadMarkdown requires Tauri runtime, skip in unit test ──
