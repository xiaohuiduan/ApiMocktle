import type { ApiMenuData } from '@/components/ApiMenu'
import { MenuItemType } from '@/enums'

import { INDENT, KEY_ITEMS, KEY_PROPERTIES, SchemaType, SEPARATOR } from './constants'
import type { FieldPath, JsonSchema } from './JsonSchema.type'

/**
 * 标准化 JSON Schema：将标准 JSON Schema 格式（$ref-only、properties 为对象 map）转换为内部格式。
 * 递归处理所有嵌套节点。
 */
export function normalizeJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema

  const s = schema as Record<string, unknown>

  // 标准化 $ref-only schema：{ "$ref": "..." } → { type: "ref", "$ref": "..." }
  if (typeof s.$ref === 'string' && !s.type) {
    return normalizeJsonSchema({ ...s, type: SchemaType.Refer })
  }

  // 标准化 properties：Object map → Array
  if (s.type === 'object' && s.properties && typeof s.properties === 'object' && !Array.isArray(s.properties)) {
    const propsObj = s.properties as Record<string, unknown>
    const propsArray = Object.entries(propsObj).map(([name, def]) => ({
      name,
      ...(normalizeJsonSchema(def) as Record<string, unknown>),
    }))
    return { ...s, properties: propsArray }
  }

  // 递归处理嵌套
  if (s.type === 'object' && Array.isArray(s.properties)) {
    return {
      ...s,
      properties: (s.properties as unknown[]).map((prop) => normalizeJsonSchema(prop)),
    }
  }

  if (s.type === 'array' && s.items) {
    return { ...s, items: normalizeJsonSchema(s.items) }
  }

  // 路径引用（标准 JSON Schema $ref）
  if (typeof s.$ref === 'string') {
    return { ...s, type: SchemaType.Refer }
  }

  return schema
}

/**
 * 递归解析 JsonSchema，将所有可展开的节点的字段路径作为 key，最后合并到一个数组中并返回。
 *
 * @example
 *
 * { properties: [{}, { properties: [{}] }, { items: {} }] }
 * =>
 * ['properties.0', 'properties.1.properties.0', 'properties.2.items']
 */
export function getAllExpandedKeys(
  jsonSchema: JsonSchema,
  path: FieldPath[] = [],
  keys: string[] = []
): string[] {
  if (jsonSchema.type === SchemaType.Object) {
    if (keys.length === 0) {
      keys.push('') // <-- 根节点
    }

    if (Array.isArray(jsonSchema.properties)) {
      jsonSchema.properties.forEach((js, i) => {
        const newPath = [...path, KEY_PROPERTIES, `${i}`]
        keys.push(newPath.join(SEPARATOR))
        getAllExpandedKeys(js, newPath, keys)
      })
    }
  } else if (jsonSchema.type === SchemaType.Array) {
    const newPath = [...path, KEY_ITEMS]
    keys.push(newPath.join(SEPARATOR))
    getAllExpandedKeys(jsonSchema.items, newPath, keys)
  } else if (jsonSchema.type === SchemaType.Refer) {
    // $ref 引用节点也需要默认展开
    if (keys.length === 0) {
      keys.push('')
    }
  }

  return keys
}

/**
 * 根据 Schema 中字段的路径，获取到该字段的层级。
 */
export function getNodeLevelInfo(fieldPath: FieldPath[]): { level: number; indentWidth: number } {
  const level = fieldPath.filter(
    (pathName) => pathName === KEY_PROPERTIES || pathName === KEY_ITEMS
  ).length

  const indentWidth = level * INDENT

  return { level, indentWidth }
}

function extractRefName(ref: string): string {
  const parts = ref.split('/')
  return parts[parts.length - 1] || ref
}

export function getRefJsonSchema(
  menuRawList: ApiMenuData[],
  refName: string
): JsonSchema | undefined {
  const name = extractRefName(refName)

  const menuData = menuRawList.find(
    (item) => item.name === name && item.type === MenuItemType.ApiSchema
  )

  const jsonSchema =
    menuData?.type === MenuItemType.ApiSchema ? menuData.data?.jsonSchema : undefined

  return jsonSchema
}

/**
 * 递归解析 JsonSchema 中的 `$ref` 引用，将 RefSchema 替换为实际引用的模型定义。
 * 使用 visited Set 检测循环引用。
 */
function isRefSchema(schema: JsonSchema | Record<string, unknown>): boolean {
  return (schema as JsonSchema).type === SchemaType.Refer
    || (typeof (schema as Record<string, unknown>).$ref === 'string' && (schema as JsonSchema).type === undefined)
}

export function resolveRefSchema(
  jsonSchema: JsonSchema,
  menuRawList: ApiMenuData[],
  visited: Set<string> = new Set(),
): JsonSchema {
  if (isRefSchema(jsonSchema)) {
    const refName = (jsonSchema as unknown as Record<string, unknown>).$ref as string

    if (visited.has(refName)) {
      return jsonSchema
    }

    const resolved = getRefJsonSchema(menuRawList, refName)

    if (!resolved) {
      return jsonSchema
    }

    const newVisited = new Set(visited)
    newVisited.add(refName)

    const fullyResolved = resolveRefSchema(resolved, menuRawList, newVisited)

    return {
      ...fullyResolved,
      name: jsonSchema.name ?? fullyResolved.name,
      description: jsonSchema.description ?? fullyResolved.description,
    }
  }

  if (jsonSchema.type === SchemaType.Object && Array.isArray(jsonSchema.properties)) {
    return {
      ...jsonSchema,
      properties: jsonSchema.properties.map((prop) =>
        resolveRefSchema(prop, menuRawList, visited),
      ),
    }
  }

  if (jsonSchema.type === SchemaType.Array) {
    return {
      ...jsonSchema,
      items: resolveRefSchema(jsonSchema.items, menuRawList, visited),
    }
  }

  return jsonSchema
}
