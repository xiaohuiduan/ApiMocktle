import { SchemaType } from '@/components/JsonSchema'
import type { JsonSchema } from '@/components/JsonSchema'
import { ParamType } from '@/enums'

type OpenApiSchema = Record<string, unknown>

function getSchemaType(value: unknown) {
  if (value === 'string') {
    return SchemaType.String
  }

  if (value === 'integer') {
    return SchemaType.Integer
  }

  if (value === 'number') {
    return SchemaType.Number
  }

  if (value === 'boolean') {
    return SchemaType.Boolean
  }

  if (value === 'array') {
    return SchemaType.Array
  }

  if (value === 'object') {
    return SchemaType.Object
  }

  return SchemaType.Any
}

export function toInternalJsonSchema(
  schema: unknown,
  schemasMap?: Record<string, unknown>,
): JsonSchema {
  if (!schema || typeof schema !== 'object') {
    return { type: SchemaType.String }
  }

  const raw = schema as OpenApiSchema
  const ref = typeof raw.$ref === 'string' ? raw.$ref : undefined
  const description = typeof raw.description === 'string' ? raw.description : undefined

  if (ref) {
    const refName = ref.split('/').at(-1) ?? ref

    return {
      type: SchemaType.Refer,
      $ref: refName,
      description,
    }
  }

  // 处理 allOf 合成 schema（Swagger 2.0 中常见，如继承 BaseResponse）
  if (Array.isArray(raw.allOf) && schemasMap) {
    const mergedProperties: JsonSchema[] = []

    for (const item of raw.allOf) {
      const resolved = toInternalJsonSchema(item, schemasMap)

      if (resolved.type === SchemaType.Refer) {
        const refSchema = schemasMap[resolved.$ref]
        if (refSchema) {
          const refResolved = toInternalJsonSchema(refSchema, schemasMap)
          if (refResolved.type === SchemaType.Object && refResolved.properties) {
            for (const prop of refResolved.properties) {
              const existingIdx = mergedProperties.findIndex((p) => p.name === prop.name)
              if (existingIdx >= 0) {
                mergedProperties[existingIdx] = prop
              } else {
                mergedProperties.push(prop)
              }
            }
          }
        }
      } else if (resolved.type === SchemaType.Object && resolved.properties) {
        for (const prop of resolved.properties) {
          const existingIdx = mergedProperties.findIndex((p) => p.name === prop.name)
          if (existingIdx >= 0) {
            mergedProperties[existingIdx] = prop
          } else {
            mergedProperties.push(prop)
          }
        }
      }
    }

    return {
      type: SchemaType.Object,
      properties: mergedProperties,
      description,
    }
  }

  const schemaType = getSchemaType(raw.type)

  if (schemaType === SchemaType.Object) {
    const propertiesRaw
      = raw.properties && typeof raw.properties === 'object'
        ? raw.properties as Record<string, unknown>
        : {}

    const properties = Object.entries(propertiesRaw).map(([name, value]) => {
      const field = toInternalJsonSchema(value)

      return {
        ...field,
        name,
      } as JsonSchema
    })

    return {
      type: SchemaType.Object,
      properties,
      description,
    }
  }

  if (schemaType === SchemaType.Array) {
    const itemSchema = toInternalJsonSchema(raw.items)

    return {
      type: SchemaType.Array,
      items: itemSchema,
      description,
    }
  }

  return {
    type: schemaType,
    description,
  }
}

export function toOpenApiSchema(schema: JsonSchema): OpenApiSchema {
  if (schema.type === SchemaType.Refer) {
    return {
      $ref: `#/components/schemas/${schema.$ref}`,
      ...(schema.description ? { description: schema.description } : {}),
    }
  }

  if (schema.type === SchemaType.Object) {
    const properties = (schema.properties ?? []).reduce<Record<string, OpenApiSchema>>((acc, item) => {
      if (item.name) {
        acc[item.name] = toOpenApiSchema(item)
      }

      return acc
    }, {})

    return {
      type: 'object',
      properties,
      ...(schema.description ? { description: schema.description } : {}),
    }
  }

  if (schema.type === SchemaType.Array) {
    return {
      type: 'array',
      items: toOpenApiSchema(schema.items),
      ...(schema.description ? { description: schema.description } : {}),
    }
  }

  if (schema.type === SchemaType.Integer) {
    return { type: 'integer', ...(schema.description ? { description: schema.description } : {}) }
  }

  if (schema.type === SchemaType.Number) {
    return { type: 'number', ...(schema.description ? { description: schema.description } : {}) }
  }

  if (schema.type === SchemaType.Boolean) {
    return { type: 'boolean', ...(schema.description ? { description: schema.description } : {}) }
  }

  return {
    type: 'string',
    ...(schema.description ? { description: schema.description } : {}),
  }
}

export function toParamType(schema: unknown) {
  if (!schema || typeof schema !== 'object') {
    return ParamType.String
  }

  const type = (schema as { type?: string }).type

  if (type === 'integer') {
    return ParamType.Integer
  }

  if (type === 'number') {
    return ParamType.Number
  }

  if (type === 'boolean') {
    return ParamType.Boolean
  }

  if (type === 'array') {
    return ParamType.Array
  }

  return ParamType.String
}
