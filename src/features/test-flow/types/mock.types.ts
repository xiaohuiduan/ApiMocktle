// ==================== Mock 依赖拦截类型定义 ====================

/** Mock 规则目标类型 */
export type MockTargetType = 'feign' | 'mapper' | 'custom'

/** 单条 Mock 规则 */
export interface MockRule {
  id: string
  enabled: boolean
  targetType: MockTargetType
  className: string // 全限定类名 "com.example.feign.OrderFeignClient"
  methodName: string // 方法名 "createOrder"
  paramTypes?: string[] // 参数类型（区分重载）["com.example.dto.CreateOrderReq"]
  responseTemplate: unknown // 返回值 JSON 模板，支持 {{变量}} 插值
  responseClassName?: string // 返回值目标类型（Agent 反序列化用）
  matchExpression?: string // 可选：参数匹配表达式（仅匹配特定参数时拦截）
  responseDelay?: number // 模拟延迟(ms)
  maxTimes?: number // 最多拦截次数，之后放行真实调用
}

/** Mock 调用日志 */
export interface MockCallLog {
  className: string
  methodName: string
  args: unknown[]
  response: unknown
  matchedRuleId: string
  timestamp: number
  durationMs: number
}

/** Agent 发现结果 */
export interface AgentDiscoverResult {
  feignClients: AgentClassInfo[]
  mappers: AgentClassInfo[]
  status: 'connected' | 'disconnected'
  version: string
}

/** Agent 发现的类信息 */
export interface AgentClassInfo {
  className: string
  displayName: string // 短名，如 "OrderFeignClient"
  methods: AgentMethodInfo[]
}

/** Agent 发现的方法信息 */
export interface AgentMethodInfo {
  name: string
  paramTypes: string[]
  returnType: string
  displayName: string // "createOrder(CreateOrderReq) → Result<OrderVO>"
}

/** Mock 推送到 Agent 的规则格式 */
export interface MockRulePayload {
  id: string
  className: string
  methodName: string
  paramTypes?: string[]
  responseTemplate: string // JSON string
  responseDelay?: number
  maxTimes?: number
  returnType?: string // 返回类型全限定名，帮助 Agent 精确反序列化
}
