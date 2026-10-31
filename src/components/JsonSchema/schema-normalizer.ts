import type { ApiMenuData } from '@/components/ApiMenu'
import { MenuItemType } from '@/enums'

import { SchemaType } from './constants'
import type { JsonSchema } from './JsonSchema.type'

// ─── 归一化（外部格式 → 内部格式）──────────────────────────────────────────────

/**
 * 将任意 JSON Schema 转为内部规范格式。
 * - `properties` 从 object map 转为数组 `[{name, type, ...}]`
 * - `$ref`-only schema 补上 `type: 'ref'`
 * - 从父级 `required[]` 中提取 `required: true`
 * - 递归处理所有嵌套节点
 */
export function normalizeJsonSchema(schema: unknown, parentRequired?: string[]): unknown {
  if (!schema || typeof schema !== 'object') { return schema }

  const s = schema as Record<string, unknown>

  // 1. $ref-only schema（标准 JSON Schema 引用）
  if (typeof s.$ref === 'string' && !s.type) {
    return { ...s, type: SchemaType.Refer }
  }

  // 2. 类型未知但有 $ref → 标记为 ref
  if (typeof s.$ref === 'string' && s.type !== SchemaType.Refer) {
    return normalizeJsonSchema({ $ref: s.$ref }, parentRequired)
  }

  // 3. 联合类型（type 为数组，如 ["string","null"]）→ 取首个非 null 类型并标记 nullable
  if (Array.isArray(s.type)) {
    const types = (s.type as unknown[]).filter((t): t is string => typeof t === 'string')
    const nullType = SchemaType.Null as string
    const primary = types.find((t) => t !== nullType)

    // 全为 null 或没有字符串项 → 原样保留，避免产出无类型节点
    if (!primary) { return schema }

    const next: Record<string, unknown> = { ...s, type: primary }

    if (types.includes(nullType)) { next.nullable = true }

    return normalizeJsonSchema(next, parentRequired)
  }

  // 4. object 类型，properties 为 object map → 转数组
  if (s.type === 'object' && s.properties && !Array.isArray(s.properties) && typeof s.properties === 'object') {
    const propsObj = s.properties as Record<string, unknown>
    const reqList: string[] = Array.isArray(s.required) ? s.required as string[] : []
    const propsArray = Object.entries(propsObj).map(([name, def]) => {
      const normalized = normalizeJsonSchema(def, reqList) as Record<string, unknown>
      const isRequired = reqList.includes(name)

      return { name, ...normalized, ...(isRequired && !normalized.required ? { required: true } : {}) }
    })
    const result: Record<string, unknown> = { ...s, properties: propsArray }

    if (s.required) { delete result.required } // 已提取到各字段的 required 属性

    return result
  }

  // 5. object 类型，properties 已为数组 → 递归归一化
  if (s.type === 'object' && Array.isArray(s.properties)) {
    const reqList: string[] = Array.isArray(s.required) ? s.required as string[] : []
    const result: Record<string, unknown> = {
      ...s,
      properties: (s.properties as unknown[]).map((prop) => {
        const normalized = normalizeJsonSchema(prop, reqList)
        const record = (normalized && typeof normalized === 'object') ? normalized as Record<string, unknown> : {}
        const name = typeof record.name === 'string' ? record.name : ''

        // 父级 required[] 是权威来源：object / array 子节点不会消费 parentRequired，需在此补齐
        return reqList.includes(name) ? { ...record, required: true } : normalized
      }),
    }

    if (s.required) { delete result.required }

    return result
  }

  // 6. array 类型 → 递归归一化 items
  if (s.type === 'array' && s.items) {
    return { ...s, items: normalizeJsonSchema(s.items, parentRequired) }
  }

  // 7. 叶子节点：应用父级 required
  if (s.type && s.type !== 'object' && s.type !== 'array' && parentRequired && s.name && parentRequired.includes(s.name as string)) {
    return { ...s, required: true }
  }

  return schema
}

// ─── 反向归一化（内部格式 → 标准 JSON Schema）─────────────────────────────────

/**
 * 将内部格式转为标准 JSON Schema（供导出/显示用）。
 * - `properties` 从数组转回 object map
 * - 收集 `required: true` 的字段名，重组 `required[]`
 */
export function denormalizeJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') { return schema }

  const s = schema as Record<string, unknown>

  // $ref 引用直接透传
  if (s.type === SchemaType.Refer && typeof s.$ref === 'string') {
    const result: Record<string, unknown> = { $ref: s.$ref }

    if (s.description) { result.description = s.description }

    return result
  }

  // object 类型，properties 为数组 → 转 object map
  if (s.type === 'object' && Array.isArray(s.properties)) {
    const propsObj: Record<string, unknown> = {}
    const requiredList: string[] = []
    ;(s.properties as Record<string, unknown>[]).forEach((prop) => {
      const { name, required, ...rest } = prop

      if (name) {
        propsObj[name as string] = denormalizeJsonSchema(rest)

        if (required) { requiredList.push(name as string) }
      }
    })
    const result: Record<string, unknown> = { type: 'object', properties: propsObj }

    if (requiredList.length > 0) { result.required = requiredList }

    if (s.description) { result.description = s.description }

    if (s.title) { result.title = s.title }

    if (s.nullable !== undefined) { result.nullable = s.nullable }

    return result
  }

  // array 类型
  if (s.type === 'array' && s.items) {
    const result: Record<string, unknown> = { type: 'array', items: denormalizeJsonSchema(s.items) }

    if (s.nullable !== undefined) { result.nullable = s.nullable }

    return result
  }

  // 叶子节点
  const result: Record<string, unknown> = {}

  if (s.type) { result.type = s.type }

  if (s.description) { result.description = s.description }

  if (s.title) { result.title = s.title }

  if (s.enum) { result.enum = s.enum }

  if (s.format) { result.format = s.format }

  if (s.minimum !== undefined) { result.minimum = s.minimum }

  if (s.maximum !== undefined) { result.maximum = s.maximum }

  if (s.default !== undefined) { result.default = s.default }

  if (s.example !== undefined) { result.example = s.example }

  if (s.nullable !== undefined) { result.nullable = s.nullable }

  return result
}

// ─── 遍历 ApiDetails 中的所有 schema 并归一化 ──────────────────────────────────

interface HasJsonSchema { jsonSchema?: unknown }

interface HasRequestBody { requestBody?: { jsonSchema?: unknown, type?: string } }
interface HasResponses { responses?: { jsonSchema?: unknown }[] }
interface HasData { data?: HasJsonSchema }

type NormalizableItem = HasJsonSchema & HasRequestBody & HasResponses & HasData

/**
 * 对从后端加载的菜单列表中所有 schema 执行统一归一化。
 */
export function normalizeMenuRawList(menuRawList: unknown[]): unknown[] {
  return menuRawList.map((item) => {
    const menuItem = item as Record<string, unknown> & { type?: string, data?: Record<string, unknown> }

    if (!menuItem.data) { return item }

    // apiSchema 数据模型：data.jsonSchema
    if (menuItem.type === MenuItemType.ApiSchema || menuItem.type === MenuItemType.ApiSchemaFolder) {
      const data = menuItem.data as HasJsonSchema

      if (data.jsonSchema) {
        data.jsonSchema = normalizeJsonSchema(data.jsonSchema)
      }
    }

    // apiDetail / HttpRequest：data 中有 requestBody.jsonSchema、responses[].jsonSchema
    if (menuItem.type === MenuItemType.ApiDetail || menuItem.type === MenuItemType.HttpRequest) {
      const data = menuItem.data as NormalizableItem

      if (data.requestBody?.jsonSchema) {
        data.requestBody.jsonSchema = normalizeJsonSchema(data.requestBody.jsonSchema)
      }

      if (data.responses) {
        data.responses = data.responses.map((resp) => {
          if (resp.jsonSchema) {
            return { ...resp, jsonSchema: normalizeJsonSchema(resp.jsonSchema) }
          }

          return resp
        })
      }
    }

    return item
  })
}

// ─── 共享显示工具：buildSchemaRows ─────────────────────────────────────────────

export interface SchemaFieldRow {
  key: string
  name: string
  typeLabel: string
  description?: string
  required?: boolean
  depth: number
}

function extractRefName(ref: string): string {
  const parts = ref.split('/')

  return parts[parts.length - 1] || ref
}

function resolveRef(
  schema: JsonSchema,
  menuRawList?: ApiMenuData[],
  visited?: Set<string>,
): JsonSchema {
  const visitedSet = visited ?? new Set<string>()

  if (schema.type !== SchemaType.Refer) { return schema }

  if (visitedSet.has(schema.$ref)) { return schema }

  visitedSet.add(schema.$ref)

  const name = extractRefName(schema.$ref)
  const menuData = menuRawList?.find(
    (item) => item.name === name && item.type === MenuItemType.ApiSchema,
  )
  const resolved = menuData?.type === MenuItemType.ApiSchema ? menuData.data?.jsonSchema : undefined

  if (!resolved) { return schema }

  if (resolved.type === SchemaType.Object && Array.isArray(resolved.properties)) {
    visitedSet.add(schema.$ref)

    return {
      ...resolved,
      name: schema.name ?? resolved.name,
      description: schema.description ?? resolved.description,
      properties: resolved.properties.map((prop) => resolveRef(prop, menuRawList, new Set(visitedSet))),
    }
  }

  return schema
}

/**
 * 展开 allOf 组合 schema：把各成员的字段合并成一个 object 视图。
 * - `$ref` 成员按「$ref 末段匹配模型名」解析，解析不到则跳过该成员（不产出空字段）
 * - properties 按字段名合并（后者覆盖前者），required[] 去重合并
 * 只用于展示与示例生成，不改写库中的原始 allOf 结构。
 */
export function expandAllOf(schema: JsonSchema, menuRawList?: ApiMenuData[]): JsonSchema {
  const s = schema as unknown as Record<string, unknown> | null | undefined

  if (!s || !Array.isArray(s.allOf)) { return schema }

  const fields = new Map<string, Record<string, unknown>>()
  const requiredNames = new Set<string>()
  let memberDescription = ''

  for (const rawMember of s.allOf as unknown[]) {
    if (!rawMember || typeof rawMember !== 'object') { continue }

    let member = rawMember as Record<string, unknown>

    // $ref 成员：解析成真实模型；解析不到则跳过，避免产出空字段
    if (typeof member.$ref === 'string') {
      const refSchema = { ...member, type: SchemaType.Refer } as unknown as JsonSchema
      const resolved = resolveRef(refSchema, menuRawList)

      if (resolved.type === SchemaType.Refer) { continue }

      member = resolved as unknown as Record<string, unknown>
    }

    // 成员缺少 type 但带 properties → 按 object 处理
    if (!member.type && member.properties) { member = { ...member, type: SchemaType.Object } }

    if (!memberDescription && typeof member.description === 'string') { memberDescription = member.description }

    if (Array.isArray(member.required)) {
      for (const name of member.required as unknown[]) {
        if (typeof name === 'string') { requiredNames.add(name) }
      }
    }

    const normalized = normalizeJsonSchema(member) as Record<string, unknown>
    const props = Array.isArray(normalized.properties) ? normalized.properties as unknown[] : []

    for (const prop of props) {
      if (!prop || typeof prop !== 'object') { continue }

      const record = prop as Record<string, unknown>
      const name = record.name

      if (typeof name !== 'string' || !name) { continue }

      fields.set(name, record)

      if (record.required) { requiredNames.add(name) }
    }
  }

  const properties = Array.from(fields.entries()).map(([name, prop]) => (
    requiredNames.has(name) ? { ...prop, required: true } : prop
  ))

  const result: Record<string, unknown> = { type: SchemaType.Object, properties }

  const mergedRequired = properties
    .map((prop) => prop.name)
    .filter((name): name is string => typeof name === 'string' && requiredNames.has(name))

  if (mergedRequired.length > 0) { result.required = mergedRequired }

  const description = typeof s.description === 'string' && s.description ? s.description : memberDescription

  if (description) { result.description = description }

  return result as unknown as JsonSchema
}

export function getTypeLabel(node?: JsonSchema): string {
  if (!node) { return 'unknown' }

  let label: string

  if (node.type === SchemaType.Array) {
    label = `array<${getTypeLabel(node.items)}>`
  }
  else if (node.type === SchemaType.Refer) {
    label = extractRefName(node.$ref)
  }
  else {
    label = node.type ?? 'unknown'
  }

  return node.nullable ? `${label}（可空）` : label
}

export function buildSchemaRows(
  schema?: JsonSchema,
  menuRawList?: ApiMenuData[],
  options?: { resolveRefs?: boolean },
): SchemaFieldRow[] {
  if (!schema) { return [] }

  const shouldResolve = options?.resolveRefs !== false
  const expanded = expandAllOf(schema, menuRawList)

  if (shouldResolve && expanded.type === SchemaType.Refer && menuRawList) {
    const resolved = resolveRef(expanded, menuRawList)

    if (resolved.type !== SchemaType.Refer) {
      return buildSchemaRows(resolved, menuRawList, options)
    }

    return [
      {
        key: 'ref-root',
        name: extractRefName(expanded.$ref),
        typeLabel: `→ ${extractRefName(expanded.$ref)}`,
        description: '引用模型未找到',
        depth: 0,
      },
    ]
  }

  if (expanded.type !== SchemaType.Object || !Array.isArray(expanded.properties)) { return [] }

  const rows: SchemaFieldRow[] = []

  const walk = (properties: JsonSchema[], depth: number) => {
    properties.forEach((field, index) => {
      const name = field.name ?? `field_${index + 1}`
      const key = `${depth}-${name}-${index}`

      rows.push({
        key,
        name,
        typeLabel: getTypeLabel(field),
        description: field.description,
        required: field.required,
        depth,
      })

      if (field.type === SchemaType.Object && Array.isArray(field.properties)) {
        walk(field.properties, depth + 1)
      }

      if (field.type === SchemaType.Array) {
        const items = field.items

        if (items.type === SchemaType.Object && Array.isArray(items.properties)) {
          walk(items.properties, depth + 1)
        }
      }

      if (shouldResolve && field.type === SchemaType.Refer && menuRawList) {
        const resolved = resolveRef(field, menuRawList)

        if (resolved.type === SchemaType.Object && Array.isArray(resolved.properties)) {
          walk(resolved.properties, depth + 1)
        }
        else if (resolved.type === SchemaType.Array) {
          const items = resolved.items

          if (items.type === SchemaType.Object && Array.isArray(items.properties)) {
            walk(items.properties, depth + 1)
          }
        }
      }
    })
  }

  walk(expanded.properties, 0)

  return rows
}

// ─── 共享显示工具：buildSchemaExample ──────────────────────────────────────────

export function buildSchemaExample(
  schema?: JsonSchema,
  menuRawList?: ApiMenuData[],
): unknown {
  if (!schema) { return {} }

  const expanded = expandAllOf(schema, menuRawList)

  if (expanded.type === SchemaType.Refer && menuRawList) {
    const resolved = resolveRef(expanded, menuRawList)

    if (resolved.type !== SchemaType.Refer) { return buildSchemaExample(resolved, menuRawList) }

    return { $ref: extractRefName(expanded.$ref) }
  }

  switch (expanded.type) {
    case SchemaType.String: return expanded.example ?? 'string'

    case SchemaType.Integer: return expanded.example ?? 0

    case SchemaType.Number: return expanded.example ?? 0

    case SchemaType.Boolean: return true

    case SchemaType.Null: return null

    case SchemaType.Array:
      return [buildSchemaExample(expanded.items, menuRawList)]

    case SchemaType.Object: {
      const output: Record<string, unknown> = {}
      expanded.properties?.forEach((field, index) => {
        const fieldName = field.name ?? `field_${index + 1}`
        output[fieldName] = buildSchemaExample(field, menuRawList)
      })

      return output
    }

    default: return {}
  }
}

// ─── 工具：从 JSON 示例推断 Schema ─────────────────────────────────────────

/**
 * 从 JSON 示例值推断出内部格式的 JsonSchema。
 * - `null` → Null
 * - `string` → String（携带 example）
 * - `number` → Integer 或 Number（携带 example）
 * - `boolean` → Boolean（携带 example）
 * - `array` → Array（items 从首元素推断；空数组默认 string）
 * - `object` → Object（每个属性递归推断，required: true）
 */
export function inferSchemaFromExample(json: unknown): JsonSchema {
  if (json === null) {
    return { type: SchemaType.Null }
  }

  if (typeof json === 'string') {
    return { type: SchemaType.String, example: json }
  }

  if (typeof json === 'number') {
    return {
      type: Number.isInteger(json) ? SchemaType.Integer : SchemaType.Number,
      example: json,
    }
  }

  if (typeof json === 'boolean') {
    return { type: SchemaType.Boolean, example: json }
  }

  if (Array.isArray(json)) {
    return {
      type: SchemaType.Array,
      items: json.length > 0 ? inferSchemaFromExample(json[0]) : { type: SchemaType.String },
    }
  }

  if (typeof json === 'object') {
    return {
      type: SchemaType.Object,
      properties: Object.entries(json as Record<string, unknown>).map(([key, val]) => ({
        name: key,
        ...inferSchemaFromExample(val),
        required: true,
      })),
    }
  }

  return { type: SchemaType.Any }
}
