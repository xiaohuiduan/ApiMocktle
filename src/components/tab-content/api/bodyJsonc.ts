import { SchemaType } from '@/components/JsonSchema'
import type { JsonSchema } from '@/components/JsonSchema'
import { buildSchemaExample } from '@/components/JsonSchema/schema-normalizer'
import { BodyType } from '@/enums'
import type { ApiDetails } from '@/types'

/**
 * 剥离 JSON 注释（行注释 // 与块注释），正确处理字符串内部的斜杠。
 * 输出仍是合法 JSON 文本。
 */
export function stripJsonComments(src: string): string {
  let out = ''
  let i = 0
  let inString = false
  let quote = ''

  while (i < src.length) {
    const ch = src[i]

    if (inString) {
      out += ch
      if (ch === '\\' && i + 1 < src.length) {
        out += src[i + 1]
        i += 2
        continue
      }
      if (ch === quote) inString = false
      i += 1
      continue
    }

    if (ch === '"' || ch === '\'') {
      inString = true
      quote = ch
      out += ch
      i += 1
      continue
    }

    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1
      continue
    }

    if (ch === '/' && src[i + 1] === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1
      i += 2
      continue
    }

    out += ch
    i += 1
  }

  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** 去掉行尾值后的逗号（保留行尾注释），避免 JSON 尾逗号导致解析失败。 */
function stripTrailingComma(line: string): string {
  // 多行值（object/array）：逗号在整行末尾，如 "},"
  const trimmed = line.trimEnd()
  if (trimmed.endsWith(',')) return trimmed.slice(0, -1)

  // 叶子值带注释：逗号在行尾注释之前，如 "value, // desc"
  const commentIdx = line.indexOf('//')
  if (commentIdx === -1) {
    return trimmed.replace(/,\s*$/, '')
  }
  const before = line.slice(0, commentIdx).trimEnd().replace(/,\s*$/, '')
  return `${before} ${line.slice(commentIdx)}`
}

/** 序列化一个字段值：叶子直接 JSON，object/array 递归展开并带上子字段注释。 */
function serializeNode(schema: JsonSchema | undefined, value: unknown, level: number): string {
  const indent = '  '.repeat(level)

  if (schema?.type === SchemaType.Object && Array.isArray(schema.properties) && isRecord(value)) {
    const childIndent = '  '.repeat(level + 1)
    const lines: string[] = []

    for (const prop of schema.properties) {
      const name = prop.name
      if (!name || !(name in value)) continue

      const propValue = value[name]
      const serialized = serializeNode(prop, propValue, level + 1)
      const desc = prop.description?.trim().replace(/\n+/g, ' ')
      const comment = desc ? ` // ${desc}` : ''

      // 多行值（object/array）：注释插在首行末尾，逗号加在整个值末尾
      const nl = serialized.indexOf('\n')
      if (nl === -1) {
        lines.push(`${childIndent}"${name}": ${serialized},${comment}`)
      } else {
        lines.push(`${childIndent}"${name}": ${serialized.slice(0, nl)}${comment}${serialized.slice(nl)},`)
      }
    }

    if (lines.length === 0) return '{}'
    lines[lines.length - 1] = stripTrailingComma(lines[lines.length - 1])
    return `{\n${lines.join('\n')}\n${indent}}`
  }

  if (schema?.type === SchemaType.Array && Array.isArray(value)) {
    const childIndent = '  '.repeat(level + 1)
    const items = value.map((item) => serializeNode(schema.items, item, level + 1))
    if (items.length === 0) return '[]'
    return `[\n${items.map((item) => `${childIndent}${item}`).join(',\n')}\n${indent}]`
  }

  return JSON.stringify(value ?? null)
}

/**
 * 生成带注释的 JSON 示例（字段后跟 // 说明），用于"一键填充"。
 * 无 schema 时退化为普通示例。
 */
export function buildJsoncBodyFillText(apiDetails: ApiDetails, menuRawList?: unknown): string {
  const body = apiDetails.requestBody
  if (!body || body.type !== BodyType.Json || !body.jsonSchema) return ''

  const example = buildSchemaExample(body.jsonSchema as never, menuRawList as never) as unknown
  return serializeNode(body.jsonSchema as JsonSchema, example, 0)
}
