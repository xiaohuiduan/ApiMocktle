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
