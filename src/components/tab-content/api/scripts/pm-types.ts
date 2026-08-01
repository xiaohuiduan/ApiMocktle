/** pm 对象的上下文数据（主线程传入 Worker） */
export interface PmContext {
  /** 当前环境变量 */
  environment: Record<string, string>
  /** 全局变量 */
  globals: Record<string, string>
  /** 临时变量（本次请求生命周期） */
  variables: Record<string, string>
  /** 当前请求信息 */
  request: {
    url: string
    method: string
    headers: { name: string, value: string }[]
    body: string
  }
  /** 响应信息（仅后置脚本可用） */
  response?: {
    status: number
    statusText: string
    headers: { name: string, value: string }[]
    body: string
    responseTime: number
  }
}

/** Worker 收到的消息 */
export interface ScriptWorkerRequest {
  type: 'execute'
  code: string
  context: PmContext
}

/** Worker 返回的消息 */
export interface ScriptWorkerResponse {
  type: 'result'
  result: import('@/types').ScriptExecutionResult
}
