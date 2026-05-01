import { describe, expect, it } from 'vitest'
import { SchemaType, type JsonSchema } from '@/components/JsonSchema'
import { generateApiDocHtml, generateMhtml } from './api-doc-html'

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

// ── buildSchemaExample (via generateApiDocHtml) ──

describe('generateApiDocHtml', () => {
  it('generates valid HTML for a single API', () => {
    const html = generateApiDocHtml('Test Project', [makeApiDetail()])
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
  })

  it('escapes HTML special characters in project name', () => {
    const html = generateApiDocHtml('<script>alert("xss")</script>', [makeApiDetail()])
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;alert')
  })

  it('handles empty items array', () => {
    const html = generateApiDocHtml('Empty', [])
    expect(html).toContain('0 个接口')
  })

  it('handles multiple APIs', () => {
    const items = [
      makeApiDetail({ id: 'api-1', name: 'First API' }),
      makeApiDetail({ id: 'api-2', name: 'Second API' }),
    ]
    const html = generateApiDocHtml('Multi', items)
    expect(html).toContain('2 个接口')
    expect(html).toContain('First API')
    expect(html).toContain('Second API')
  })
})

// ── Schema rendering edge cases ──

describe('schema rendering edge cases', () => {
  it('handles Object schema with non-array properties (the forEach bug)', () => {
    // This mimics the bug scenario: properties is an object instead of an array
    const item = makeApiDetail()
    ;(item.data.requestBody!.jsonSchema!.properties as unknown) = { foo: 'bar' }
    // Should not throw
    expect(() => generateApiDocHtml('Bug Test', [item])).not.toThrow()
  })

  it('handles Object schema with null properties', () => {
    const item = makeApiDetail()
    ;(item.data.requestBody!.jsonSchema!.properties as unknown) = null
    expect(() => generateApiDocHtml('Null Props', [item])).not.toThrow()
  })

  it('handles Object schema with undefined properties', () => {
    const item = makeApiDetail()
    ;(item.data.requestBody!.jsonSchema!.properties as unknown) = undefined
    expect(() => generateApiDocHtml('Undefined Props', [item])).not.toThrow()
  })

  it('handles response schema with non-array properties', () => {
    const item = makeApiDetail()
    ;(item.data.responses![0]!.jsonSchema!.properties as unknown) = 'not-an-array'
    expect(() => generateApiDocHtml('Bug Resp', [item])).not.toThrow()
  })

  it('handles API without parameters', () => {
    const item = makeApiDetail()
    item.data.parameters = { path: [], query: [], header: [], cookie: [] }
    const html = generateApiDocHtml('No Params', [item])
    expect(html).not.toContain('请求参数')
  })

  it('handles API without requestBody', () => {
    const item = makeApiDetail()
    item.data.requestBody = undefined as unknown as typeof item.data.requestBody
    const html = generateApiDocHtml('No Body', [item])
    expect(html).toContain('Test API')
  })

  it('handles API without responses', () => {
    const item = makeApiDetail()
    item.data.responses = []
    const html = generateApiDocHtml('No Responses', [item])
    expect(html).toContain('Test API')
  })

  it('handles primitive schema type (no properties)', () => {
    const item = makeApiDetail()
    item.data.requestBody!.jsonSchema = { type: SchemaType.String, name: 'text' } as JsonSchema
    const html = generateApiDocHtml('Primitive', [item])
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
    expect(() => generateApiDocHtml('Array', [item])).not.toThrow()
  })

  it('handles API with all HTTP methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    for (const method of methods) {
      const item = makeApiDetail()
      item.data.method = method
      const html = generateApiDocHtml('Methods', [item])
      expect(html).toContain(method)
    }
  })
})

// ── generateMhtml ──

describe('generateMhtml', () => {
  it('generates valid MHTML with correct MIME headers', () => {
    const mhtml = generateMhtml('MHTML Test', [makeApiDetail()])
    expect(mhtml).toContain('MIME-Version: 1.0')
    expect(mhtml).toContain('Content-Type: multipart/related')
    expect(mhtml).toContain('Content-Type: text/html; charset=utf-8')
    expect(mhtml).toContain('Content-Transfer-Encoding: 8bit')
    expect(mhtml).toContain('<!DOCTYPE html>')
    expect(mhtml).toContain('MHTML Test')
  })

  it('generates MHTML boundary separators', () => {
    const mhtml = generateMhtml('Boundary', [makeApiDetail()])
    expect(mhtml).toContain('----=_NextBoundary_001')
  })

  it('handles multiple APIs in MHTML', () => {
    const items = [makeApiDetail({ id: 'a1' }), makeApiDetail({ id: 'a2' })]
    const mhtml = generateMhtml('Multi', items)
    expect(mhtml).toContain('2 个接口')
  })
})
