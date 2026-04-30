import type { ApiMenuData } from '@/components/ApiMenu'
import { BodyType, ContentType, MenuItemType, ParamType } from '@/enums'
import type { ApiDetails } from '@/types'

import * as yaml from 'yaml'

function getYamlStringify() {
  const stringify = (yaml as { stringify?: (input: unknown) => string }).stringify
    ?? (yaml as { default?: { stringify?: (input: unknown) => string } }).default?.stringify

  if (typeof stringify !== 'function') {
    throw new Error('YAML 序列化器不可用，请检查 yaml 依赖加载')
  }

  return stringify
}

function toSwaggerParamType(type: ParamType) {
  if (type === ParamType.Integer) return 'integer'
  if (type === ParamType.Number) return 'number'
  if (type === ParamType.Boolean) return 'boolean'
  if (type === ParamType.Array) return 'array'
  return 'string'
}

function toSwaggerParameters(data: ApiDetails) {
  const result: Array<Record<string, unknown>> = []

  const pushParams = (params: Parameter[] | undefined, inType: 'query' | 'path' | 'header' | 'cookie') => {
    params?.forEach((param) => {
      const item: Record<string, unknown> = {
        name: param.name ?? '',
        in: inType,
        required: inType === 'path' ? true : param.required === true,
        type: toSwaggerParamType(param.type),
      }

      if (param.description) {
        item.description = param.description
      }

      if (param.example !== undefined && param.example !== '') {
        item['x-example'] = param.example
      }

      result.push(item)
    })
  }

  pushParams(data.parameters?.query, 'query')
  pushParams(data.parameters?.path, 'path')
  pushParams(data.parameters?.header, 'header')
  pushParams(data.parameters?.cookie, 'cookie')

  return result
}

function toSwaggerSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!schema) {
    return undefined
  }

  // Internal format -> Swagger 2.0 schema
  const convert = (s: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {}

    if (s.type === 'object') {
      result.type = 'object'
      if (s.properties && typeof s.properties === 'object') {
        const props: Record<string, unknown> = {}
        const req: string[] = []

        for (const [key, val] of Object.entries(s.properties as Record<string, unknown>)) {
          if (val && typeof val === 'object') {
            props[key] = convert(val as Record<string, unknown>)
          }
        }

        result.properties = props

        if (s.required && Array.isArray(s.required)) {
          result.required = s.required
        }
      }
    } else if (s.type === 'array') {
      result.type = 'array'
      if (s.items) {
        result.items = convert(s.items as Record<string, unknown>)
      }
    } else {
      result.type = s.type
      if (s.format) result.format = s.format
    }

    if (s.description) {
      result.description = s.description
    }

    return result
  }

  return convert(schema)
}

function toSwaggerRequestBody(data: ApiDetails): Array<Record<string, unknown>> | undefined {
  const body = data.requestBody

  if (!body || body.type === BodyType.None) {
    return undefined
  }

  const result: Array<Record<string, unknown>> = []

  if (body.type === BodyType.Json || body.type === BodyType.Xml) {
    result.push({
      name: 'body',
      in: 'body',
      required: true,
      schema: body.jsonSchema ? toSwaggerSchema(body.jsonSchema) : { type: 'object' },
    })
  } else if (body.type === BodyType.UrlEncoded || body.type === BodyType.FormData) {
    // form data params
    const params = body.parameters ?? []
    params.forEach((param) => {
      if (param.name) {
        result.push({
          name: param.name,
          in: 'formData',
          required: param.required === true,
          type: toSwaggerParamType(param.type),
          description: param.description ?? '',
        })
      }
    })
  }

  return result.length > 0 ? result : undefined
}

function toSwaggerResponses(data: ApiDetails): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  const responses = data.responses ?? []

  if (responses.length === 0) {
    result['200'] = { description: '成功' }
    return result
  }

  responses.forEach((response) => {
    const entry: Record<string, unknown> = {
      description: response.name ?? '',
    }

    if (response.jsonSchema) {
      entry.schema = toSwaggerSchema(response.jsonSchema)
    }

    result[String(response.code)] = entry
  })

  return result
}

export function exportMenuItemsToSwagger(
  menuItems: ApiMenuData[],
  format: 'json' | 'yaml',
  menuIds?: string[],
) {
  const stringifyYaml = getYamlStringify()
  const menuNameMap = new Map(menuItems.map((item) => [item.id, item.name]))
  const idSet = menuIds ? new Set(menuIds) : undefined

  const definitions: Record<string, unknown> = {}
  const paths: Record<string, Record<string, unknown>> = {}

  menuItems.forEach((item) => {
    if (item.type === MenuItemType.ApiDetail && item.data) {
      if (idSet && !idSet.has(item.id)) return

      const data = item.data as ApiDetails
      const pathName = data.path ?? '/'
      const method = (data.method ?? 'GET').toLowerCase()
      const tags = Array.isArray(data.tags) && data.tags.length > 0
        ? data.tags
        : item.parentId
          ? [menuNameMap.get(item.parentId) ?? '未分组']
          : ['未分组']

      paths[pathName] = paths[pathName] ?? {}
      const parameters = toSwaggerParameters(data)
      const bodyParams = toSwaggerRequestBody(data)
      const allParams = bodyParams
        ? [...parameters, ...bodyParams]
        : parameters

      paths[pathName][method] = {
        summary: data.name ?? item.name,
        description: data.description ?? '',
        tags,
        ...(allParams.length > 0 ? { parameters: allParams } : {}),
        responses: toSwaggerResponses(data),
      }
    }

    if (item.type === MenuItemType.ApiSchema && item.data?.jsonSchema) {
      definitions[item.name] = toSwaggerSchema(item.data.jsonSchema)
    }
  })

  const doc: Record<string, unknown> = {
    swagger: '2.0',
    info: {
      title: 'ApiMocktle Project',
      version: '1.0.0',
    },
    host: 'localhost',
    basePath: '/',
    schemes: ['http'],
    paths,
  }

  if (Object.keys(definitions).length > 0) {
    doc.definitions = definitions
  }

  return format === 'yaml' ? stringifyYaml(doc) : JSON.stringify(doc, null, 2)
}
