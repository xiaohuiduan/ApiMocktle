/** pm 对象的 TypeScript 类型定义字符串，用于 Monaco Editor 自动补全 */
export const PM_TYPE_DEFS = `
interface PmEnvironment {
  /** 获取环境变量值 */
  get(key: string): string | undefined
  /** 设置环境变量值（会话级共享，可跨请求使用） */
  set(key: string, value: string): void
  /** 删除环境变量 */
  unset(key: string): void
  /** 检查环境变量是否存在 */
  has(key: string): boolean
  /** 清空所有环境变量 */
  clear(): void
}

interface PmGlobals {
  /** 获取全局变量值 */
  get(key: string): string | undefined
  /** 设置全局变量值（仅当前请求生效） */
  set(key: string, value: string): void
  /** 删除全局变量 */
  unset(key: string): void
  /** 检查全局变量是否存在 */
  has(key: string): boolean
  /** 清空所有全局变量 */
  clear(): void
}

interface PmVariables {
  /** 获取临时变量值 */
  get(key: string): string | undefined
  /** 设置临时变量值 */
  set(key: string, value: string): void
}

interface PmRequestHeader {
  key: string
  value: string
}

interface PmRequestHeaders {
  /** 获取所有请求头 */
  all(): Array<{ name: string; value: string }>
  /** 根据名称获取请求头值 */
  get(key: string): string | undefined
  /** 添加或更新请求头 */
  upsert(header: PmRequestHeader): void
  /** 删除请求头 */
  remove(key: string): void
}

interface PmResponseBody {
  /** 获取原始响应文本 */
  text(): string
  /** 解析响应为 JSON */
  json(): any
}

interface PmResponseHeaders {
  /** 获取所有响应头 */
  all(): Array<{ name: string; value: string }>
  /** 根据名称获取响应头值 */
  get(key: string): string | undefined
}

interface PmResponse {
  /** HTTP 状态码 */
  code: number
  /** 状态文本 */
  status: string
  /** 响应头 */
  headers: PmResponseHeaders
  /** 响应体（text/json） */
  text(): string
  /** 解析响应体为 JSON */
  json(): any
  /** 响应时间（毫秒） */
  responseTime: number
}

interface PmRequestBody {
  /** 原始请求体文本 */
  raw: string
  /** 更新请求体（仅前置脚本有效） */
  update(newBody: string): void
}

interface PmRequest {
  /** 请求 URL */
  url: string
  /** 请求方法 */
  method: string
  /** 请求头操作 */
  headers: PmRequestHeaders
  /** 请求体操作 */
  body: PmRequestBody
}

interface ChaiAssertion {
  to: {
    equal(expected: any): void
    deep: { equal(expected: any): void }
    be: {
      true: void
      false: void
      undefined: void
      null: void
    }
    have: {
      property(prop: string): void
      length(len: number): void
    }
    not: {
      equal(expected: any): void
      be: { null: void; undefined: void }
    }
  }
}

interface Pm {
  /** 环境变量操作 */
  env: PmEnvironment
  /** 全局变量操作 */
  globals: PmGlobals
  /** 临时变量操作（本次请求生命周期） */
  variables: PmVariables
  /** 当前请求信息（前置脚本可修改） */
  request: PmRequest
  /** 响应信息（仅后置脚本可用） */
  response?: PmResponse
  /** 声明测试用例 */
  test(name: string, fn: () => void): void
  /** 断言（Chai expect 风格） */
  expect(value: any): ChaiAssertion
}

/** 脚本执行上下文的 pm 对象 */
declare const pm: Pm
`
