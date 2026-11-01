import { describe, expect, it, vi } from 'vitest'

import { BodyType } from '@/enums'

// buildRequest 内部无条件通过 IPC 批量解析动态变量；单测中替换为恒等解析
vi.mock('./useResolvedVarMap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useResolvedVarMap')>()

  return {
    ...actual,
    resolveTemplateBatch: vi.fn((fields: string[]) =>
      Promise.resolve(fields.map((f) => ({ resolved: f, vars: [], errors: [] }))),
    ),
  }
})

import { buildRequest } from './buildRequest'

function baseCtx(overrides: Partial<Parameters<typeof buildRequest>[0]> = {}) {
  return {
    method: 'GET',
    baseUrl: 'https://api.example.com',
    path: '/pets',
    query: [],
    header: [],
    cookie: [],
    body: undefined,
    resolveVars: (v: string) => v,
    buildBodyExample: () => '',
    apiDetails: {} as never,
    menuRawList: undefined,
    insecureSkipVerify: false,
    ...overrides,
  }
}

describe('buildRequest GET/HEAD body 守卫', () => {
  it('GET 携带 JSON body 时被剔除并给出警告', async () => {
    const result = await buildRequest(baseCtx({
      method: 'GET',
      body: { type: BodyType.Json, rawText: '{"a":1}' },
    }))

    expect(result.bodyText).toBe('')
    expect(result.contentType).toBeUndefined()
    expect(result.bodyWarning).toContain('GET/HEAD')
  })

  it('HEAD 携带 body 时同样剔除并警告', async () => {
    const result = await buildRequest(baseCtx({
      method: 'HEAD',
      body: { type: BodyType.Raw, rawText: 'payload' },
    }))

    expect(result.bodyText).toBe('')
    expect(result.bodyWarning).toBeTruthy()
  })

  it('POST 正常携带 body 且无警告', async () => {
    const result = await buildRequest(baseCtx({
      method: 'POST',
      path: '/pets',
      body: { type: BodyType.Json, rawText: '{"a":1}' },
    }))

    expect(result.bodyText).toBe('{"a":1}')
    expect(result.contentType).toBe('application/json')
    expect(result.bodyWarning).toBeUndefined()
  })

  it('GET 无 body 时不产生警告', async () => {
    const result = await buildRequest(baseCtx({ method: 'GET' }))

    expect(result.bodyText).toBe('')
    expect(result.bodyWarning).toBeUndefined()
  })
})

describe('buildRequest binary 原始请求体', () => {
  it('携带文件时产出 bodyFile 与 octet-stream，且不发文本', async () => {
    const result = await buildRequest(baseCtx({
      method: 'POST',
      body: { type: BodyType.Binary, filePath: '/tmp/a.bin' },
    }))

    expect(result.bodyFile).toBe('/tmp/a.bin')
    expect(result.contentType).toBe('application/octet-stream')
    expect(result.bodyText).toBe('')
    expect(result.bodyWarning).toBeUndefined()
  })

  it('未选文件时给出明确警告，不静默发送空 body', async () => {
    const result = await buildRequest(baseCtx({
      method: 'POST',
      body: { type: BodyType.Binary },
    }))

    expect(result.bodyFile).toBeUndefined()
    expect(result.bodyWarning).toContain('未选择文件')
  })

  it('GET 携带 binary 时被剔除并给出 GET/HEAD 警告', async () => {
    const result = await buildRequest(baseCtx({
      method: 'GET',
      body: { type: BodyType.Binary, filePath: '/tmp/a.bin' },
    }))

    expect(result.bodyFile).toBeUndefined()
    expect(result.contentType).toBeUndefined()
    expect(result.bodyWarning).toContain('GET/HEAD')
  })
})

describe('buildRequest Body 空值处理', () => {
  const schemaExample = () => '{"from":"schema"}'

  it('rawText 缺省时默认不兜底，发送空 body 但仍保留 Content-Type', async () => {
    const result = await buildRequest(baseCtx({
      method: 'POST',
      body: { type: BodyType.Json },
      buildBodyExample: schemaExample,
    }))

    expect(result.bodyText).toBe('')
    expect(result.contentType).toBe('application/json')
  })

  it('rawText 为纯空白时同样视为空，不发送内容', async () => {
    const result = await buildRequest(baseCtx({
      method: 'POST',
      body: { type: BodyType.Json, rawText: '   ' },
      buildBodyExample: schemaExample,
    }))

    expect(result.bodyText).toBe('')
  })

  it('fallbackBodyExample 开启时按 schema 兜底（批量运行路径）', async () => {
    const result = await buildRequest(baseCtx({
      method: 'POST',
      body: { type: BodyType.Json },
      buildBodyExample: schemaExample,
      fallbackBodyExample: true,
    }))

    expect(result.bodyText).toBe('{"from":"schema"}')
  })

  it('rawText 有内容时原样发送，不使用 schema', async () => {
    const result = await buildRequest(baseCtx({
      method: 'POST',
      body: { type: BodyType.Json, rawText: '{"a":1}' },
      buildBodyExample: schemaExample,
      fallbackBodyExample: true,
    }))

    expect(result.bodyText).toBe('{"a":1}')
  })
})
