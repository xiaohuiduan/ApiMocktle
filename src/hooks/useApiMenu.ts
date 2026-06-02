import { useState, useEffect, useCallback } from 'react'
import { api } from '@/api-client'
import { useAuth } from '@/contexts/auth'

// ==================== 类型 ====================

interface ApiMenuItem {
  id: string
  name: string
  method: string
  path: string
  description?: string
  queryParams?: string
  requestBody?: string
  responseBody?: string
}

interface RawMenuItem {
  id: string
  name: string
  type: string
  parentId?: string
  data?: Record<string, unknown>
  sortOrder?: number
  createdAt?: string
  updatedAt?: string
}

type SchemaMap = Map<string, Record<string, unknown>>

interface UseApiMenuReturn {
  items: ApiMenuItem[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

// ==================== Schema 查找表 ====================

function buildSchemaMap(items: RawMenuItem[]): SchemaMap {
  const map: SchemaMap = new Map()
  for (const item of items) {
    if (item.type !== 'apiSchema') continue
    const schema = item.data?.jsonSchema as Record<string, unknown> | undefined
    if (!schema) continue
    map.set(`#/components/schemas/${item.name}`, schema)
    map.set(`#/definitions/${item.name}`, schema)
  }
  return map
}

// ==================== Schema 解析 ====================

/**
 * 解析 allOf/oneOf/anyOf/$ref，返回展开后的 schema
 */
function resolveSchema(schema: unknown, schemaMap: SchemaMap, visited = new Set<string>()): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return {}
  const obj = schema as Record<string, unknown>

  if (obj.$ref && typeof obj.$ref === 'string') {
    const refPath = obj.$ref as string
    if (visited.has(refPath)) return { type: 'object', description: '(循环引用)' }
    visited.add(refPath)
    const resolved = schemaMap.get(refPath)
    if (resolved) return resolveSchema(resolved, schemaMap, visited)
    return { type: 'object', description: `(未找到: ${refPath})` }
  }

  if (obj.allOf && Array.isArray(obj.allOf)) {
    const mergedProps: Record<string, unknown> = {}
    const mergedRequired: string[] = []
    let mergedDesc: string | undefined
    for (const sub of obj.allOf as unknown[]) {
      const resolved = resolveSchema(sub, schemaMap, new Set(visited))
      if (resolved.properties) {
        if (Array.isArray(resolved.properties)) {
          for (const p of resolved.properties as Record<string, unknown>[]) {
            if (p?.name) mergedProps[p.name as string] = p
          }
        } else {
          Object.assign(mergedProps, resolved.properties as Record<string, unknown>)
        }
      }
      if (resolved.required) mergedRequired.push(...(resolved.required as string[]))
      if (resolved.description && !mergedDesc) mergedDesc = resolved.description as string
    }
    const merged: Record<string, unknown> = { type: 'object', properties: mergedProps }
    if (mergedRequired.length > 0) merged.required = mergedRequired
    if (mergedDesc) merged.description = mergedDesc
    return merged
  }

  for (const key of ['oneOf', 'anyOf'] as const) {
    if (obj[key] && Array.isArray(obj[key])) {
      for (const sub of obj[key] as unknown[]) {
        const subResult = resolveSchema(sub, schemaMap, new Set(visited))
        if (subResult.properties) return subResult
      }
    }
  }

  return obj
}

// ==================== Schema → JSON 示例构建 ====================

/**
 * 递归解析属性，统一返回 [{name, type, required, children, items}] 格式
 */
function schemaToEntries(
  schema: Record<string, unknown>,
  requiredSet: Set<string>
): Array<{ name: string; type: string; required: boolean; children?: Record<string, unknown>; items?: Record<string, unknown> }> {
  const props = schema.properties
  if (!props) return []

  const resolveItemType = (prop: Record<string, unknown>): string => {
    if (prop.allOf || prop.oneOf || prop.anyOf) return 'object'
    if (prop.type) return prop.type as string
    return 'object'
  }

  if (Array.isArray(props)) {
    return props
      .filter((p: unknown) => p && typeof p === 'object' && (p as Record<string, unknown>).name)
      .map((p: Record<string, unknown>) => ({
        name: p.name as string,
        type: resolveItemType(p),
        required: requiredSet.has(p.name as string) || p.required === true,
        children: p.properties && typeof p.properties === 'object'
          ? (Array.isArray(p.properties)
            ? Object.fromEntries((p.properties as Record<string, unknown>[]).map(x => [x.name, x]))
            : p.properties as Record<string, unknown>)
          : undefined,
        items: p.items as Record<string, unknown> | undefined,
      }))
  }

  if (typeof props === 'object') {
    return Object.entries(props as Record<string, Record<string, unknown>>).map(([name, prop]) => {
      if (!prop || typeof prop !== 'object') return { name, type: 'any', required: false }
      return {
        name,
        type: resolveItemType(prop),
        required: requiredSet.has(name),
        children: prop.properties && typeof prop.properties === 'object'
          ? (Array.isArray(prop.properties)
            ? Object.fromEntries((prop.properties as Record<string, unknown>[]).map(x => [x.name, x]))
            : prop.properties as Record<string, unknown>)
          : undefined,
        items: prop.items as Record<string, unknown> | undefined,
      }
    })
  }

  return []
}

/**
 * 从 schema 递归构建示例 JSON 对象，展开所有嵌套层级
 */
function schemaToExample(schema: Record<string, unknown>, schemaMap: SchemaMap): Record<string, unknown> {
  const resolved = resolveSchema(schema, schemaMap)
  if (!resolved.properties) return {}

  const requiredSet = new Set<string>((resolved.required as string[]) || [])
  const entries = schemaToEntries(resolved, requiredSet)
  const result: Record<string, unknown> = {}

  for (const entry of entries) {
    if (entry.children) {
      const childSchema: Record<string, unknown> = {
        type: 'object',
        properties: entry.children,
        ...(resolved.required ? { required: resolved.required } : {}),
      }
      result[entry.name] = schemaToExample(childSchema, schemaMap)
    } else if (entry.type === 'array' && entry.items) {
      result[entry.name] = [schemaToExample(entry.items, schemaMap)]
    } else {
      result[entry.name] = typeToExample(entry.type)
    }
  }

  return result
}

function typeToExample(type: string): unknown {
  switch (type) {
    case 'null': return null
    case 'number':
    case 'integer': return 0
    case 'boolean': return false
    case 'string': return 'string'
    case 'object': return {}
    case 'array': return []
    default: return type
  }
}

/**
 * 将 schema 转为格式化 JSON 字符串（树线缩进 + 行内 (必填) 标注）
 */
function buildSchemaJson(body: unknown, schemaMap?: SchemaMap): string | undefined {
  if (!body) return undefined

  let obj: Record<string, unknown>
  if (typeof body === 'string') {
    try { obj = JSON.parse(body) } catch { return body.length > 200 ? body.slice(0, 200) + '...' : body }
  } else if (typeof body === 'object') {
    obj = body as Record<string, unknown>
  } else {
    return undefined
  }

  if (schemaMap) obj = resolveSchema(obj, schemaMap)

  if (obj.type === 'object' || obj.properties) {
    const example = schemaToExample(obj, schemaMap || new Map())
    return stringifyWithRequired(example, 0, obj, schemaMap || new Map())
  }

  const str = JSON.stringify(obj, null, 2)
  return str.length > 300 ? str.slice(0, 300) + '...' : str
}

/**
 * 递归生成 JSON 字符串，在必填字段旁添加 (必填) 标注
 */
function stringifyWithRequired(
  value: unknown,
  indent: number,
  schema?: unknown,
  schemaMap?: SchemaMap
): string {
  const pad = '  '.repeat(indent)
  const pad1 = '  '.repeat(indent + 1)

  if (value === null) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const inner = stringifyWithRequired(value[0], indent + 1, undefined, schemaMap)
    return `[\n${pad1}${inner}\n${pad}]`
  }

  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
  if (keys.length === 0) return '{}'

  // 获取当前 schema 的 required 字段集合
  const reqSet = new Set<string>()
  if (schema && typeof schema === 'object') {
    const s = schema as Record<string, unknown>
    if (s.required && Array.isArray(s.required)) {
      for (const r of s.required as string[]) reqSet.add(r)
    }
    if (schemaMap) {
      const resolved = resolveSchema(s, schemaMap)
      if (resolved.required && Array.isArray(resolved.required)) {
        for (const r of resolved.required as string[]) reqSet.add(r)
      }
    }
  }

  // 获取子 schema properties 用于递归
  let childProps: Record<string, unknown> | undefined
  if (schema && typeof schema === 'object') {
    const s = (schemaMap ? resolveSchema(schema as Record<string, unknown>, schemaMap) : schema) as Record<string, unknown>
    const rawProps = s.properties
    if (rawProps && typeof rawProps === 'object') {
      if (Array.isArray(rawProps)) {
        childProps = {}
        for (const p of rawProps as Record<string, unknown>[]) {
          if (p?.name) childProps[p.name as string] = p
        }
      } else {
        childProps = rawProps as Record<string, unknown>
      }
    }
  }

  const lines: string[] = []
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const val = obj[key]
    const comma = i < keys.length - 1 ? ',' : ''
    const req = reqSet.has(key) ? '  // (必填)' : ''

    if (val !== null && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0) {
      // 嵌套对象：递归并传递子 schema
      const childSchema = childProps?.[key]
      const inner = stringifyWithRequired(val, indent + 1, childSchema, schemaMap)
      if (req) {
        lines.push(`${pad1}"${key}": ${inner}${comma}  // (必填)`)
      } else {
        lines.push(`${pad1}"${key}": ${inner}${comma}`)
      }
    } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
      // 对象数组：递归第一个元素
      const childSchema = childProps?.[key]
      let itemSchema: unknown
      if (childSchema && typeof childSchema === 'object') {
        const cs = childSchema as Record<string, unknown>
        itemSchema = cs.items
      }
      const inner = stringifyWithRequired(val[0], indent + 2, itemSchema, schemaMap)
      lines.push(`${pad1}"${key}": [\n${'  '.repeat(indent + 2)}${inner}\n${pad1}]${comma}${req ? '  // (必填)' : ''}`)
    } else {
      // 标量/空值
      lines.push(`${pad1}"${key}": ${JSON.stringify(val)}${comma}${req}`)
    }
  }

  return `{\n${lines.join('\n')}\n${pad}}`
}

// ==================== Query 参数格式化 ====================

function formatParams(params: unknown): string | undefined {
  if (!Array.isArray(params) || params.length === 0) return undefined
  const items = params
    .filter((p: Record<string, unknown>) => p && p.name)
    .map((p: Record<string, unknown>) => {
      const req = p.required === '1' || p.required === 1 || p.required === true ? '必填' : '可选'
      const desc = p.desc ? `(${p.desc})` : ''
      return `    - ${p.name}: ${req}${desc ? ' ' + desc : ''}`
    })
  return items.length > 0 ? items.join('\n') : undefined
}

function formatOpenApiParams(parameters: unknown, schemaMap: SchemaMap): string | undefined {
  if (!parameters || typeof parameters !== 'object') return undefined
  const params = parameters as Record<string, unknown>
  const sections: string[] = []

  for (const section of ['path', 'query', 'header'] as const) {
    const rawItems = params[section] as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(rawItems) || rawItems.length === 0) continue
    const label = section === 'query' ? 'Query 参数' : section === 'path' ? '路径参数' : '请求头'
    const lines = rawItems.map((p) => {
      const resolved = resolveSchema(p, schemaMap)
      const req = resolved.required === true || resolved.required === 'true' ? '必填' : '可选'
      const schema = resolved.schema as Record<string, unknown> | undefined
      const type = schema?.type as string || resolved.type as string || 'any'
      const desc = resolved.description ? `(${resolved.description})` : ''
      return `    - ${resolved.name}: ${type}, ${req}${desc ? ' ' + desc : ''}`
    })
    sections.push(`  ${label}:\n${lines.join('\n')}`)
  }
  return sections.length > 0 ? sections.join('\n') : undefined
}

function formatOpenApiBody(body: unknown, schemaMap: SchemaMap): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const rb = body as Record<string, unknown>
  const type = rb.type as string || 'application/json'
  let schema = rb.jsonSchema as Record<string, unknown> | undefined
  if (!schema) return undefined
  schema = resolveSchema(schema, schemaMap)
  const json = buildSchemaJson(schema, schemaMap)
  if (!json) return undefined
  return `  Content-Type: ${type}\n${json}`
}

function formatOpenApiResponses(responses: unknown, schemaMap: SchemaMap): string | undefined {
  if (!Array.isArray(responses) || responses.length === 0) return undefined
  const lines: string[] = []
  for (const res of responses) {
    const code = res.code || 200
    let schema = res.jsonSchema as Record<string, unknown> | undefined
    if (!schema) continue
    schema = resolveSchema(schema, schemaMap)
    const json = buildSchemaJson(schema, schemaMap)
    lines.push(`  HTTP ${code}:`)
    lines.push(json || '    (无字段定义)')
  }
  return lines.length > 0 ? lines.join('\n') : undefined
}

// ==================== 转换 ====================

function mapRawToApiItem(raw: RawMenuItem, schemaMap: SchemaMap): ApiMenuItem | null {
  if (raw.type !== 'apiDetail') return null
  const d = raw.data || {}

  const openApiParams = formatOpenApiParams(d.parameters, schemaMap)
  const openApiBody = formatOpenApiBody(d.requestBody, schemaMap)
  const openApiResponse = formatOpenApiResponses(d.responses, schemaMap)

  const yapiParams = formatParams(d.req_query)
  const yapiBody = buildSchemaJson(d.req_body_other ?? d.req_body_form, schemaMap)
  const yapiResponse = buildSchemaJson(d.res_body, schemaMap)

  return {
    id: raw.id,
    name: raw.name,
    method: (d.method as string) || 'GET',
    path: (d.path as string) || '',
    description: (d.description as string) || (d.desc as string) || raw.name,
    queryParams: openApiParams ?? yapiParams,
    requestBody: openApiBody ?? yapiBody,
    responseBody: openApiResponse ?? yapiResponse,
  }
}

// ==================== Hook ====================

export function useApiMenu(projectId: string): UseApiMenuReturn {
  const { sessionId } = useAuth()
  const [items, setItems] = useState<ApiMenuItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    if (!projectId || !sessionId) return
    setLoading(true)
    setError(null)
    try {
      const result = await api<{ menuItems: RawMenuItem[] }>('list_menu_items', { sessionId, projectId })
      const allItems = result.menuItems ?? []
      const schemaMap = buildSchemaMap(allItems)
      const mapped = allItems
        .map((item) => mapRawToApiItem(item, schemaMap))
        .filter((item): item is ApiMenuItem => item !== null)
      setItems(mapped)
    } catch (err) {
      console.error('[useApiMenu] Error:', err)
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [projectId, sessionId])

  useEffect(() => { fetchItems() }, [fetchItems])

  return { items, loading, error, refresh: fetchItems }
}

export type { ApiMenuItem }
