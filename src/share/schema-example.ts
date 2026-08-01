/**
 * 轻量 JSON Schema → 示例值生成（只读展示用，不做完整校验实现）
 * 处理标准 JSON Schema 常见形态：type / properties / items / $ref / enum / example / default
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
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
      const props = asRecord(s.properties)

      if (props) {
        for (const [key, value] of Object.entries(props)) {
          result[key] = schemaExample(value)
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

function rowFromChild(
  name: string,
  child: unknown,
  required: boolean,
  baseName: string,
): SchemaRow {
  const childObj = asRecord(child)

  return {
    name: baseName ? `${baseName}.${name}` : name,
    type: childObj && typeof childObj.type === 'string' ? childObj.type : 'any',
    required,
    description: childObj && typeof childObj.description === 'string'
      ? childObj.description
      : undefined,
  }
}

export function schemaRows(schema: unknown, baseName = ''): SchemaRow[] {
  const s = asRecord(schema)

  if (!s) {
    return []
  }

  if (s.type === 'object' && asRecord(s.properties)) {
    const required: string[] = Array.isArray(s.required) ? (s.required as string[]) : []
    const props = asRecord(s.properties) ?? {}

    return Object.entries(props).map(([name, child]) => {
      return rowFromChild(name, child, required.includes(name), baseName)
    })
  }

  if (s.type === 'array' && s.items !== undefined) {
    return schemaRows(s.items, baseName ? `${baseName}[]` : '[]')
  }

  return []
}
