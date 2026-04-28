import { randomUUID } from 'node:crypto'

import type { ApiMenuData } from '@/components/ApiMenu'
import { BodyType, MenuItemType, ParamType } from '@/enums'
import type { ApiDetails, ApiDetailsResponse, Parameter } from '@/types'

import { mapContentType, parseDocumentFromFile, toParamExample } from './document-import-utils'
import { getOpenApiGroupName } from './openapi-import-utils'
import { toInternalJsonSchema, toParamType } from './openapi-schema'

const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'] as const

function toApiParameter(input: Record<string, unknown>): Parameter {
  const schema = input.schema
  const schemaExample = schema && typeof schema === 'object' ? (schema as { example?: unknown }).example : undefined
  const paramType = toParamType(schema)
  const example = toParamExample(input.example ?? schemaExample)

  if (paramType === ParamType.Array) {
    return {
      id: randomUUID(),
      name: typeof input.name === 'string' ? input.name : '',
      description: typeof input.description === 'string' ? input.description : '',
      required: input.required === true,
      enable: true,
      type: paramType,
      example: Array.isArray(example)
        ? example
        : typeof example === 'string'
          ? [example]
          : undefined,
    }
  }

  return {
    id: randomUUID(),
    name: typeof input.name === 'string' ? input.name : '',
    description: typeof input.description === 'string' ? input.description : '',
    required: input.required === true,
    enable: true,
    type: paramType,
    example: Array.isArray(example) ? example.join(',') : example,
  }
}

function buildRequestBody(requestBodyRaw: unknown, schemasMap?: Record<string, unknown>): ApiDetails['requestBody'] {
  if (!requestBodyRaw || typeof requestBodyRaw !== 'object') {
    return undefined
  }

  const content = (requestBodyRaw as { content?: Record<string, unknown> }).content

  if (!content || typeof content !== 'object') {
    return { type: BodyType.None }
  }

  const preferred = [
    'application/json',
    'application/xml',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
    'application/octet-stream',
  ]

  const contentType = preferred.find((item) => item in content) ?? Object.keys(content).at(0)
  const media = contentType ? content[contentType] as Record<string, unknown> : undefined
  const schema = media?.schema

  if (!contentType) {
    return { type: BodyType.None }
  }

  if (contentType === 'application/json') {
    return { type: BodyType.Json, jsonSchema: toInternalJsonSchema(schema, schemasMap) }
  }

  if (contentType === 'application/xml') {
    return { type: BodyType.Xml, jsonSchema: toInternalJsonSchema(schema, schemasMap) }
  }

  if (contentType === 'application/x-www-form-urlencoded' || contentType === 'multipart/form-data') {
    const props
      = schema && typeof schema === 'object' && (schema as { properties?: Record<string, unknown> }).properties
        ? (schema as { properties: Record<string, unknown> }).properties
        : {}
    const parameters: Parameter[] = Object.entries(props).map(([name, value]) => {
      const paramType = toParamType(value)
      const example = toParamExample((value as { example?: unknown }).example)

      if (paramType === ParamType.Array) {
        return {
          id: randomUUID(),
          name,
          type: paramType,
          enable: true,
          required: false,
          description: typeof (value as { description?: unknown }).description === 'string'
            ? (value as { description: string }).description
            : '',
          example: Array.isArray(example)
            ? example
            : typeof example === 'string'
              ? [example]
              : undefined,
        }
      }

      return {
        id: randomUUID(),
        name,
        type: paramType,
        enable: true,
        required: false,
        description: typeof (value as { description?: unknown }).description === 'string'
          ? (value as { description: string }).description
          : '',
        example: Array.isArray(example) ? example.join(',') : example,
      }
    })

    return {
      type: contentType === 'multipart/form-data' ? BodyType.FormData : BodyType.UrlEncoded,
      parameters,
    }
  }

  if (contentType === 'application/octet-stream') {
    return { type: BodyType.Binary }
  }

  return { type: BodyType.Raw }
}

function buildResponses(responsesRaw: unknown, schemasMap?: Record<string, unknown>) {
  if (!responsesRaw || typeof responsesRaw !== 'object') {
    return [] as ApiDetailsResponse[]
  }

  return Object.entries(responsesRaw as Record<string, unknown>).map(([code, response]) => {
    const parsedCode = Number.isFinite(Number(code)) ? Number(code) : 200
    const rawResponse = response as Record<string, unknown>
    const content = rawResponse.content as Record<string, unknown> | undefined
    const contentType = content ? Object.keys(content).at(0) : undefined
    const schema = contentType
      ? (content?.[contentType] as { schema?: unknown } | undefined)?.schema
      : undefined

    return {
      id: randomUUID(),
      code: parsedCode,
      name: typeof rawResponse.description === 'string' ? rawResponse.description : '响应',
      contentType: mapContentType(contentType),
      jsonSchema: schema ? toInternalJsonSchema(schema, schemasMap) : undefined,
    }
  })
}

export function importOpenApiDocumentToMenuItems(doc: Record<string, unknown>) {
  const openapiVersion = typeof doc.openapi === 'string' ? doc.openapi : ''

  if (!openapiVersion.startsWith('3.')) {
    throw new Error('仅支持 OpenAPI 3.x')
  }

  const paths = (doc.paths ?? {}) as Record<string, unknown>
  const schemas
    = ((doc.components as { schemas?: Record<string, unknown> } | undefined)?.schemas) ?? {}

  const menuItems: ApiMenuData[] = []
  const folderIdByController = new Map<string, string>()
  const schemaFolderId = randomUUID()

  menuItems.push({
    id: schemaFolderId,
    name: 'OpenAPI Models',
    type: MenuItemType.ApiSchemaFolder,
  })

  Object.entries(paths).forEach(([pathName, pathValue]) => {
    if (!pathValue || typeof pathValue !== 'object') {
      return
    }

    const pathItem = pathValue as Record<string, unknown>
    const pathParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : []

    httpMethods.forEach((methodKey) => {
      const operation = pathItem[methodKey]

      if (!operation || typeof operation !== 'object') {
        return
      }

      const op = operation as Record<string, unknown>
      const tags = Array.isArray(op.tags) ? op.tags.filter((item): item is string => typeof item === 'string') : []
      const controllerGroup = getOpenApiGroupName(op, pathName)

      if (!folderIdByController.has(controllerGroup)) {
        const folderId = randomUUID()
        folderIdByController.set(controllerGroup, folderId)
        menuItems.push({
          id: folderId,
          name: controllerGroup,
          type: MenuItemType.ApiDetailFolder,
        })
      }

      const parametersRaw = [
        ...pathParameters,
        ...(Array.isArray(op.parameters) ? op.parameters : []),
      ]
      const query = parametersRaw
        .filter((item) => (item as { in?: unknown }).in === 'query')
        .map((item) => toApiParameter(item as Record<string, unknown>))
      const path = parametersRaw
        .filter((item) => (item as { in?: unknown }).in === 'path')
        .map((item) => toApiParameter(item as Record<string, unknown>))
      const header = parametersRaw
        .filter((item) => (item as { in?: unknown }).in === 'header')
        .map((item) => toApiParameter(item as Record<string, unknown>))
      const cookie = parametersRaw
        .filter((item) => (item as { in?: unknown }).in === 'cookie')
        .map((item) => toApiParameter(item as Record<string, unknown>))

      const name = typeof op.summary === 'string'
        ? op.summary
        : typeof op.operationId === 'string'
          ? op.operationId
          : `${methodKey.toUpperCase()} ${pathName}`

      menuItems.push({
        id: randomUUID(),
        parentId: folderIdByController.get(controllerGroup),
        name,
        type: MenuItemType.ApiDetail,
        data: {
          id: randomUUID(),
          name,
          path: pathName,
          method: methodKey.toUpperCase(),
          status: 'developing',
          tags,
          serverId: '',
          description: typeof op.description === 'string' ? op.description : undefined,
          parameters: {
            query: query.length > 0 ? query : undefined,
            path: path.length > 0 ? path : undefined,
            header: header.length > 0 ? header : undefined,
            cookie: cookie.length > 0 ? cookie : undefined,
          },
          requestBody: buildRequestBody(op.requestBody, schemas),
          responses: buildResponses(op.responses, schemas),
        } as ApiDetails,
      })
    })
  })

  Object.entries(schemas).forEach(([schemaName, schemaDef]) => {
    menuItems.push({
      id: randomUUID(),
      parentId: schemaFolderId,
      name: schemaName,
      type: MenuItemType.ApiSchema,
      data: {
        jsonSchema: toInternalJsonSchema(schemaDef, schemas),
      },
    })
  })

  return menuItems
}

export function importOpenApiToMenuItems(fileContent: string, filename: string) {
  return importOpenApiDocumentToMenuItems(parseDocumentFromFile(fileContent, filename))
}

export { exportMenuItemsToOpenApi } from './openapi-export'
export { exportMenuItemsToSwagger } from './swagger-export'
