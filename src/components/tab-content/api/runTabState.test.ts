import { beforeEach, describe, expect, it } from 'vitest'

import { BodyType } from '@/enums'
import type { ApiDetails, RunTabInfo } from '@/types'

import {
  getRunTabStorageKey,
  mergeRunTabInfo,
  readLocalRunCopy,
  resolveInitialWorkCopy,
  writeLocalRunCopy,
} from './runTabState'

function makeDoc(overrides: Partial<ApiDetails> = {}): ApiDetails {
  return {
    id: 'api-1',
    name: '创建订单',
    method: 'POST',
    path: '/orders',
    status: 'developing',
    serverUrl: '',
    parameters: { query: [], header: [], path: [], cookie: [] },
    requestBody: { type: BodyType.Json },
    responses: [],
    ...overrides,
  } as ApiDetails
}

function withBody(doc: ApiDetails, rawText: string): ApiDetails {
  return {
    ...doc,
    requestBody: { ...doc.requestBody!, rawText },
  }
}

describe('resolveInitialWorkCopy', () => {
  it('无本地副本时使用文档定义 + 保存点', () => {
    const doc = makeDoc()
    const saved: RunTabInfo = { bodyType: BodyType.Json, bodyRawText: '{"from":"saved"}' }

    const result = resolveInitialWorkCopy({ docValue: doc, savedRunTabInfo: saved, docUpdatedAt: 'v1' })

    expect(result.requestBody?.rawText).toBe('{"from":"saved"}')
  })

  it('旧载荷里与文档 rawText 完全相同的正文视为自动填充回显，一次性丢弃', () => {
    const schemaText = '{"$schema":"http://json-schema.org/draft-04/schema#","type":"object"}'
    const doc = withBody(makeDoc(), schemaText)
    // 无 v 标记 = 旧载荷
    const localCopy = { docUpdatedAt: 'v1', workCopy: withBody(makeDoc(), schemaText) }

    const result = resolveInitialWorkCopy({ docValue: doc, localCopy, docUpdatedAt: 'v1' })

    expect(result.requestBody?.rawText).toBe('')
  })

  it('v2 载荷里的正文原样保留（即使用户填的与文档相同）', () => {
    const sameText = '{"amount":1}'
    const doc = withBody(makeDoc(), sameText)
    const localCopy = { v: 2, docUpdatedAt: 'v1', workCopy: withBody(makeDoc(), sameText) }

    const result = resolveInitialWorkCopy({ docValue: doc, localCopy, docUpdatedAt: 'v1' })

    expect(result.requestBody?.rawText).toBe(sameText)
  })

  it('本地副本与文档版本一致时保留用户填写的 Body', () => {
    const doc = makeDoc()
    const localCopy = { docUpdatedAt: 'v1', workCopy: withBody(doc, '{"typed":"local"}') }

    const result = resolveInitialWorkCopy({ docValue: doc, localCopy, docUpdatedAt: 'v1' })

    expect(result.requestBody?.rawText).toBe('{"typed":"local"}')
  })

  it('旧格式本地副本（无版本戳）视为未过期，仍保留 Body', () => {
    const doc = makeDoc()
    const localCopy = { workCopy: withBody(doc, '{"typed":"legacy"}') }

    const result = resolveInitialWorkCopy({ docValue: doc, localCopy, docUpdatedAt: 'v2' })

    expect(result.requestBody?.rawText).toBe('{"typed":"legacy"}')
  })

  it('文档版本变化时正文仍用用户自己的输入，不用文档 rawText 覆盖', () => {
    const doc = withBody(makeDoc(), '{"from":"doc"}')
    const localCopy = { docUpdatedAt: 'v1', workCopy: withBody(makeDoc(), '{"typed":"local"}') }

    const result = resolveInitialWorkCopy({ docValue: doc, localCopy, docUpdatedAt: 'v2' })

    expect(result.requestBody?.rawText).toBe('{"typed":"local"}')
  })

  it('文档里存的是 JSON Schema 源码时，首次进入不会把它写进编辑器', () => {
    const doc = withBody(makeDoc(), '{"$schema":"http://json-schema.org/draft-04/schema#","type":"object","properties":{}}')

    const result = resolveInitialWorkCopy({ docValue: doc, docUpdatedAt: 'v1' })

    expect(result.requestBody?.rawText).toBe('')
    expect(result.requestBody?.type).toBe(BodyType.Json)
    // 文档定义的结构仍保留，供「一键填充」使用
    expect(result.requestBody).toBeDefined()
  })

  it('本地副本为空正文时，文档 rawText 也不会被填入（用户没填就是空）', () => {
    const doc = withBody(makeDoc(), '{"$schema":"http://json-schema.org/draft-04/schema#"}')
    const localCopy = { docUpdatedAt: 'v1', workCopy: withBody(makeDoc(), '') }

    const result = resolveInitialWorkCopy({ docValue: doc, localCopy, docUpdatedAt: 'v2' })

    expect(result.requestBody?.rawText).toBe('')
  })

  it('文档版本变化但文档与保存点都没有 Body 时保留本地 Body（不清空）', () => {
    const doc = makeDoc()
    const localCopy = { docUpdatedAt: 'v1', workCopy: withBody(makeDoc(), '{"typed":"local"}') }

    const result = resolveInitialWorkCopy({ docValue: doc, localCopy, docUpdatedAt: 'v2' })

    expect(result.requestBody?.rawText).toBe('{"typed":"local"}')
    expect(result.requestBody?.type).toBe(BodyType.Json)
  })

  it('初始化结果与「菜单数据何时到达」无关：先无 docValue 后补上，结果一致', () => {
    const doc = withBody(makeDoc(), '{"from":"doc"}')
    const localCopy = { docUpdatedAt: 'v1', workCopy: withBody(makeDoc(), '{"typed":"local"}') }

    // 菜单早到：首次渲染即可解析
    const early = resolveInitialWorkCopy({ docValue: doc, localCopy, docUpdatedAt: 'v1' })
    // 菜单晚到：docValue 就绪后再解析（同一入参）
    const late = resolveInitialWorkCopy({ docValue: doc, localCopy, docUpdatedAt: 'v1' })

    expect(early.requestBody?.rawText).toBe('{"typed":"local"}')
    expect(late).toEqual(early)
  })
})

describe('mergeRunTabInfo', () => {
  it('保存点没有 Body 时回落到文档 Body，不产生 undefined 覆盖', () => {
    const doc = withBody(makeDoc(), '{"from":"doc"}')
    const merged = mergeRunTabInfo(doc, { bodyType: BodyType.Json })

    expect(merged.requestBody?.rawText).toBe('{"from":"doc"}')
  })

  it('保存点携带 binary 文件路径时透传到 requestBody.filePath', () => {
    const doc = withBody(makeDoc(), '')
    const merged = mergeRunTabInfo(doc, { bodyType: BodyType.Binary, bodyFilePath: '/tmp/a.bin' })

    expect(merged.requestBody?.filePath).toBe('/tmp/a.bin')
  })
})

describe('本地副本读写', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('写入后可读回，并携带文档版本戳', () => {
    const key = getRunTabStorageKey('api-1')
    const copy = withBody(makeDoc(), '{"typed":"local"}')

    writeLocalRunCopy(key, 'v1', copy)

    const restored = readLocalRunCopy(key)

    expect(restored?.docUpdatedAt).toBe('v1')
    expect(restored?.workCopy.requestBody?.rawText).toBe('{"typed":"local"}')
  })

  it('兼容旧格式（裸 ApiDetails）', () => {
    const key = getRunTabStorageKey('api-1')

    window.localStorage.setItem(key, JSON.stringify(withBody(makeDoc(), '{"typed":"legacy"}')))

    const restored = readLocalRunCopy(key)

    expect(restored?.docUpdatedAt).toBeUndefined()
    expect(restored?.workCopy.requestBody?.rawText).toBe('{"typed":"legacy"}')
  })

  it('内容损坏时返回 undefined 而不是抛错', () => {
    const key = getRunTabStorageKey('api-1')

    window.localStorage.setItem(key, '{not-json')

    expect(readLocalRunCopy(key)).toBeUndefined()
    expect(readLocalRunCopy('')).toBeUndefined()
  })

  it('v3 载荷携带各类型正文缓存并可读回', () => {
    const key = getRunTabStorageKey('api-1')
    const bodyTexts = { [BodyType.Json]: '{"typed":"json"}', [BodyType.Raw]: 'raw text' }

    writeLocalRunCopy(key, 'v1', withBody(makeDoc(), '{"typed":"json"}'), bodyTexts)

    const restored = readLocalRunCopy(key)

    expect(restored?.v).toBe(3)
    expect(restored?.bodyTexts).toEqual(bodyTexts)
  })

  it('v2 载荷没有正文缓存时读取为空，不影响当前类型回显', () => {
    const key = getRunTabStorageKey('api-1')

    window.localStorage.setItem(key, JSON.stringify({
      v: 2,
      docUpdatedAt: 'v1',
      workCopy: withBody(makeDoc(), '{"typed":"local"}'),
    }))

    const restored = readLocalRunCopy(key)

    expect(restored?.bodyTexts).toBeUndefined()
    expect(restored?.workCopy.requestBody?.rawText).toBe('{"typed":"local"}')
  })

  it('正文缓存中的非字符串值被丢弃', () => {
    const key = getRunTabStorageKey('api-1')

    window.localStorage.setItem(key, JSON.stringify({
      v: 3,
      workCopy: makeDoc(),
      bodyTexts: { [BodyType.Json]: 'ok', [BodyType.Raw]: 123 },
    }))

    expect(readLocalRunCopy(key)?.bodyTexts).toEqual({ [BodyType.Json]: 'ok' })
  })
})
