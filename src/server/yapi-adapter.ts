import { randomUUID } from 'node:crypto'

import type { JsonSchema } from '@/components/JsonSchema'
import { ApiStatus, BodyType, ContentType, HttpMethod, MenuItemType, ParamType } from '@/enums'
import type { ApiDetails, ApiDetailsResponse, ApiRequestBody, Parameter } from '@/types'

import { toInternalJsonSchema } from './openapi-schema'

export interface YApiInterface {
  _id?: string
  catid?: string | number
  title: string
  path: string
  method: string
  desc?: string
  markdown?: string
  status?: string
  tag?: string[]
  tags?: string[]
  req_headers?: YApiHeader[]
  req_query?: YApiParam[]
  req_params?: YApiParam[]
  req_body_type?: string
  req_body_form?: YApiFormParam[]
  req_body_other?: string
  req_body_is_json_schema?: boolean
  res_body_type?: string
  res_body?: string
  res_body_is_json_schema?: boolean
}

interface YApiHeader {
  name: string
  value?: string
  desc?: string
  example?: string
  required?: string | number
}

interface YApiParam {
  name: string
  value?: string
  desc?: string
  example?: string
  required?: string | number
}

interface YApiFormParam {
  name: string
  type?: string
  desc?: string
  example?: string
  required?: string | number
}

function isRequired(val?: string | number): boolean {
  return val === '1' || val === 1
}

function mapStatus(yapiStatus?: string): ApiStatus {
  switch (yapiStatus) {
    case 'done': return ApiStatus.Released
    case 'designing': return ApiStatus.Designing
    default: return ApiStatus.Developing
  }
}

function mapMethod(yapiMethod: string): HttpMethod {
  const upper = yapiMethod.toUpperCase()

  if (upper === 'GET') return HttpMethod.Get
  if (upper === 'POST') return HttpMethod.Post
  if (upper === 'PUT') return HttpMethod.Put
  if (upper === 'DELETE') return HttpMethod.Delete
  if (upper === 'PATCH') return HttpMethod.Patch
  if (upper === 'HEAD') return HttpMethod.Head
  if (upper === 'OPTIONS') return HttpMethod.Options

  return HttpMethod.Get
}

function mapParamType(yapiType?: string): ParamType {
  switch (yapiType) {
    case 'integer': return ParamType.Integer
    case 'number': return ParamType.Number
    case 'boolean': return ParamType.Boolean
    default: return ParamType.String
  }
}

function convertHeaders(headers?: YApiHeader[]): Parameter[] | undefined {
  if (!headers || headers.length === 0) return undefined

  return headers.map((h): Parameter => ({
    id: randomUUID().slice(0, 8),
    name: h.name,
    description: h.desc,
    example: h.value ?? h.example,
    required: isRequired(h.required),
    enable: true,
    type: ParamType.String,
  }))
}

function convertQueryParams(params?: YApiParam[]): Parameter[] | undefined {
  if (!params || params.length === 0) return undefined

  return params.map((p): Parameter => ({
    id: randomUUID().slice(0, 8),
    name: p.name,
    description: p.desc,
    example: p.example ?? p.value,
    required: isRequired(p.required),
    enable: true,
    type: ParamType.String,
  }))
}

function convertPathParams(params?: YApiParam[]): Parameter[] | undefined {
  if (!params || params.length === 0) return undefined

  return params.map((p): Parameter => ({
    id: randomUUID().slice(0, 8),
    name: p.name,
    description: p.desc,
    example: p.example,
    required: true,
    enable: true,
    type: ParamType.String,
  }))
}

function convertFormParams(params?: YApiFormParam[]): Parameter[] | undefined {
  if (!params || params.length === 0) return undefined

  return params.map((p) => ({
    id: randomUUID().slice(0, 8),
    name: p.name,
    description: p.desc,
    example: p.example,
    required: isRequired(p.required),
    enable: true,
    type: mapParamType(p.type),
  }) as Parameter)
}

function parseJsonSchemaSafe(jsonStr?: string): JsonSchema | undefined {
  if (!jsonStr) return undefined

  try {
    const raw = JSON.parse(jsonStr) as Record<string, unknown>

    return toInternalJsonSchema(raw)
  }
  catch {
    return undefined
  }
}

function convertRequestBody(yapi: YApiInterface): ApiRequestBody | undefined {
  const bodyType = yapi.req_body_type

  if (!bodyType || bodyType === 'none') {
    return { type: BodyType.None }
  }

  if (bodyType === 'json') {
    const jsonSchema = yapi.req_body_is_json_schema
      ? parseJsonSchemaSafe(yapi.req_body_other)
      : undefined

    return {
      type: BodyType.Json,
      jsonSchema,
      rawText: yapi.req_body_other,
    }
  }

  if (bodyType === 'form') {
    return {
      type: BodyType.FormData,
      parameters: convertFormParams(yapi.req_body_form),
    }
  }

  if (bodyType === 'raw') {
    return {
      type: BodyType.Raw,
      rawText: yapi.req_body_other,
    }
  }

  return { type: BodyType.None }
}

function convertResponses(yapi: YApiInterface): ApiDetailsResponse[] | undefined {
  if (!yapi.res_body) return undefined

  const jsonSchema = yapi.res_body_is_json_schema
    ? parseJsonSchemaSafe(yapi.res_body)
    : undefined

  return [{
    id: randomUUID().slice(0, 8),
    code: 200,
    name: '成功',
    contentType: yapi.res_body_type === 'json' ? ContentType.JSON : ContentType.Raw,
    jsonSchema,
  }]
}

export function yapiToApiDetails(yapi: YApiInterface): ApiDetails {
  return {
    id: randomUUID().slice(0, 8),
    method: mapMethod(yapi.method),
    path: yapi.path,
    name: yapi.title,
    status: mapStatus(yapi.status),
    description: yapi.markdown || yapi.desc,
    tags: yapi.tags ?? yapi.tag,
    parameters: {
      header: convertHeaders(yapi.req_headers),
      query: convertQueryParams(yapi.req_query),
      path: convertPathParams(yapi.req_params),
    },
    requestBody: convertRequestBody(yapi),
    responses: convertResponses(yapi),
  }
}

export function apiDetailsToYApi(detail: ApiDetails, menuItemId: string): YApiInterface {
  const result: YApiInterface = {
    _id: menuItemId,
    title: detail.name ?? '',
    path: detail.path ?? '',
    method: detail.method,
    desc: detail.description,
    markdown: detail.description,
    status: detail.status === ApiStatus.Released ? 'done' : detail.status === ApiStatus.Designing ? 'designing' : 'undone',
    tag: detail.tags,
  }

  if (detail.parameters?.header) {
    result.req_headers = detail.parameters.header.map((h) => ({
      name: h.name ?? '',
      value: Array.isArray(h.example) ? h.example[0] : h.example,
      desc: h.description,
      required: h.required ? '1' : '0',
    }))
  }

  if (detail.parameters?.query) {
    result.req_query = detail.parameters.query.map((q) => ({
      name: q.name ?? '',
      desc: q.description,
      example: Array.isArray(q.example) ? q.example[0] : q.example,
      required: q.required ? '1' : '0',
    }))
  }

  if (detail.parameters?.path) {
    result.req_params = detail.parameters.path.map((p) => ({
      name: p.name ?? '',
      desc: p.description,
      example: Array.isArray(p.example) ? p.example[0] : p.example,
    }))
  }

  if (detail.requestBody) {
    const body = detail.requestBody

    if (body.type === BodyType.Json) {
      result.req_body_type = 'json'
      result.req_body_is_json_schema = true
      result.req_body_other = body.rawText || (body.jsonSchema ? JSON.stringify(body.jsonSchema) : undefined)
    }
    else if (body.type === BodyType.FormData) {
      result.req_body_type = 'form'
      result.req_body_form = body.parameters?.map((p) => ({
        name: p.name ?? '',
        type: p.type,
        desc: p.description,
        example: Array.isArray(p.example) ? p.example[0] : p.example,
        required: p.required ? '1' : '0',
      }))
    }
    else if (body.type === BodyType.Raw) {
      result.req_body_type = 'raw'
      result.req_body_other = body.rawText
    }
  }

  if (detail.responses && detail.responses.length > 0) {
    const res = detail.responses[0]

    result.res_body_type = res.contentType === ContentType.JSON ? 'json' : 'raw'
    result.res_body_is_json_schema = true
    result.res_body = res.jsonSchema ? JSON.stringify(res.jsonSchema) : undefined
  }

  return result
}
