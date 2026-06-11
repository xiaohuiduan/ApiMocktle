import { nanoid } from 'nanoid'
import type {
  MockRule,
  MockTargetType,
  MockRulePayload,
  MockCallLog,
  AgentDiscoverResult,
} from '../types/mock.types'

// ==================== 校验 ====================

export interface ValidationError {
  field: string
  message: string
}

/**
 * 校验单条 Mock 规则，返回错误列表（空数组表示合法）
 */
export function validateMockRule(rule: Partial<MockRule>): ValidationError[] {
  const errors: ValidationError[] = []

  if (!rule.className?.trim()) {
    errors.push({ field: 'className', message: '类名不能为空' })
  } else if (!isValidJavaFqn(rule.className)) {
    errors.push({ field: 'className', message: '类名格式无效，应为全限定名如 com.example.MyClass' })
  }

  if (!rule.methodName?.trim()) {
    errors.push({ field: 'methodName', message: '方法名不能为空' })
  } else if (!isValidJavaIdentifier(rule.methodName)) {
    errors.push({ field: 'methodName', message: '方法名不是合法的 Java 标识符' })
  }

  if (!rule.targetType) {
    errors.push({ field: 'targetType', message: '目标类型不能为空' })
  } else if (!['feign', 'mapper', 'custom'].includes(rule.targetType)) {
    errors.push({ field: 'targetType', message: `不支持的目标类型: ${rule.targetType}` })
  }

  if (rule.paramTypes) {
    for (let i = 0; i < rule.paramTypes.length; i++) {
      if (!isValidJavaFqn(rule.paramTypes[i])) {
        errors.push({ field: `paramTypes[${i}]`, message: `参数类型 "${rule.paramTypes[i]}" 不是合法的全限定名` })
      }
    }
  }

  if (rule.responseDelay !== undefined && (rule.responseDelay < 0 || !Number.isFinite(rule.responseDelay))) {
    errors.push({ field: 'responseDelay', message: '响应延迟必须为非负有限数' })
  }

  if (rule.maxTimes !== undefined && (rule.maxTimes < 1 || !Number.isInteger(rule.maxTimes))) {
    errors.push({ field: 'maxTimes', message: '最大拦截次数必须为正整数' })
  }

  return errors
}

/** Java 全限定类名校验：至少包含一个 '.' 分隔符，每段为合法标识符 */
export function isValidJavaFqn(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  const parts = name.split('.')
  return parts.length >= 2 && parts.every(isValidJavaIdentifier)
}

/** Java 标识符校验 */
export function isValidJavaIdentifier(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)
}

// ==================== 工厂函数 ====================

/**
 * 创建一条空的 Mock 规则（带默认值）
 */
export function createEmptyMockRule(overrides?: Partial<MockRule>): MockRule {
  return {
    id: nanoid(),
    enabled: true,
    targetType: 'feign',
    className: '',
    methodName: '',
    responseTemplate: {},
    ...overrides,
  }
}

/**
 * 从 Agent 发现的方法信息生成一条初始 Mock 规则
 */
export function createMockRuleFromDiscovery(
  className: string,
  methodName: string,
  paramTypes?: string[],
  returnType?: string,
): MockRule {
  return {
    id: nanoid(),
    enabled: true,
    targetType: guessTargetType(className),
    className,
    methodName,
    paramTypes,
    responseTemplate: generateDefaultResponseTemplate(returnType),
    responseClassName: returnType,
  }
}

/**
 * 根据类名猜测目标类型
 */
export function guessTargetType(className: string): MockTargetType {
  const lower = className.toLowerCase()
  if (lower.includes('feign') || lower.includes('client')) return 'feign'
  if (lower.includes('mapper') || lower.includes('dao') || lower.includes('repository')) return 'mapper'
  return 'custom'
}

/**
 * 生成默认的返回值模板（根据返回类型名推断）
 */
export function generateDefaultResponseTemplate(returnType?: string): unknown {
  if (!returnType) return {}

  // 提取短类名（去掉包名和泛型参数）
  const shortName = returnType.split('.').pop() || returnType
  const baseName = shortName.replace(/<.*/, '') // "Result<OrderVO>" → "Result"

  // Result<T> / Response<T> 包装类型 → 生成 { code: 200, data: {}, message: "success" }
  if (/^(Result|Response|ApiResult|BaseResponse|CommonResult)$/.test(baseName)) {
    return { code: 200, message: 'success', data: {} }
  }

  // List/Array 类型 → []
  if (/^(List|ArrayList|LinkedList|Set|Collection|Array)$/.test(baseName)) {
    return []
  }

  // Map 类型 → {}
  if (/^(Map|HashMap|LinkedHashMap|TreeMap|ConcurrentHashMap)$/.test(baseName)) {
    return {}
  }

  // Page/PageInfo 分页类型
  if (/^(Page|PageInfo|PageResult|PageResponse)$/.test(baseName)) {
    return { total: 0, list: [], pageNum: 1, pageSize: 10 }
  }

  // 基本类型
  const primitiveDefaults: Record<string, unknown> = {
    String: '',
    Integer: 0,
    int: 0,
    Long: 0,
    long: 0,
    Boolean: false,
    boolean: false,
    Double: 0.0,
    double: 0.0,
    Float: 0.0,
    float: 0.0,
    Void: null,
    void: null,
  }
  if (baseName in primitiveDefaults) {
    return primitiveDefaults[baseName]
  }

  // 普通对象 → {}
  return {}
}

// ==================== 序列化 / 转换 ====================

/**
 * 将 MockRule 转换为推送到 Agent 的 payload 格式
 * - responseTemplate 序列化为 JSON string
 * - 剥离 UI-only 字段
 */
export function toAgentPayload(rule: MockRule, variables?: Record<string, string>): MockRulePayload {
  const interpolated = variables
    ? interpolateValue(rule.responseTemplate, variables)
    : rule.responseTemplate

  return {
    id: rule.id,
    className: rule.className,
    methodName: rule.methodName,
    paramTypes: rule.paramTypes,
    responseTemplate: typeof interpolated === 'string'
      ? interpolated
      : JSON.stringify(interpolated),
    responseDelay: rule.responseDelay,
    maxTimes: rule.maxTimes,
    returnType: rule.responseClassName,
  }
}

/**
 * 将规则列表转为 Agent payload 列表（过滤禁用规则）
 */
export function toAgentPayloads(rules: MockRule[], variables?: Record<string, string>): MockRulePayload[] {
  return rules.filter(r => r.enabled).map(r => toAgentPayload(r, variables))
}

// ==================== 变量插值 ====================

/**
 * 对值进行 {{variable}} 插值
 * - string 类型：替换 {{key}} 为变量值
 * - object/array 类型：递归处理
 * - 其他类型：原样返回
 */
export function interpolateValue(value: unknown, variables: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      return key in variables ? variables[key] : `{{${key}}}`
    })
  }
  if (Array.isArray(value)) {
    return value.map(item => interpolateValue(item, variables))
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = interpolateValue(v, variables)
    }
    return result
  }
  return value
}

// ==================== 日志处理 ====================

/**
 * 格式化 Mock 调用日志为可读字符串
 */
export function formatMockCallLog(log: MockCallLog): string {
  const args = log.args.map(a => (typeof a === 'string' ? `"${a}"` : JSON.stringify(a))).join(', ')
  return `${log.className}.${log.methodName}(${args}) → ${log.durationMs}ms`
}

/**
 * 从发现结果中获取所有可拦截方法的扁平列表
 */
export function flattenDiscoveredMethods(discover: AgentDiscoverResult) {
  const methods: Array<{
    className: string
    displayName: string
    methodName: string
    paramTypes: string[]
    returnType: string
    methodDisplayName: string
    source: 'feign' | 'mapper'
  }> = []

  for (const cls of discover.feignClients) {
    for (const m of cls.methods) {
      methods.push({
        className: cls.className,
        displayName: cls.displayName,
        methodName: m.name,
        paramTypes: m.paramTypes,
        returnType: m.returnType,
        methodDisplayName: m.displayName,
        source: 'feign',
      })
    }
  }

  for (const cls of discover.mappers) {
    for (const m of cls.methods) {
      methods.push({
        className: cls.className,
        displayName: cls.displayName,
        methodName: m.name,
        paramTypes: m.paramTypes,
        returnType: m.returnType,
        methodDisplayName: m.displayName,
        source: 'mapper',
      })
    }
  }

  return methods
}

// ==================== 流程引擎 Mock 规则推送 ====================

/**
 * 构建推送到 Agent 的完整 payload（含变量插值）
 *
 * 简化版：只处理节点级别的 Mock 规则，不做全局合并
 */
export function buildAgentPushPayload(
  nodeRules: MockRule[] | undefined,
  variables: Record<string, string>,
): MockRulePayload[] {
  if (!nodeRules || nodeRules.length === 0) return []
  return toAgentPayloads(nodeRules, variables)
}

