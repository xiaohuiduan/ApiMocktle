import type { ApiMenuBase, ApiMenuData } from '@/components/ApiMenu/ApiMenu.type'
import type { JsonSchema } from '@/components/JsonSchema'

import type {
  ApiStatus,
  BodyType,
  CatalogType,
  ContentType,
  HttpMethod,
  MenuItemType,
  ParamType,
} from './enums'

export type TabContentType = CatalogType | MenuItemType | 'blank'

export interface Creator {
  id: string
  name: string
  username: string
}

interface ParameterBase {
  id: string
  name?: string
  description?: string
  enable?: boolean
  required?: boolean
}

/** 请求参数信息（非数组类型）。 */
interface NonArrayParameter extends ParameterBase {
  type: Exclude<ParamType, ParamType.Array>
  example?: string
  /** 文件上传时的文件路径（仅 type === 'file' 时有效） */
  filePath?: string
}

/** 请求参数信息（数组类型）。 */
interface ArrayParameter extends ParameterBase {
  type: ParamType.Array
  example?: string[]
}

/** 请求参数信息的联合类型。 */
export type Parameter = NonArrayParameter | ArrayParameter

export interface ApiDetailsResponse {
  id: string
  /** HTTP 状态码 */
  code: number
  /** 响应名称 */
  name: string
  /** 内容格式 */
  contentType?: ContentType
  jsonSchema?: JsonSchema
}

interface ApiDetailsResponseExample {
  id: string
  responseId: ApiDetailsResponse['id']
  name: string
  data: string
}

export interface ApiRequestBody {
  type: BodyType
  parameters?: Parameter[]
  jsonSchema?: JsonSchema
  rawText?: string
}

export interface ApiRunHeader {
  name: string
  value: string
}

export interface ApiEnvironmentValue {
  id: string
  name: string
  value?: string
  enable?: boolean
}

export const GLOBAL_PARAMETER_SECTIONS = ['header', 'cookie', 'query', 'body'] as const

export type ApiEnvironmentGlobalParameterSection = typeof GLOBAL_PARAMETER_SECTIONS[number]
export type ApiEnvironmentGlobalParameters = Record<ApiEnvironmentGlobalParameterSection, ApiEnvironmentValue[]>

export interface ApiEnvironmentBaseUrl {
  id: string
  name: string
  url: string
}

export interface ApiEnvironment {
  id: string
  name: string
  url: string
  shared?: boolean
  baseUrls?: ApiEnvironmentBaseUrl[]
  variables?: ApiEnvironmentValue[]
  parameters?: ApiEnvironmentGlobalParameters
}

export interface ProjectEnvironmentConfig {
  globalVariables: ApiEnvironmentValue[]
  globalParameters: ApiEnvironmentGlobalParameters
  legacyGlobalParameters?: ApiEnvironmentValue[]
  vaultSecrets: ApiEnvironmentValue[]
  environments: ApiEnvironment[]
}

export interface ApiRunResult {
  url: string
  method: HttpMethod
  status: number
  statusText: string
  durationMs: number
  requestHeaders: ApiRunHeader[]
  requestQuery: ApiRunHeader[]
  requestCookie: ApiRunHeader[]
  requestBodyParameters: ApiRunHeader[]
  requestBodyText?: string
  headers: ApiRunHeader[]
  contentType?: string
  body?: string
  proxyType?: string
}

export interface ProxyConfig {
  proxyType: 'socks5' | 'http' | 'none'
  host: string
  port: number
  username?: string
  password?: string
}

export interface ProxyTestResult {
  ok: boolean
  statusCode?: number
  durationMs?: number
  error?: string
}

export interface ApiDetails {
  /** 唯一标识 */
  id: string
  /** 请求方法 */
  method: HttpMethod
  /** 接口路径 */
  path?: string
  /** 接口名称 */
  name?: string
  /** 接口状态 */
  status: ApiStatus
  /** 责任人 */
  responsibleId?: string
  /** 修改者 */
  editorId?: string
  /** 创建者 */
  creatorId?: string
  /** 接口标签 */
  tags?: string[]
  /** 前置 URL 选择 */
  serverId?: string
  /** 接口前置 URL */
  serverUrl?: string
  /** 接口说明 */
  description?: string
  /** 请求参数 */
  parameters?: {
    cookie?: Parameter[]
    header?: Parameter[]
    query?: Parameter[]
    path?: Parameter[]
  }
  /** 请求参数 - Body */
  requestBody?: ApiRequestBody
  /** 返回响应 */
  responses?: ApiDetailsResponse[]
  /** 响应示例 */
  responseExamples?: ApiDetailsResponseExample[]
  /** 接口文档创建时间 */
  createdAt?: string
  /** 接口文档更新时间 */
  updatedAt?: string
}

export interface ApiDoc {
  /** 唯一标识 */
  id: string
  /** 文档标题 */
  name: string
  /** 创建者唯一标识 */
  creatorId?: string
  /** 编辑者唯一标识 */
  editorId?: string
  /** 文档内容 */
  content?: string
  /** 创建时间 */
  createAt?: string
  /** 最后修改时间 */
  updateAt?: string
}

export interface ApiSchema {
  jsonSchema: JsonSchema
}

export interface ApiFolder {
  name: string
  parentId?: ApiMenuBase['id']
  serverId?: string
  serverUrl?: string
  /** 文件夹备注。 */
  description?: string
}

export interface RecycleDataItem {
  id: string
  deletedItem: ApiMenuData
  creator: Creator
  expiredAt: string
}

export type RecycleCatalogType = CatalogType.Http | CatalogType.Schema | CatalogType.Request

export type RecycleData = Record<RecycleCatalogType, { list?: RecycleDataItem[] }>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyType = any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UnsafeAny = any
