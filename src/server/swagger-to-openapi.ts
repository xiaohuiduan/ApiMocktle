/**
 * Swagger 2.0 → OpenAPI 3.0 转换器
 *
 * 将 Swagger 2.0 文档转为 OpenAPI 3.0 格式，转换后的文档可直接传入
 * importOpenApiDocumentToMenuItems() 完成导入。
 */

const DEF_REF_PREFIX = '#/definitions/'
const OA_REF_PREFIX = '#/components/schemas/'

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'] as const

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

/**
 * 将 Swagger 2.0 公用的 consumes 数组与 OpenAPI 3.0 requestBody content-type map 匹配。
 */
function resolveConsumes(
  operation: Record<string, unknown>,
  rootDoc: Record<string, unknown>,
): string[] {
  const opConsumes = operation.consumes

  if (isArray(opConsumes) && opConsumes.length > 0) {
    return opConsumes.filter((v): v is string => typeof v === 'string')
  }

  const rootConsumes = rootDoc.consumes

  if (isArray(rootConsumes) && rootConsumes.length > 0) {
    return rootConsumes.filter((v): v is string => typeof v === 'string')
  }

  return []
}

/**
 * 将 Swagger 2.0 公用的 produces 数组转为 response content-type map 的优先 key。
 */
function resolveProduces(
  operation: Record<string, unknown>,
  rootDoc: Record<string, unknown>,
): string[] {
  const opProduces = operation.produces

  if (isArray(opProduces) && opProduces.length > 0) {
    return opProduces.filter((v): v is string => typeof v === 'string')
  }

  const rootProduces = rootDoc.produces

  if (isArray(rootProduces) && rootProduces.length > 0) {
    return rootProduces.filter((v): v is string => typeof v === 'string')
  }

  return ['application/json']
}

/**
 * 递归替换所有的 `#/definitions/` → `#/components/schemas/`
 */
function convertRefsDeep(value: unknown): unknown {
  if (isObject(value)) {
    if (typeof value.$ref === 'string' && value.$ref.startsWith(DEF_REF_PREFIX)) {
      return {
        ...value,
        $ref: OA_REF_PREFIX + value.$ref.slice(DEF_REF_PREFIX.length),
      }
    }

    const out: Record<string, unknown> = {}

    for (const [k, v] of Object.entries(value)) {
      out[k] = convertRefsDeep(v)
    }

    return out
  }

  if (isArray(value)) {
    return value.map((item) => convertRefsDeep(item))
  }

  return value
}

/**
 * 合并 path-item 级别和 operation 级别的 parameters 列表。
 * Swagger 2.0 中，path-item.parameters 会被所有 operation 继承。
 * OpenAPI 3.0 中 parameters 仅在各自 operation 下。
 */
function mergeParameters(
  pathParameters: unknown[],
  opParameters: unknown[],
): Record<string, unknown>[] {
  const merged: Record<string, unknown>[] = []

  for (const param of pathParameters) {
    if (isObject(param)) {
      merged.push(param)
    }
  }

  for (const param of opParameters) {
    if (isObject(param)) {
      merged.push(param)
    }
  }

  return merged
}

/**
 * 将 Swagger 2.0 的 body parameter 转为 OpenAPI 3.0 的 requestBody。
 */
function buildRequestBodyFromBodyParam(
  bodyParam: Record<string, unknown>,
  consumes: string[],
): Record<string, unknown> | undefined {
  const schema = bodyParam.schema

  if (!schema) {
    return undefined
  }

  const content: Record<string, unknown> = {}
  const contentType = consumes.length > 0 ? consumes[0] : 'application/json'

  content[contentType] = { schema: convertRefsDeep(schema) }

  return {
    description: typeof bodyParam.description === 'string' ? bodyParam.description : '',
    required: bodyParam.required !== false,
    content,
  }
}

/**
 * 将 Swagger 2.0 的 formData parameters 转为 OpenAPI 3.0 的 requestBody。
 */
function buildRequestBodyFromFormData(
  formParams: Record<string, unknown>[],
  consumes: string[],
): Record<string, unknown> | undefined {
  if (formParams.length === 0) {
    return undefined
  }

  const hasFile = formParams.some((p) => p.type === 'file' || p.in === 'formData' && p.type === 'file')
  const contentType = hasFile ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const param of formParams) {
    const name = typeof param.name === 'string' ? param.name : ''

    if (!name) {
      continue
    }

    const paramType = param.type === 'file' ? { type: 'string', format: 'binary' }
      : param.type ? { type: param.type }
      : param.schema ? convertRefsDeep(param.schema)
      : { type: 'string' }

    properties[name] = typeof param.description === 'string'
      ? { ...(paramType as Record<string, unknown>), description: param.description }
      : paramType

    if (param.required === true) {
      required.push(name)
    }
  }

  return {
    description: '',
    required: false,
    content: {
      [contentType]: {
        schema: {
          type: 'object',
          properties,
          ...(required.length > 0 ? { required } : {}),
        },
      },
    },
  }
}

/**
 * 将 Swagger 2.0 的 operation parameters 转换为 OpenAPI 3.0 格式。
 * - `in: body` → requestBody
 * - `in: formData` → requestBody (form)
 * - 其他 → 保留为 parameters
 */
function convertOperationParams(
  allParams: Record<string, unknown>[],
  consumes: string[],
): {
  parameters: Record<string, unknown>[]
  requestBody?: Record<string, unknown>
} {
  const standardParams: Record<string, unknown>[] = []
  const formParams: Record<string, unknown>[] = []
  let bodyParam: Record<string, unknown> | undefined

  for (const param of allParams) {
    const pIn = param.in

    if (pIn === 'body') {
      bodyParam = param

      continue
    }

    if (pIn === 'formData') {
      formParams.push(param)

      continue
    }

    // path, query, header, cookie 等标准参数 -> 转换 refs 后保留
    const converted = convertRefsDeep(param) as Record<string, unknown>

    // 归一化 Swagger 2.0 的 x-example → OpenAPI 3.0 的 example
    if (converted['x-example'] !== undefined && converted.example === undefined) {
      converted.example = converted['x-example']
    }

    standardParams.push(converted)
  }

  let requestBody: Record<string, unknown> | undefined

  if (bodyParam) {
    requestBody = buildRequestBodyFromBodyParam(bodyParam, consumes)
  }
  else if (formParams.length > 0) {
    requestBody = buildRequestBodyFromFormData(formParams, consumes)
  }

  return { parameters: standardParams, requestBody }
}

/**
 * 将 Swagger 2.0 的 responses 转为 OpenAPI 3.0 格式。
 * Swagger 2.0: `{ [code]: { description, schema, headers } }`
 * OpenAPI 3.0: `{ [code]: { description, content: { [type]: { schema } }, headers } }`
 */
function convertResponses(
  responses: Record<string, unknown> | undefined,
  produces: string[],
): Record<string, unknown> {
  if (!responses || !isObject(responses)) {
    return {}
  }

  const result: Record<string, unknown> = {}
  const defaultContentType = produces.length > 0 ? produces[0] : 'application/json'

  for (const [code, resp] of Object.entries(responses)) {
    if (!isObject(resp)) {
      continue
    }

    const description = typeof resp.description === 'string' ? resp.description : ''
    const schema = resp.schema
    const headers = resp.headers

    const entry: Record<string, unknown> = { description }

    if (schema) {
      entry.content = {
        [defaultContentType]: { schema: convertRefsDeep(schema) },
      }
    }

    if (isObject(headers)) {
      entry.headers = convertRefsDeep(headers)
    }

    result[code] = entry
  }

  return result
}

/**
 * Swagger 2.0 → OpenAPI 3.0 主转换函数
 */
export function swaggerToOpenApi(doc: Record<string, unknown>): Record<string, unknown> {
  // 1. 基础校验
  if (doc.swagger !== '2.0') {
    throw new Error('不是有效的 Swagger 2.0 文档')
  }

  // 2. 转换 info
  const info = isObject(doc.info) ? { ...doc.info } : { title: 'API', version: '1.0.0' }

  if (typeof info.version !== 'string') {
    info.version = String(info.version ?? '1.0.0')
  }

  // 3. 转换 definitions → components.schemas
  const definitions = isObject(doc.definitions) ? convertRefsDeep(doc.definitions) as Record<string, unknown> : {}
  const components: Record<string, unknown> = {}

  if (Object.keys(definitions).length > 0) {
    components.schemas = definitions
  }

  // 4. 转换 paths
  const paths: Record<string, Record<string, unknown>> = {}
  const rawPaths = isObject(doc.paths) ? doc.paths : {}

  for (const [pathName, pathValue] of Object.entries(rawPaths)) {
    if (!isObject(pathValue)) {
      continue
    }

    // 处理 $ref path item（极少见，直接跳过）
    if (typeof pathValue.$ref === 'string') {
      continue
    }

    const pathItem = { ...pathValue } as Record<string, unknown>
    const pathParameters = isArray(pathItem.parameters) ? pathItem.parameters as Record<string, unknown>[] : []

    const oaPathItem: Record<string, unknown> = {}

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method]

      if (!isObject(operation)) {
        continue
      }

      const op = { ...operation } as Record<string, unknown>
      const opParameters = isArray(op.parameters) ? op.parameters as Record<string, unknown>[] : []
      const allParams = mergeParameters(pathParameters, opParameters)
      const consumes = resolveConsumes(op, doc)
      const produces = resolveProduces(op, doc)

      const { parameters: convertedParams, requestBody } = convertOperationParams(allParams, consumes)

      const oaOp: Record<string, unknown> = {}

      // operationId, summary, description, tags, deprecated
      if (typeof op.operationId === 'string') oaOp.operationId = op.operationId
      if (typeof op.summary === 'string') oaOp.summary = op.summary
      if (typeof op.description === 'string') oaOp.description = op.description
      if (isArray(op.tags)) oaOp.tags = op.tags
      if (op.deprecated === true) oaOp.deprecated = true

      // 安全定义（暂不处理 security）
      if (op.security !== undefined) {
        oaOp.security = op.security
      }

      // 扩展属性
      for (const key of ['x-controllerName', 'x-controller-name', 'x-controller', 'controller', 'controllerName']) {
        if (typeof op[key] === 'string' && (op[key] as string).trim()) {
          oaOp[key] = op[key]
        }
      }

      if (convertedParams.length > 0) {
        oaOp.parameters = convertedParams
      }

      if (requestBody) {
        oaOp.requestBody = requestBody
      }

      const responses = isObject(op.responses) ? op.responses as Record<string, unknown> : {}
      oaOp.responses = convertResponses(responses, produces)

      oaPathItem[method] = oaOp
    }

    if (Object.keys(oaPathItem).length > 0) {
      // 移除 pathItem 上的 parameters（已合并到各 operation）
      paths[pathName] = oaPathItem
    }
  }

  // 5. 处理安全定义（如果存在）
  const rawSecurityDefs = isObject(doc.securityDefinitions) ? doc.securityDefinitions : {}

  if (Object.keys(rawSecurityDefs).length > 0) {
    const securitySchemes = convertRefsDeep(rawSecurityDefs) as Record<string, unknown>

    if (!components.securitySchemes) {
      components.securitySchemes = securitySchemes
    }
  }

  // 6. 组装 OpenAPI 3.0 文档
  const result: Record<string, unknown> = {
    openapi: '3.0.3',
    info,
    paths,
  }

  if (Object.keys(components).length > 0) {
    result.components = components
  }

  // 安全要求
  if (isArray(doc.security)) {
    result.security = doc.security
  }

  // tags
  if (isArray(doc.tags)) {
    result.tags = doc.tags
  }

  // 外部文档
  if (isObject(doc.externalDocs)) {
    result.externalDocs = doc.externalDocs
  }

  return result
}
