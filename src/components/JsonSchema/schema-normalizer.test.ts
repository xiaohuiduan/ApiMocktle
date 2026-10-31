import { describe, expect, it } from 'vitest'

import type { ApiMenuData } from '@/components/ApiMenu'
import { MenuItemType } from '@/enums'

import { SchemaType } from './constants'
import type { JsonSchema } from './JsonSchema.type'
import {
  buildSchemaExample,
  buildSchemaRows,
  denormalizeJsonSchema,
  expandAllOf,
  getTypeLabel,
  normalizeJsonSchema,
} from './schema-normalizer'

/** 最小模型库：CommonResponse 含 code / message 两个字段。 */
const menuRawList: ApiMenuData[] = [
  {
    id: 'model-1',
    name: 'CommonResponse',
    type: MenuItemType.ApiSchema,
    data: {
      jsonSchema: {
        type: SchemaType.Object,
        properties: [
          { name: 'code', type: SchemaType.Integer, required: true },
          { name: 'message', type: SchemaType.String },
        ],
      },
    },
  },
]

function fieldNames(schema: JsonSchema): (string | undefined)[] {
  if (schema.type !== SchemaType.Object || !Array.isArray(schema.properties)) { return [] }

  return schema.properties.map((prop) => prop.name)
}

describe('expandAllOf', () => {
  it('合并多个 inline 成员的字段，字段数与各成员之和一致', () => {
    const schema = {
      allOf: [
        { type: 'object', properties: { code: { type: 'integer' } }, required: ['code'] },
        { type: 'object', properties: { message: { type: 'string' } } },
      ],
    } as unknown as JsonSchema

    const expanded = expandAllOf(schema)

    expect(fieldNames(expanded)).toEqual(['code', 'message'])
  })

  it('成员里的 $ref 能解析成模型字段', () => {
    const schema = {
      allOf: [
        { $ref: '#/definitions/CommonResponse' },
        { type: 'object', properties: { data: { type: 'object', properties: { id: { type: 'integer' } } } } },
      ],
    } as unknown as JsonSchema

    const expanded = expandAllOf(schema, menuRawList)

    expect(fieldNames(expanded)).toEqual(['code', 'message', 'data'])
  })

  it('解析不到的 $ref 成员被跳过，不产出空字段', () => {
    const schema = {
      allOf: [
        { $ref: '#/definitions/NotExist' },
        { type: 'object', properties: { data: { type: 'string' } } },
      ],
    } as unknown as JsonSchema

    const expanded = expandAllOf(schema, menuRawList)

    expect(fieldNames(expanded)).toEqual(['data'])
  })

  it('合并后保留必填标记', () => {
    const schema = {
      allOf: [{ type: 'object', properties: { code: { type: 'integer' } }, required: ['code'] }],
    } as unknown as JsonSchema

    const expanded = expandAllOf(schema)

    expect(expanded.type === SchemaType.Object && expanded.properties?.[0].required).toBe(true)
  })

  it('没有 allOf 的 schema 原样返回', () => {
    const schema: JsonSchema = {
      type: SchemaType.Object,
      properties: [{ name: 'a', type: SchemaType.String }],
    }

    expect(expandAllOf(schema)).toBe(schema)
  })
})

describe('buildSchemaRows', () => {
  it('allOf 组合能展开出实际字段，不再是空字段列表', () => {
    const schema = {
      allOf: [
        { $ref: '#/definitions/CommonResponse' },
        { type: 'object', properties: { data: { type: 'object', properties: { id: { type: 'integer' } } } } },
      ],
    } as unknown as JsonSchema

    const rows = buildSchemaRows(schema, menuRawList)

    expect(rows.map((row) => row.name)).toEqual(['code', 'message', 'data', 'id'])
  })
})

describe('buildSchemaExample', () => {
  it('allOf 组合能生成示例对象', () => {
    const schema = {
      allOf: [
        { $ref: '#/definitions/CommonResponse' },
        { type: 'object', properties: { data: { type: 'object', properties: { id: { type: 'integer' } } } } },
      ],
    } as unknown as JsonSchema

    expect(buildSchemaExample(schema, menuRawList)).toEqual({
      code: 0,
      message: 'string',
      data: { id: 0 },
    })
  })
})

describe('normalizeJsonSchema', () => {
  it('联合类型取首个非 null 类型并标记可空', () => {
    const normalized = normalizeJsonSchema({ type: ['string', 'null'], name: 'msg' }) as Record<string, unknown>

    expect(normalized.type).toBe('string')
    expect(normalized.nullable).toBe(true)
  })

  it('联合类型里 null 在前时同样取到实际类型', () => {
    const normalized = normalizeJsonSchema({ type: ['null', 'integer'] }) as Record<string, unknown>

    expect(normalized.type).toBe('integer')
    expect(normalized.nullable).toBe(true)
  })

  it('联合类型全是 null 时原样保留', () => {
    const normalized = normalizeJsonSchema({ type: ['null'] }) as Record<string, unknown>

    expect(normalized.type).toEqual(['null'])
    expect(normalized.nullable).toBeUndefined()
  })

  it('数组形态 properties 的必填下放到字段上（含 object 子节点）', () => {
    const normalized = normalizeJsonSchema({
      type: 'object',
      required: ['user', 'name'],
      properties: [
        { name: 'user', type: 'object', properties: [{ name: 'id', type: 'integer' }] },
        { name: 'name', type: 'string' },
      ],
    }) as { properties: { name?: string, required?: boolean }[] }

    expect(normalized.properties[0].required).toBe(true)
    expect(normalized.properties[1].required).toBe(true)
  })
})

describe('denormalizeJsonSchema', () => {
  it('反归一化保留可空标记', () => {
    const denormalized = denormalizeJsonSchema({ type: 'string', nullable: true }) as Record<string, unknown>

    expect(denormalized.nullable).toBe(true)
  })

  it('反归一化把字段必填还原成 required 数组', () => {
    const denormalized = denormalizeJsonSchema({
      type: 'object',
      properties: [{ name: 'code', type: 'integer', required: true }],
    }) as Record<string, unknown>

    expect(denormalized.required).toEqual(['code'])
  })
})

describe('getTypeLabel', () => {
  it('可空类型展示为可空标注，不出现拼接的类型串', () => {
    expect(getTypeLabel({ type: SchemaType.String, nullable: true })).toBe('string（可空）')
    expect(getTypeLabel({ type: SchemaType.String })).toBe('string')
  })
})
