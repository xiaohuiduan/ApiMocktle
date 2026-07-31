import { describe, expect, it } from 'vitest'

import { type JsonSchema, SchemaType } from '@/components/JsonSchema'
import type { ApiDetails } from '@/types'

import type { ExportApi } from './api-doc-markdown'
import {
  generateApiDocHtml,
  generateApiDocMhtml,
  quotedPrintable,
} from './api-doc-mhtml'

function makeApiDetail(opts?: {
  id?: string,
  name?: string,
  dataOverrides?: Record<string, unknown>,
}): ExportApi {
  const { id = 'api-1', name = 'Test API', dataOverrides = {} } = opts ?? {}

  return {
    id,
    name,
    data: {
      id,
      method: 'GET',
      path: '/api/test',
      description: 'A test API',
      status: 'released',
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
              properties: [{ name: 'deep', type: SchemaType.String }],
            } satisfies JsonSchema,
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
            properties: [{ name: 'result', type: SchemaType.String }] satisfies JsonSchema[],
          } satisfies JsonSchema,
        },
      ],
      ...dataOverrides,
    } as unknown as ApiDetails,
  } as ExportApi
}

/** 简易 quoted-printable 解码(含软换行),还原为 UTF-8 文本 */
function qpDecode(text: string): string {
  const bytes: number[] = []

  for (let i = 0; i < text.length; i++) {
    // QP 文本的行分隔符,不属于内容
    if (text[i] === '\r' && text[i + 1] === '\n') {
      i++
      continue
    }

    if (text[i] === '=' && text[i + 1] === '\r' && text[i + 2] === '\n') {
      i += 2
      continue
    }

    if (text[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16))
      i += 2
      continue
    }

    bytes.push(text.charCodeAt(i))
  }

  return new TextDecoder().decode(Uint8Array.from(bytes))
}

function extractHtmlPart(mhtml: string): string {
  const boundary = (/boundary="([^"]+)"/.exec(mhtml))?.[1]

  if (!boundary) {
    throw new Error('boundary not found')
  }

  const partStart = mhtml.indexOf('Content-Transfer-Encoding: quoted-printable')
  const bodyStart = mhtml.indexOf('\r\n\r\n', partStart) + 4
  const bodyEnd = mhtml.indexOf(`\r\n--${boundary}`, bodyStart)

  return qpDecode(mhtml.slice(bodyStart, bodyEnd))
}

// ── MHTML 结构 ──

describe('generateApiDocMhtml structure', () => {
  it('produces multipart/related MIME envelope', () => {
    const mhtml = generateApiDocMhtml('Test Project', [], [makeApiDetail()], 1)
    const boundary = (/boundary="([^"]+)"/.exec(mhtml))?.[1]

    expect(mhtml.startsWith('MIME-Version: 1.0\r\n')).toBe(true)
    expect(mhtml).toContain('Content-Type: multipart/related;')
    expect(mhtml).toContain(`boundary="${boundary}"`)
    expect(mhtml).toContain('Content-Type: text/html; charset="utf-8"')
    expect(mhtml).toContain('Content-Transfer-Encoding: quoted-printable')
    expect(mhtml).toContain(`--${boundary}--`)
    expect(mhtml.trimEnd().endsWith(`--${boundary}--`)).toBe(true)
  })

  it('uses CRLF line endings only', () => {
    const mhtml = generateApiDocMhtml('Test Project', [], [makeApiDetail()], 1)
    expect(mhtml).not.toMatch(/[^\r]\n/)
    expect(mhtml).toContain('\r\n')
  })

  it('keeps every quoted-printable line within 76 chars', () => {
    const mhtml = generateApiDocMhtml('Test Project', [], [makeApiDetail()], 1)
    const body = mhtml.slice(mhtml.indexOf('\r\n\r\n') + 4)

    for (const line of body.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(76)
    }
  })

  it('round-trips through quoted-printable back to the original HTML', () => {
    const projectName = 'Test Project'
    const item = makeApiDetail()
    const html = generateApiDocHtml(projectName, [], [item], 1)
    const mhtml = generateApiDocMhtml(projectName, [], [item], 1)
    expect(extractHtmlPart(mhtml)).toBe(html)
  })
})

// ── HTML 内容 ──

describe('generateApiDocMhtml HTML content', () => {
  it('includes project header and API details', () => {
    const html = extractHtmlPart(generateApiDocMhtml('Test Project', [], [makeApiDetail()], 1))

    expect(html).toContain('<title>Test Project - API 文档</title>')
    expect(html).toContain('共 1 个接口')
    expect(html).toContain('GET')
    expect(html).toContain('/api/test')
    expect(html).toContain('Test API')
    expect(html).toContain('A test API')
    expect(html).toContain('id="api-0"')
    expect(html).toContain('Resource ID')
    expect(html).toContain('Page number')
    expect(html).toContain('Title field')
    expect(html).toContain('nested')
    expect(html).toContain('result')
    expect(html).toContain('&quot;result&quot;: &quot;string&quot;')
    expect(html).toContain('200')
  })

  it('renders TOC with folder anchors', () => {
    const item = makeApiDetail({ id: 'a1', name: 'First API' })
    const tree = {
      folders: [{ name: '我的文件夹', children: [item] }],
      ungrouped: [],
      totalCount: 1,
    }
    const html = extractHtmlPart(generateApiDocMhtml('TOC', tree.folders, tree.ungrouped, tree.totalCount))

    expect(html).toContain('我的文件夹')
    expect(html).toContain('href="#api-0"')
    expect(html).toContain('<h2>我的文件夹</h2>')
  })

  it('escapes HTML special characters', () => {
    const item = makeApiDetail({ name: '<script>alert(1)</script>' })
    const html = extractHtmlPart(generateApiDocMhtml('Escape', [], [item], 1))

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('handles empty project', () => {
    const html = extractHtmlPart(generateApiDocMhtml('Empty', [], [], 0))
    expect(html).toContain('共 0 个接口')
    expect(html).not.toContain('class="api"')
  })

  it('handles API without params, body or responses', () => {
    const item = makeApiDetail()
    item.data.parameters = { path: [], query: [], header: [], cookie: [] }
    item.data.requestBody = undefined
    item.data.responses = []
    const html = extractHtmlPart(generateApiDocMhtml('Minimal', [], [item], 1))

    expect(html).toContain('Test API')
    expect(html).not.toContain('请求参数')
    expect(html).not.toContain('返回响应')
  })

  it('does not emit script tags anywhere in the envelope', () => {
    const item = makeApiDetail({ name: '<script>alert(1)</script>' })
    const mhtml = generateApiDocMhtml('Safe', [], [item], 1)
    expect(mhtml).not.toContain('<script>')
  })
})

// ── quoted-printable ──

describe('quotedPrintable', () => {
  it('encodes non-ASCII and control bytes', () => {
    expect(quotedPrintable('中')).toBe('=E4=B8=AD\r\n')
    expect(quotedPrintable('=')).toBe('=3D\r\n')
    expect(quotedPrintable('a\nb')).toBe('a=0Ab\r\n')
  })

  it('encodes leading and trailing spaces', () => {
    expect(quotedPrintable(' x ')).toBe('=20x=20\r\n')
  })

  it('soft-wraps long lines with trailing equals', () => {
    const encoded = quotedPrintable('a'.repeat(200))

    for (const line of encoded.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(76)
    }

    expect(encoded).toMatch(/(^|=\r\n)a{75}=\r\n/)
  })
})
