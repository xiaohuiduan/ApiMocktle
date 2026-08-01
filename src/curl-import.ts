import { nanoid } from 'nanoid'

import type { ApiMenuData } from '@/components/ApiMenu'
import { type JsonSchema, SchemaType } from '@/components/JsonSchema'
import {
  buildExtraQueryPairs,
  type CurlParseState,
  extractHeaders,
  looksLikeUrlEncodedBody,
  type NameValuePair,
  parseAmpersandPairs,
  parseCookiePairs,
  parseCurlCommand,
  parseFormPairs,
} from '@/curl-import-parser'
import { ApiStatus, BodyType, HttpMethod, MenuItemType, ParamType } from '@/enums'
import type { ApiDetails, Parameter } from '@/types'

type NonRefJsonSchema = Exclude<JsonSchema, { type: SchemaType.Refer }>

interface ConvertCurlOptions {
  ignoreCommonHeaders?: boolean
  parentId?: string
}

function inferJsonSchemaFromExample(value: unknown): JsonSchema {
  if (Array.isArray(value)) {
    const firstDefined = value.find((item) => item !== undefined)

    return {
      type: SchemaType.Array,
      items: inferJsonSchemaFromExample(firstDefined ?? '') as NonRefJsonSchema,
    }
  }

  if (value === null) {
    return { type: SchemaType.Null }
  }

  if (typeof value === 'boolean') {
    return { type: SchemaType.Boolean, example: value }
  }

  if (typeof value === 'number') {
    return {
      type: Number.isInteger(value) ? SchemaType.Integer : SchemaType.Number,
      example: value,
    }
  }

  if (value && typeof value === 'object') {
    return {
      type: SchemaType.Object,
      properties: Object.entries(value as Record<string, unknown>).map(([name, fieldValue]) => {
        return {
          ...inferJsonSchemaFromExample(fieldValue),
          name,
        }
      }),
    }
  }

  return { type: SchemaType.String, example: String(value) }
}

function inferParamType(values: string[]) {
  if (values.length > 1) {
    return ParamType.Array
  }

  const value = values[0] ?? ''

  if (/^-?\d+$/.test(value)) {
    return ParamType.Integer
  }

  if (/^-?(?:\d+|\d*\.\d+)$/.test(value)) {
    return ParamType.Number
  }

  if (/^(true|false)$/i.test(value)) {
    return ParamType.Boolean
  }

  return ParamType.String
}

function buildParameter(name: string, values: string[], required: boolean): Parameter {
  const type = inferParamType(values)

  if (type === ParamType.Array) {
    return {
      id: nanoid(6),
      name,
      required,
      type,
      example: values,
    }
  }

  return {
    id: nanoid(6),
    name,
    required,
    type,
    example: values[0],
  }
}

function buildParameters(pairs: NameValuePair[], required = false) {
  const grouped = new Map<string, string[]>()

  pairs.forEach(({ name, value }) => {
    const current = grouped.get(name) ?? []
    current.push(value)
    grouped.set(name, current)
  })

  return [...grouped.entries()].map(([name, values]) => buildParameter(name, values, required))
}

function parseJsonBody(value: string) {
  try {
    return JSON.parse(value)
  }
  catch {
    return undefined
  }
}

function buildRequestBody(state: CurlParseState, contentType?: string): ApiDetails['requestBody'] {
  if (state.forceGet) {
    return undefined
  }

  if (state.forms.length > 0) {
    return { type: BodyType.FormData, parameters: buildParameters(parseFormPairs(state.forms)) }
  }

  const urlEncodedPairs = parseAmpersandPairs(state.dataUrlEncoded)
  const rawBody = [...state.data, ...state.dataUrlEncoded].join('&').trim()
  const parsedJson = rawBody ? parseJsonBody(rawBody) : undefined
  const lowerContentType = contentType?.toLowerCase()

  if (urlEncodedPairs.length > 0 || (rawBody && looksLikeUrlEncodedBody(rawBody))) {
    return {
      type: BodyType.UrlEncoded,
      parameters: buildParameters(urlEncodedPairs.length > 0 ? urlEncodedPairs : parseAmpersandPairs([rawBody])),
    }
  }

  if (rawBody && lowerContentType?.includes('application/json') && parsedJson === undefined) {
    throw new Error('JSON Body 解析失败，请检查 cURL 中的请求体格式')
  }

  if (rawBody && (parsedJson !== undefined || lowerContentType?.includes('application/json'))) {
    return {
      type: BodyType.Json,
      jsonSchema: inferJsonSchemaFromExample(parsedJson ?? {}),
    }
  }

  if (rawBody && (lowerContentType?.includes('xml') || rawBody.startsWith('<'))) {
    return { type: BodyType.Xml }
  }

  return rawBody ? { type: BodyType.Raw, rawText: rawBody } : undefined
}

function buildApiMethod(state: CurlParseState, hasBody: boolean) {
  if (state.method) {
    return state.method
  }

  if (state.forceGet) {
    return HttpMethod.Get
  }

  return hasBody ? HttpMethod.Post : HttpMethod.Get
}

function buildApiName(method: HttpMethod, url: URL) {
  const pathName = url.pathname === '/' ? url.host : url.pathname

  return `${method} ${pathName}`
}

export function convertCurlToApiMenuItem(curlText: string, options: ConvertCurlOptions = {}): ApiMenuData {
  const state = parseCurlCommand(curlText)
  const requestUrl = state.url

  if (!requestUrl) {
    throw new Error('未识别到有效的请求 URL')
  }

  const url = new URL(requestUrl)
  const { contentType, cookiePairs, headerPairs } = extractHeaders(
    state.headers,
    options.ignoreCommonHeaders ?? true,
  )
  const requestBody = buildRequestBody(state, contentType)
  const method = buildApiMethod(state, Boolean(requestBody))
  const queryPairs = [
    ...[...url.searchParams.entries()].map(([name, value]) => ({ name, value })),
    ...(state.forceGet ? buildExtraQueryPairs(state) : []),
  ]
  const name = buildApiName(method, url)
  const parameters = {
    query: queryPairs.length > 0 ? buildParameters(queryPairs) : undefined,
    path: buildParameters(
      [...url.pathname.matchAll(/\{([^{}]+)\}/g)].map((item) => ({ name: item[1], value: '' })),
      true,
    ),
    header: buildParameters(headerPairs),
    cookie: buildParameters([...cookiePairs, ...parseCookiePairs(state.cookies)]),
  }

  return {
    id: nanoid(6),
    parentId: options.parentId,
    name,
    type: MenuItemType.ApiDetail,
    data: {
      id: nanoid(6),
      name,
      path: url.pathname || '/',
      method,
      status: ApiStatus.Developing,
      serverUrl: url.origin,
      parameters: {
        query: parameters.query,
        path: parameters.path.length > 0 ? parameters.path : undefined,
        header: parameters.header.length > 0 ? parameters.header : undefined,
        cookie: parameters.cookie.length > 0 ? parameters.cookie : undefined,
      },
      requestBody,
    },
  }
}
