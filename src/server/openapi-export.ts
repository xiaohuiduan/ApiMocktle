import type { ApiMenuData } from '@/components/ApiMenu'
import { BodyType, ContentType, MenuItemType, ParamType } from '@/enums'
import type { ApiDetails, Parameter } from '@/types'

import * as yaml from 'yaml'

import { toOpenApiSchema } from './openapi-schema'

function getYamlStringify() {
  const stringify = (yaml as { stringify?: (input: unknown) => string }).stringify
    ?? (yaml as { default?: { stringify?: (input: unknown) => string } }).default?.stringify

  if (typeof stringify !== 'function') {
    throw new Error('YAML 序列化器不可用，请检查 yaml 依赖加载')
  }

  return stringify
}

function toOpenApiParameterSchema(type: ParamType) {
  if (type === ParamType.Integer) {
    return { type: 'integer' }
  }

  if (type === ParamType.Number) {
    return { type: 'number' }
  }

  if (type === ParamType.Boolean) {
    return { type: 'boolean' }
  }

  if (type === ParamType.Array) {
    return { type: 'array', items: { type: 'string' } }
  }

  return { type: 'string' }
}

function toOpenApiParameters(data: ApiDetails) {
  const result: Array<Record<string, unknown>> = []
  const pushParams = (params: Parameter[] | undefined, inType: 'query' | 'path' | 'header' | 'cookie') => {
    params?.forEach((param) => {
      result.push({
        name: param.name,
        in: inType,
        required: inType === 'path' ? true : param.required === true,
        description: param.description,
        schema: toOpenApiParameterSchema(param.type),
        example: param.example,
      })
    })
  }

  pushParams(data.parameters?.query, 'query')
  pushParams(data.parameters?.path, 'path')
  pushParams(data.parameters?.header, 'header')
  pushParams(data.parameters?.cookie, 'cookie')

  return result
}

function toOpenApiRequestBody(data: ApiDetails) {
  const body = data.requestBody

  if (!body || body.type === BodyType.None) {
    return undefined
  }

  if (body.type === BodyType.Json || body.type === BodyType.Xml) {
    const contentType = body.type === BodyType.Json ? 'application/json' : 'application/xml'

    return {
      content: {
        [contentType]: {
          schema: body.jsonSchema ? toOpenApiSchema(body.jsonSchema) : { type: 'object' },
        },
      },
    }
  }

  if (body.type === BodyType.UrlEncoded || body.type === BodyType.FormData) {
    const properties = (body.parameters ?? []).reduce<Record<string, unknown>>((acc, item) => {
      if (item.name) {
        acc[item.name] = toOpenApiParameterSchema(item.type)
      }

      return acc
    }, {})

    const contentType = body.type === BodyType.FormData
      ? 'multipart/form-data'
      : 'application/x-www-form-urlencoded'

    return {
      content: {
        [contentType]: {
          schema: {
            type: 'object',
            properties,
          },
        },
      },
    }
  }

  if (body.type === BodyType.Binary) {
    return {
      content: {
        'application/octet-stream': {
          schema: { type: 'string', format: 'binary' },
        },
      },
    }
  }

  return {
    content: {
      'text/plain': {
        schema: { type: 'string' },
      },
    },
  }
}

export function exportMenuItemsToOpenApi(
  menuItems: ApiMenuData[],
  format: 'json' | 'yaml',
  menuIds?: string[],
) {
  const stringifyYaml = getYamlStringify()
  const menuNameMap = new Map(menuItems.map((item) => [item.id, item.name]))
  const idSet = menuIds ? new Set(menuIds) : undefined
  const pathObject: Record<string, Record<string, unknown>> = {}
  const componentsSchemas: Record<string, unknown> = {}

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

      pathObject[pathName] = pathObject[pathName] ?? {}
      const parameters = toOpenApiParameters(data)

      pathObject[pathName][method] = {
        summary: data.name ?? item.name,
        description: data.description ?? '',
        tags,
        parameters: parameters.length > 0 ? parameters : undefined,
        requestBody: toOpenApiRequestBody(data),
        responses: (data.responses ?? []).reduce<Record<string, unknown>>((acc, response) => {
          const contentType = response.contentType === ContentType.JSON
            ? 'application/json'
            : response.contentType === ContentType.XML
              ? 'application/xml'
              : response.contentType === ContentType.HTML
                ? 'text/html'
                : response.contentType === ContentType.Binary
                  ? 'application/octet-stream'
                  : 'text/plain'
          acc[String(response.code)] = {
            description: response.name,
            content: response.jsonSchema
              ? { [contentType]: { schema: toOpenApiSchema(response.jsonSchema) } }
              : undefined,
          }
          return acc
        }, { 200: { description: '成功' } }),
      }
    }

    if (item.type === MenuItemType.ApiSchema && item.data?.jsonSchema) {
      componentsSchemas[item.name] = toOpenApiSchema(item.data.jsonSchema)
    }
  })

  const doc = {
    openapi: '3.0.3',
    info: {
      title: 'ApiMocktle Project',
      version: '1.0.0',
    },
    paths: pathObject,
    components: {
      schemas: componentsSchemas,
    },
  }

  return format === 'yaml' ? stringifyYaml(doc) : JSON.stringify(doc, null, 2)
}
