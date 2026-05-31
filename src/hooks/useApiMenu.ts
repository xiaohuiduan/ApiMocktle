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

// ==================== $ref 解析 ====================

function resolveRef(schema: unknown, schemaMap: SchemaMap, visited = new Set<string>()): unknown {
  if (!schema || typeof schema !== 'object') return schema
  const obj = schema as Record<string, unknown>

  if (obj.$ref && typeof obj.$ref === 'string') {
    const refPath = obj.$ref as string
    if (visited.has(refPath)) return { type: 'object', description: '(循环引用)' }
    visited.add(refPath)
    const resolved = schemaMap.get(refPath)
    if (resolved) return resolveRef(resolved, schemaMap, visited)
    return { type: 'object', description: `(未找到: ${refPath})` }
  }

  if (obj.allOf && Array.isArray(obj.allOf)) {
    const mergedProps: unknown[] = []
    const mergedRequired: string[] = []
    let mergedDesc: string | undefined
    for (const sub of obj.allOf as unknown[]) {
      const resolved = resolveRef(sub, schemaMap, new Set(visited)) as Record<string, unknown>
      if (resolved.properties) {
        if (Array.isArray(resolved.properties)) {
          mergedProps.push(...resolved.properties)
        } else {
          for (const [name, v] of Object.entries(resolved.properties as Record<string, unknown>)) {
            mergedProps.push({ name, ...(v as Record<string, unknown>) })
          }
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
        const subResult = resolveRef(sub, schemaMap, new Set(visited))
        if (subResult && typeof subResult === 'object' && (subResult as Record<string, unknown>).properties) {
          return subResult
        }
      }
    }
  }

  const result: Record<string, unknown> = { ...obj }
  if (Array.isArray(obj.properties)) {
    result.properties = obj.properties.map((p: Record<string, unknown>) => {
      if (!p || typeof p !== 'object') return p
      const resolved = { ...p }
      if (p.properties && Array.isArray(p.properties)) {
        resolved.properties = p.properties.map((sub: Record<string, unknown>) =>
          resolveRef(sub, schemaMap, new Set(visited))
        )
      }
      return resolved
    })
  } else if (obj.properties && typeof obj.properties === 'object') {
    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj.properties as Record<string, unknown>)) {
      props[k] = resolveRef(v, schemaMap, new Set(visited))
    }
    result.properties = props
  }
  if (obj.items && typeof obj.items === 'object') {
    result.items = resolveRef(obj.items, schemaMap, new Set(visited))
  }
  return result
}

// ==================== Schema 字段格式化 ====================

function resolveType(prop: Record<string, unknown>): string {
  if (prop.type === 'array') {
    const items = prop.items as Record<string, unknown> | undefined
    if (items?.type) return `${items.type}[]`
    return 'array'
  }
  if (prop.type) return prop.type as string
  if (prop.allOf || prop.oneOf || prop.anyOf) return 'object'
  return 'any'
}

function formatSchemaFields(schema: unknown, schemaMap?: SchemaMap): string | undefined {
  if (!schema) return undefined
  if (typeof schema === 'string') {
    try { schema = JSON.parse(schema) } catch { return undefined }
  }
  if (typeof schema !== 'object') return undefined

  const obj = schema as Record<string, unknown>
  const props = obj.properties
  if (!props) {
    if (obj.items && typeof obj.items === 'object') return formatSchemaFields(obj.items, schemaMap)
    if (obj.additionalProperties && typeof obj.additionalProperties === 'object') return formatSchemaFields(obj.additionalProperties, schemaMap)
    return undefined
  }

  const required = new Set<string>((obj.required as string[]) || [])

  // 数组格式: [{name, type, description, required, properties, ...}]
  if (Array.isArray(props)) {
    const lines = props
      .filter((p: unknown) => p && typeof p === 'object' && (p as Record<string, unknown>).name)
      .map((p: Record<string, unknown>) => {
        const name = p.name as string
        const req = required.has(name) || p.required === true ? '必填' : '可选'
        const type = resolveType(p)
        const desc = p.description ? `(${p.description})` : ''
        if (Array.isArray(p.properties) && p.properties.length > 0) {
          const sub = formatSchemaFields(p, schemaMap)
          return `    - ${name}: object, ${req}${desc ? ' ' + desc : ''}\n${sub}`
        }
        return `    - ${name}: ${type}, ${req}${desc ? ' ' + desc : ''}`
      })
    return lines.length > 0 ? lines.join('\n') : undefined
  }

  // 对象格式: {fieldName: {type, ...}}（标准 JSON Schema）
  if (typeof props === 'object') {
    const lines = Object.entries(props as Record<string, Record<string, unknown>>).map(([name, prop]) => {
      if (!prop || typeof prop !== 'object') return `    - ${name}: any, 可选`
      const req = required.has(name) ? '必填' : '可选'
      const type = resolveType(prop)
      const desc = prop.description ? `(${prop.description})` : ''
      if (prop.properties && typeof prop.properties === 'object') {
        const sub = formatSchemaFields(prop, schemaMap)
        if (sub) return `    - ${name}: object, ${req}${desc ? ' ' + desc : ''}\n${sub}`
      }
      return `    - ${name}: ${type}, ${req}${desc ? ' ' + desc : ''}`
    })
    return lines.length > 0 ? lines.join('\n') : undefined
  }

  return undefined
}

// ==================== 参数格式化 ====================

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

function formatBody(body: unknown, isJsonSchema?: boolean, schemaMap?: SchemaMap): string | undefined {
  if (!body) return undefined
  let obj: Record<string, unknown>
  if (typeof body === 'string') {
    try { obj = JSON.parse(body) } catch { return body.length > 200 ? body.slice(0, 200) + '...' : body }
  } else if (typeof body === 'object') {
    obj = body as Record<string, unknown>
  } else {
    return undefined
  }
  if (schemaMap) obj = resolveRef(obj, schemaMap) as Record<string, unknown>
  if ((isJsonSchema || obj.type === 'object') && obj.properties) {
    return formatSchemaFields(obj, schemaMap)
  }
  const str = JSON.stringify(obj, null, 2)
  return str.length > 300 ? str.slice(0, 300) + '...' : str
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
      const resolved = resolveRef(p, schemaMap) as Record<string, unknown>
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

function formatOpenApiRequestBody(requestBody: unknown, schemaMap: SchemaMap): string | undefined {
  if (!requestBody || typeof requestBody !== 'object') return undefined
  const rb = requestBody as Record<string, unknown>
  const type = rb.type as string || 'application/json'
  let schema = rb.jsonSchema as Record<string, unknown> | undefined
  if (!schema) return undefined
  schema = resolveRef(schema, schemaMap) as Record<string, unknown>
  const fields = formatSchemaFields(schema, schemaMap)
  if (!fields) return undefined
  return `  Content-Type: ${type}\n${fields}`
}

function formatOpenApiResponses(responses: unknown, schemaMap: SchemaMap): string | undefined {
  if (!Array.isArray(responses) || responses.length === 0) return undefined
  const lines: string[] = []
  for (const res of responses) {
    const code = res.code || 200
    let schema = res.jsonSchema as Record<string, unknown> | undefined
    if (!schema) continue
    schema = resolveRef(schema, schemaMap) as Record<string, unknown>
    lines.push(`  HTTP ${code}:`)
    lines.push(formatSchemaFields(schema, schemaMap) || '    (无字段定义)')
  }
  return lines.length > 0 ? lines.join('\n') : undefined
}

// ==================== 转换 ====================

function mapRawToApiItem(raw: RawMenuItem, schemaMap: SchemaMap): ApiMenuItem | null {
  if (raw.type !== 'apiDetail') return null
  const d = raw.data || {}

  const openApiParams = formatOpenApiParams(d.parameters, schemaMap)
  const openApiBody = formatOpenApiRequestBody(d.requestBody, schemaMap)
  const openApiResponse = formatOpenApiResponses(d.responses, schemaMap)

  const yapiParams = formatParams(d.req_query)
  const yapiBody = formatBody(d.req_body_other ?? d.req_body_form, d.req_body_is_json_schema as boolean, schemaMap)
  const yapiResponse = formatBody(d.res_body, d.res_body_is_json_schema as boolean, schemaMap)

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
