import { describe, expect, it } from 'vitest'
import { SchemaType, type JsonSchema } from '@/components/JsonSchema'
import { generateApiDocHtml, generateMhtml, type ExportApi, type ExportFolder, type ExportTreeInput } from './api-doc-html'

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

// helper: build tree input from flat list
function treeInput(projectName: string, items: ReturnType<typeof makeApiDetail>[]): ExportTreeInput {
  return { folders: [], ungrouped: items, totalCount: items.length }
}

function treeFromFolder(name: string, items: ReturnType<typeof makeApiDetail>[]): ExportTreeInput {
  return { folders: [{ name, children: items }], ungrouped: [], totalCount: items.length }
}

// ── generateApiDocHtml ──

describe('generateApiDocHtml', () => {
  it('generates valid HTML for a single API', () => {
    const api = makeApiDetail()
    const html = generateApiDocHtml('Test Project', [], [api], 1)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>Test Project - API 文档</title>')
    expect(html).toContain('GET')
    expect(html).toContain('/api/test')
    expect(html).toContain('Test API')
    expect(html).toContain('id')
    expect(html).toContain('page')
    expect(html).toContain('title')
    expect(html).toContain('nested')
    expect(html).toContain('Resource ID')
    expect(html).toContain('接口目录 (1)')
  })

  it('escapes HTML special characters in project name', () => {
    const html = generateApiDocHtml('<script>alert("xss")</script>', [], [makeApiDetail()], 1)
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;alert')
  })

  it('handles empty items', () => {
    const html = generateApiDocHtml('Empty', [], [], 0)
    expect(html).toContain('0 个接口')
    expect(html).toContain('暂无接口数据')
  })

  it('handles multiple APIs in ungrouped list', () => {
    const items = [
      makeApiDetail({ id: 'api-1', name: 'First API' }),
      makeApiDetail({ id: 'api-2', name: 'Second API' }),
    ]
    const html = generateApiDocHtml('Multi', [], items, 2)
    expect(html).toContain('2 个接口')
    expect(html).toContain('First API')
    expect(html).toContain('Second API')
  })

  it('renders folder tree in sidebar', () => {
    const items = [makeApiDetail({ id: 'a1', name: 'In Folder' })]
    const html = generateApiDocHtml('Folders', [{ name: '我的文件夹', children: items }], [], 1)
    expect(html).toContain('我的文件夹')
    expect(html).toContain('In Folder')
  })

  it('uses native details/summary for folder collapse with radio button navigation', () => {
    const html = generateApiDocHtml('Native', [], [makeApiDetail()], 1)
    expect(html).not.toContain('<script>')
    expect(html).toContain('<label class="doc-sidebar-item"')
    expect(html).toContain('<input type="radio" name="api-nav"')
    expect(html).toContain('checked')
  })

  it('generates radio inputs for each API with first checked by default', () => {
    const items = [
      makeApiDetail({ id: 'api-1', name: 'First' }),
      makeApiDetail({ id: 'api-2', name: 'Second' }),
    ]
    const html = generateApiDocHtml('Radios', [], items, 2)
    expect(html).toContain('<input type="radio" name="api-nav" id="r-api-1" class="api-radio" checked>')
    expect(html).toContain('<input type="radio" name="api-nav" id="r-api-2" class="api-radio">')
    expect(html).not.toContain('<input type="radio" name="api-nav" id="r-api-2" class="api-radio" checked>')
  })

  it('generates per-API CSS show/hide rules via sibling combinator', () => {
    const items = [makeApiDetail({ id: 'api-1' })]
    const html = generateApiDocHtml('CSS', [], items, 1)
    expect(html).toContain('#r-api-1:checked~.doc-body .api-detail-api-1{display:block')
  })

  it('generates sidebar active-state rules via :has()', () => {
    const items = [makeApiDetail({ id: 'abc' })]
    const html = generateApiDocHtml('Has', [], items, 1)
    expect(html).toContain('body:has(#r-abc:checked) .doc-sidebar label[for="r-abc"]')
  })

  it('does not use anchor links for API navigation', () => {
    const html = generateApiDocHtml('NoAnchors', [], [makeApiDetail()], 1)
    expect(html).not.toContain('<a class="doc-sidebar-item"')
    expect(html).toContain('<label class="doc-sidebar-item"')
  })

  it('api-section has api-detail-{id} class for CSS targeting', () => {
    const html = generateApiDocHtml('Classes', [], [makeApiDetail({ id: 'x-99' })], 1)
    expect(html).toContain('api-detail-x-99')
  })

  it('empty API list produces no radio inputs', () => {
    const html = generateApiDocHtml('Empty', [], [], 0)
    expect(html).not.toContain('<input type="radio"')
  })

  it('renders mixed folders + ungrouped', () => {
    const grouped = [makeApiDetail({ id: 'g1', name: 'Grouped API' })]
    const ungrouped = [makeApiDetail({ id: 'u1', name: 'Ungrouped API' })]
    const html = generateApiDocHtml('Mixed', [{ name: 'Test Folder', children: grouped }], ungrouped, 2)
    expect(html).toContain('Test Folder')
    expect(html).toContain('Grouped API')
    expect(html).toContain('未分组')
    expect(html).toContain('Ungrouped API')
  })
})

// ── Schema rendering edge cases ──

describe('schema rendering edge cases', () => {
  it('handles Object schema with non-array properties (the forEach bug)', () => {
    const item = makeApiDetail()
    ;(item.data.requestBody!.jsonSchema!.properties as unknown) = { foo: 'bar' }
    expect(() => generateApiDocHtml('Bug Test', [], [item], 1)).not.toThrow()
  })

  it('handles Object schema with null properties', () => {
    const item = makeApiDetail()
    ;(item.data.requestBody!.jsonSchema!.properties as unknown) = null
    expect(() => generateApiDocHtml('Null Props', [], [item], 1)).not.toThrow()
  })

  it('handles Object schema with undefined properties', () => {
    const item = makeApiDetail()
    ;(item.data.requestBody!.jsonSchema!.properties as unknown) = undefined
    expect(() => generateApiDocHtml('Undefined Props', [], [item], 1)).not.toThrow()
  })

  it('handles response schema with non-array properties', () => {
    const item = makeApiDetail()
    ;(item.data.responses![0]!.jsonSchema!.properties as unknown) = 'not-an-array'
    expect(() => generateApiDocHtml('Bug Resp', [], [item], 1)).not.toThrow()
  })

  it('handles API without parameters', () => {
    const item = makeApiDetail()
    item.data.parameters = { path: [], query: [], header: [], cookie: [] }
    const html = generateApiDocHtml('No Params', [], [item], 1)
    expect(html).not.toContain('请求参数')
  })

  it('handles API without requestBody', () => {
    const item = makeApiDetail()
    item.data.requestBody = undefined as unknown as typeof item.data.requestBody
    const html = generateApiDocHtml('No Body', [], [item], 1)
    expect(html).toContain('Test API')
  })

  it('handles API without responses', () => {
    const item = makeApiDetail()
    item.data.responses = []
    const html = generateApiDocHtml('No Responses', [], [item], 1)
    expect(html).toContain('Test API')
  })

  it('handles primitive schema type (no properties)', () => {
    const item = makeApiDetail()
    item.data.requestBody!.jsonSchema = { type: SchemaType.String, name: 'text' } as JsonSchema
    const html = generateApiDocHtml('Primitive', [], [item], 1)
    expect(html).toContain('string')
  })

  it('handles Array schema type with Object items', () => {
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
    expect(() => generateApiDocHtml('Array', [], [item], 1)).not.toThrow()
  })

  it('handles API with all HTTP methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    for (const method of methods) {
      const item = makeApiDetail()
      item.data.method = method
      const html = generateApiDocHtml('Methods', [], [item], 1)
      expect(html).toContain(method)
    }
  })
})

// ── generateMhtml ──

describe('generateMhtml', () => {
  it('generates valid MHTML with correct MIME headers', () => {
    const mhtml = generateMhtml('MHTML Test', treeInput('MHTML Test', [makeApiDetail()]))
    expect(mhtml).toContain('MIME-Version: 1.0')
    expect(mhtml).toContain('Content-Type: multipart/related')
    expect(mhtml).toContain('Content-Type: text/html; charset=utf-8')
    expect(mhtml).toContain('Content-Transfer-Encoding: 8bit')
    expect(mhtml).toContain('<!DOCTYPE html>')
    expect(mhtml).toContain('MHTML Test')
  })

  it('generates MHTML boundary separators', () => {
    const mhtml = generateMhtml('Boundary', treeInput('Boundary', [makeApiDetail()]))
    expect(mhtml).toContain('----=_NextBoundary_001')
  })

  it('handles multiple APIs in MHTML', () => {
    const items = [makeApiDetail({ id: 'a1' }), makeApiDetail({ id: 'a2' })]
    const mhtml = generateMhtml('Multi', treeInput('Multi', items))
    expect(mhtml).toContain('2 个接口')
  })

  it('handles folder structure in MHTML', () => {
    const items = [makeApiDetail({ id: 'fa1', name: 'Folded API' })]
    const mhtml = generateMhtml('Folders', treeFromFolder('API 分组', items))
    expect(mhtml).toContain('API 分组')
    expect(mhtml).toContain('Folded API')
  })
})
