import { describe, expect, it } from 'vitest'

import { SchemaType } from '@/components/JsonSchema'
import { BodyType } from '@/enums'
import type { ApiDetails } from '@/types'

import { buildJsoncBodyFillText, stripJsonComments } from './bodyJsonc'

describe('stripJsonComments', () => {
  it('删除行注释', () => {
    expect(stripJsonComments('{\n  "a": 1, // 说明\n}')).toBe('{\n  "a": 1, \n}')
  })

  it('删除块注释', () => {
    expect(stripJsonComments('{\n  "a": 1 /* 说明 */,\n}')).toBe('{\n  "a": 1 ,\n}')
  })

  it('删除跨行块注释', () => {
    expect(stripJsonComments('/* 第一行\n第二行 */{"a":1}')).toBe('{"a":1}')
  })

  it('保留字符串内部的双斜杠', () => {
    expect(stripJsonComments('{"url": "https://example.com/a"}')).toBe('{"url": "https://example.com/a"}')
  })

  it('保留字符串内部的块注释符号', () => {
    expect(stripJsonComments('{"s": "a /* b */ c"}')).toBe('{"s": "a /* b */ c"}')
  })

  it('保留转义引号字符串内的斜杠', () => {
    expect(stripJsonComments('{"s": "a \\" // x"}')).toBe('{"s": "a \\" // x"}')
  })

  it('保留单引号字符串内部的斜杠', () => {
    expect(stripJsonComments("{'s': 'https://x.com'}")).toBe("{'s': 'https://x.com'}")
  })

  it('无注释时原样返回', () => {
    const src = '{"a":1,"b":[1,2]}'
    expect(stripJsonComments(src)).toBe(src)
  })

  it('剥离后仍是可解析 JSON', () => {
    const src = '{\n  "a": 1, // 数字\n  "b": "x/y" // 文本\n}'
    expect(JSON.parse(stripJsonComments(src))).toEqual({ a: 1, b: 'x/y' })
  })
})

function makeApi(requestBody: ApiDetails['requestBody']): ApiDetails {
  return {
    id: 'api1',
    method: 'POST',
    path: '/x',
    name: '测试',
    status: 'developing',
    requestBody,
  } as ApiDetails
}

describe('buildJsoncBodyFillText', () => {
  it('字段带说明时追加行尾注释', () => {
    const api = makeApi({
      type: BodyType.Json,
      jsonSchema: {
        type: SchemaType.Object,
        properties: [
          { name: 'username', type: SchemaType.String, description: '用户名' },
          { name: 'age', type: SchemaType.Integer },
        ],
      },
    })

    const text = buildJsoncBodyFillText(api)
    expect(text).toContain('"username": "string", // 用户名')
    expect(text).toContain('"age": 0')
    expect(text).not.toContain('"age": 0, //')
  })

  it('嵌套对象递归带注释', () => {
    const api = makeApi({
      type: BodyType.Json,
      jsonSchema: {
        type: SchemaType.Object,
        properties: [
          {
            name: 'profile',
            type: SchemaType.Object,
            description: '个人资料',
            properties: [
              { name: 'bio', type: SchemaType.String, description: '简介' },
            ],
          },
        ],
      },
    })

    const text = buildJsoncBodyFillText(api)
    expect(text).toContain('"profile": { // 个人资料')
    expect(text).toContain('"bio": "string" // 简介')
  })

  it('数组字段递归生成', () => {
    const api = makeApi({
      type: BodyType.Json,
      jsonSchema: {
        type: SchemaType.Object,
        properties: [
          {
            name: 'tags',
            type: SchemaType.Array,
            description: '标签列表',
            items: { type: SchemaType.String },
          },
        ],
      },
    })

    const text = buildJsoncBodyFillText(api)
    expect(text).toContain('"tags": [ // 标签列表')
    expect(text).toContain('"string"')
  })

  it('说明含换行时压成单行注释', () => {
    const api = makeApi({
      type: BodyType.Json,
      jsonSchema: {
        type: SchemaType.Object,
        properties: [
          { name: 'a', type: SchemaType.String, description: '第一行\n第二行' },
        ],
      },
    })

    const text = buildJsoncBodyFillText(api)
    expect(text).toContain('// 第一行 第二行')
    expect(text).not.toContain('\n//')
  })

  it('生成结果剥离注释后是可解析 JSON', () => {
    const api = makeApi({
      type: BodyType.Json,
      jsonSchema: {
        type: SchemaType.Object,
        properties: [
          { name: 'username', type: SchemaType.String, description: '用户名' },
          {
            name: 'profile',
            type: SchemaType.Object,
            properties: [
              { name: 'bio', type: SchemaType.String, description: '简介' },
            ],
          },
        ],
      },
    })

    const text = buildJsoncBodyFillText(api)
    expect(JSON.parse(stripJsonComments(text))).toEqual({
      username: 'string',
      profile: { bio: 'string' },
    })
  })

  it('无 jsonSchema 时返回空字符串', () => {
    const api = makeApi({ type: BodyType.Json })
    expect(buildJsoncBodyFillText(api)).toBe('')
  })

  it('非 JSON body 返回空字符串', () => {
    const api = makeApi({ type: BodyType.FormData, parameters: [] })
    expect(buildJsoncBodyFillText(api)).toBe('')
  })
})
