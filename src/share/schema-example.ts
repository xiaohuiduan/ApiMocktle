/**
 * 轻量 JSON Schema → 示例值生成（只读展示用，不做完整校验实现）。
 * 兼容两种格式：
 * - 标准 JSON Schema：properties 为对象 map（{ name: childSchema }）
 * - 项目内部格式：properties 为数组（[{ name, type, description, required, ... }]）
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** 内部格式的 properties 数组项：{ name, type, ... } */
function asNamedRow(value: unknown): { name: string, type: string } | null {
  const row = asRecord(value)

  if (!row || typeof row.name !== 'string' || typeof row.type !== 'string') {
    return null
  }

  return { name: row.name, type: row.type }
}

export function schemaExample(schema: unknown): unknown {
  const s = asRecord(schema)

  if (!s) {
    return null
  }

  if (s.example !== undefined) {
    return s.example
  }

  if (s.default !== undefined) {
    return s.default
  }

  if (Array.isArray(s.enum) && s.enum.length > 0) {
    return s.enum[0]
  }

  if (typeof s.$ref === 'string') {
    return { $ref: s.$ref }
  }

  switch (s.type) {
    case 'object': {
      const result: Record<string, unknown> = {}
      const props = s.properties

      if (Array.isArray(props)) {
        // 内部格式：properties 为 [{ name, type, ... }]
        for (const item of props) {
          const row = asNamedRow(item)

          if (row) {
            result[row.name] = schemaExample(item)
          }
        }
      }
      else {
        const map = asRecord(props)

        if (map) {
          for (const [key, value] of Object.entries(map)) {
            result[key] = schemaExample(value)
          }
        }
      }

      return result
    }

    case 'array': {
      const items = Array.isArray(s.items) ? s.items[0] : s.items

      return items !== undefined ? [schemaExample(items)] : []
    }

    case 'string':
      return s.format === 'date-time' ? '2026-01-01T00:00:00Z' : 'string'

    case 'number':
      return 0

    case 'integer':
      return 0

    case 'boolean':
      return true

    case 'null':
      return null

    case 'any':
      return 'any'

    case 'ref':
      // 引用其他 Schema 节点：展示引用名，避免空对象
      return { $ref: typeof s.$ref === 'string' ? s.$ref : '引用' }

    default:
      return {}
  }
}

/** 参数表格用的轻量 schema 行数据 */
export interface SchemaRow {
  name: string
  type: string
  required: boolean
  description?: string
}

/** 递归收集字段行：嵌套 object/array 展开为点号路径（args.q1、headers.Accept） */
function appendRows(s: Record<string, unknown> | null, baseName: string, out: SchemaRow[]): void {
  if (!s) {
    return
  }

  const props = s.properties

  if (Array.isArray(props)) {
    // 内部格式：properties 为 [{ name, type, required, description }]
    for (const item of props) {
      const row = asRecord(item)

      if (!row || typeof row.name !== 'string') {
        continue
      }

      const childType = typeof row.type === 'string' ? row.type : 'any'
      const fullName = baseName ? `${baseName}.${row.name}` : row.name

      out.push({
        name: fullName,
        type: childType,
        required: row.required === true,
        description: typeof row.description === 'string' ? row.description : undefined,
      })

      if (childType === 'object' || childType === 'array') {
        appendRows(row, childType === 'array' ? `${fullName}[]` : fullName, out)
      }
    }
    return
  }

  const map = asRecord(props)

  if (map) {
    // 标准格式：properties 为对象 map
    const required: string[] = Array.isArray(s.required) ? (s.required as string[]) : []

    for (const [name, child] of Object.entries(map)) {
      const childObj = asRecord(child)
      const childType = childObj && typeof childObj.type === 'string' ? childObj.type : 'any'
      const fullName = baseName ? `${baseName}.${name}` : name

      out.push({
        name: fullName,
        type: childType,
        required: required.includes(name),
        description: childObj && typeof childObj.description === 'string'
          ? childObj.description
          : undefined,
      })

      if (childObj && (childType === 'object' || childType === 'array')) {
        appendRows(childObj, childType === 'array' ? `${fullName}[]` : fullName, out)
      }
    }
  }
}

export function schemaRows(schema: unknown, baseName = ''): SchemaRow[] {
  const s = asRecord(schema)

  if (!s) {
    return []
  }

  if (s.type === 'array' && s.items !== undefined) {
    return schemaRows(s.items, baseName ? `${baseName}[]` : '[]')
  }

  const rows: SchemaRow[] = []
  appendRows(s, baseName, rows)

  return rows
}
