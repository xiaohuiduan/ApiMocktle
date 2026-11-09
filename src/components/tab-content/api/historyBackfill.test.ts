import { describe, expect, it } from 'vitest'

import { BodyType, ParamType } from '@/enums'
import type { ApiDetails, Parameter } from '@/types'

import { applyHistoryToWorkCopy } from './historyBackfill'

function makeWorkCopy(overrides: Partial<ApiDetails> = {}): ApiDetails {
  return {
    id: 'api-1',
    name: '查询业务系统',
    method: 'GET',
    path: '/biz/sys',
    status: 'developing',
    serverUrl: '',
    parameters: { query: [], header: [], cookie: [], path: [] },
    requestBody: { type: BodyType.None },
    responses: [],
    ...overrides,
  } as ApiDetails
}

function param(name: string, example: string, extra: Partial<Parameter> = {}): Parameter {
  return { id: `p-${name}`, name, example, enable: true, type: ParamType.String, ...extra } as Parameter
}

describe('applyHistoryToWorkCopy', () => {
  it('用历史值覆盖文档同名 query，并保留文档的说明与顺序', () => {
    const current = makeWorkCopy({
      parameters: {
        query: [param('bizSys', '@id', { description: '业务系统' }), param('bizSysType', '@string')],
        header: [],
        cookie: [],
        path: [],
      } as ApiDetails['parameters'],
    })

    const next = applyHistoryToWorkCopy({
      current,
      requestJson: {
        url: 'https://dev.a.com/biz/sys?bizSysType=MAIN&bizSys=1001',
        method: 'GET',
        headers: [],
        body: '',
      },
    })

    expect(next.parameters?.query?.map((p) => [p.name, p.example])).toEqual([
      ['bizSys', '1001'],
      ['bizSysType', 'MAIN'],
    ])
    expect(next.parameters?.query?.[0].description).toBe('业务系统')
    expect(next.parameters?.query?.[0].id).toBe('p-bizSys')
  })

  it('历史里存在、文档里没有的 query 追加到末尾', () => {
    const current = makeWorkCopy({
      parameters: {
        query: [param('page', '1')],
        header: [],
        cookie: [],
        path: [],
      } as ApiDetails['parameters'],
    })

    const next = applyHistoryToWorkCopy({
      current,
      requestJson: { url: '/list?page=2&size=20', method: 'GET', headers: [], body: '' },
    })

    expect(next.parameters?.query?.map((p) => [p.name, p.example])).toEqual([
      ['page', '2'],
      ['size', '20'],
    ])
    expect(next.parameters?.query?.[1].type).toBe(ParamType.String)
    expect(next.parameters?.query?.[1].enable).toBe(true)
  })

  it('骨架里历史没有的参数原样保留，不改启用状态', () => {
    const current = makeWorkCopy({
      parameters: {
        query: [param('page', '1', { enable: false })],
        header: [],
        cookie: [],
        path: [],
      } as ApiDetails['parameters'],
    })

    const next = applyHistoryToWorkCopy({
      current,
      requestJson: { url: '/list', method: 'GET', headers: [], body: '' },
    })

    expect(next.parameters?.query).toEqual([param('page', '1', { enable: false })])
  })

  it('header 名忽略大小写匹配', () => {
    const current = makeWorkCopy({
      parameters: {
        query: [],
        header: [param('X-Token', '@token')],
        cookie: [],
        path: [],
      } as ApiDetails['parameters'],
    })

    const next = applyHistoryToWorkCopy({
      current,
      requestJson: {
        url: '/biz/sys',
        method: 'GET',
        headers: [{ name: 'x-token', value: 'abc' }],
        body: '',
      },
    })

    expect(next.parameters?.header).toHaveLength(1)
    expect(next.parameters?.header?.[0].example).toBe('abc')
  })

  it('Cookie header 拆成 cookie 参数，不再留在 header 里', () => {
    const current = makeWorkCopy()

    const next = applyHistoryToWorkCopy({
      current,
      requestJson: {
        url: '/biz/sys',
        method: 'GET',
        headers: [{ name: 'Cookie', value: 'sid=abc; theme=dark' }],
        body: '',
      },
    })

    expect(next.parameters?.cookie?.map((p) => [p.name, p.example])).toEqual([
      ['sid', 'abc'],
      ['theme', 'dark'],
    ])
    expect(next.parameters?.header).toEqual([])
  })

  it('数组类型骨架按数组形态写回，参数面板不会显示空值', () => {
    const current = makeWorkCopy({
      parameters: {
        query: [{ id: 'q1', name: 'tag', example: ['old'], enable: true, type: ParamType.Array }],
        header: [],
        cookie: [],
        path: [],
      } as ApiDetails['parameters'],
    })

    const next = applyHistoryToWorkCopy({
      current,
      requestJson: { url: '/list?tag=a&tag=b', method: 'GET', headers: [], body: '' },
    })

    expect(next.parameters?.query).toHaveLength(1)
    expect(next.parameters?.query?.[0].example).toEqual(['a', 'b'])
    expect(next.parameters?.query?.[0].type).toBe(ParamType.Array)
  })

  it('同名参数在历史里重复出现时不折叠', () => {
    const current = makeWorkCopy({
      parameters: {
        query: [param('tag', 'x')],
        header: [],
        cookie: [],
        path: [],
      } as ApiDetails['parameters'],
    })

    const next = applyHistoryToWorkCopy({
      current,
      requestJson: { url: '/list?tag=a&tag=b', method: 'GET', headers: [], body: '' },
    })

    expect(next.parameters?.query?.map((p) => [p.name, p.example])).toEqual([
      ['tag', 'a'],
      ['tag', 'b'],
    ])
  })

  it('历史带 Cookie 时清掉骨架里的 Cookie header，避免发出两个 Cookie 头', () => {
    const current = makeWorkCopy({
      parameters: {
        query: [],
        header: [param('Cookie', 'sid=old')],
        cookie: [],
        path: [],
      } as ApiDetails['parameters'],
    })

    const next = applyHistoryToWorkCopy({
      current,
      requestJson: {
        url: '/x',
        method: 'GET',
        headers: [{ name: 'Cookie', value: 'sid=abc' }],
        body: '',
      },
    })

    expect(next.parameters?.header?.some((h) => (h.name ?? '').toLowerCase() === 'cookie')).toBe(false)
    expect(next.parameters?.cookie?.map((c) => [c.name, c.example])).toEqual([['sid', 'abc']])
  })

  it('历史 body 按 contentType 推断类型并写入', () => {
    const current = makeWorkCopy({ requestBody: { type: BodyType.None } as ApiDetails['requestBody'] })

    const next = applyHistoryToWorkCopy({
      current,
      requestJson: {
        url: '/biz/sys',
        method: 'POST',
        headers: [],
        body: '{"amount":1}',
        contentType: 'application/json',
      },
    })

    expect(next.requestBody?.type).toBe(BodyType.Json)
    expect(next.requestBody?.rawText).toBe('{"amount":1}')
  })

  it('文档没有 requestBody 时也能写入历史 body', () => {
    const current = makeWorkCopy({ requestBody: undefined })

    const next = applyHistoryToWorkCopy({
      current,
      requestJson: {
        url: '/biz/sys',
        method: 'POST',
        headers: [],
        body: 'plain',
        contentType: 'text/plain',
      },
    })

    expect(next.requestBody?.type).toBe(BodyType.Raw)
    expect(next.requestBody?.rawText).toBe('plain')
  })

  it('历史 body 为空时不动当前正文', () => {
    const current = makeWorkCopy({
      requestBody: { type: BodyType.Json, rawText: '{"local":true}' } as ApiDetails['requestBody'],
    })

    const next = applyHistoryToWorkCopy({
      current,
      requestJson: { url: '/biz/sys', method: 'GET', headers: [], body: '' },
    })

    expect(next.requestBody?.rawText).toBe('{"local":true}')
  })

  it('绝对地址按环境 baseUrl 还原为相对路径，并优先历史的方法', () => {
    const current = makeWorkCopy({ path: '/old' })

    const next = applyHistoryToWorkCopy({
      current,
      requestJson: {
        url: 'https://dev.a.com/biz/sys?bizSys=1001',
        method: 'POST',
        headers: [],
        body: '',
      },
      baseUrls: ['https://dev.a.com'],
    })

    expect(next.path).toBe('/biz/sys')
    expect(next.method).toBe('POST')
  })

  it('用户自己填的模板值同样被历史覆盖（整体还原口径）', () => {
    const current = makeWorkCopy({
      parameters: {
        query: [param('bizSys', '{{sysId}}')],
        header: [],
        cookie: [],
        path: [],
      } as ApiDetails['parameters'],
    })

    const next = applyHistoryToWorkCopy({
      current,
      requestJson: { url: '/biz/sys?bizSys=1001', method: 'GET', headers: [], body: '' },
    })

    expect(next.parameters?.query?.[0].example).toBe('1001')
  })

  it('requestJson 缺失时原样返回', () => {
    const current = makeWorkCopy()

    expect(applyHistoryToWorkCopy({ current })).toBe(current)
  })
})
