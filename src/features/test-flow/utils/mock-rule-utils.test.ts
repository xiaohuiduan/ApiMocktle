import { describe, it, expect } from 'vitest'
import {
  validateMockRule,
  isValidJavaFqn,
  isValidJavaIdentifier,
  createEmptyMockRule,
  createMockRuleFromDiscovery,
  guessTargetType,
  generateDefaultResponseTemplate,
  toAgentPayload,
  toAgentPayloads,
  interpolateValue,
  formatMockCallLog,
  flattenDiscoveredMethods,
  buildAgentPushPayload,
} from './mock-rule-utils'
import type { MockRule, MockTargetType, MockCallLog, AgentDiscoverResult } from '../types/mock.types'

// ==================== isValidJavaIdentifier ====================

describe('isValidJavaIdentifier', () => {
  it('合法标识符', () => {
    expect(isValidJavaIdentifier('myMethod')).toBe(true)
    expect(isValidJavaIdentifier('_private')).toBe(true)
    expect(isValidJavaIdentifier('$special')).toBe(true)
    expect(isValidJavaIdentifier('camelCase')).toBe(true)
    expect(isValidJavaIdentifier('with123')).toBe(true)
  })

  it('非法标识符', () => {
    expect(isValidJavaIdentifier('')).toBe(false)
    expect(isValidJavaIdentifier('123abc')).toBe(false)
    expect(isValidJavaIdentifier('my-method')).toBe(false)
    expect(isValidJavaIdentifier('my method')).toBe(false)
    expect(isValidJavaIdentifier('')).toBe(false)
  })
})

// ==================== isValidJavaFqn ====================

describe('isValidJavaFqn', () => {
  it('合法全限定名', () => {
    expect(isValidJavaFqn('com.example.MyClass')).toBe(true)
    expect(isValidJavaFqn('org.apache.ibatis.mapper.UserMapper')).toBe(true)
    expect(isValidJavaFqn('a.B')).toBe(true)
  })

  it('非法全限定名', () => {
    expect(isValidJavaFqn('MyClass')).toBe(false)        // 无包名
    expect(isValidJavaFqn('')).toBe(false)
    expect(isValidJavaFqn('com.123invalid.Class')).toBe(false)
    expect(isValidJavaFqn('com..MyClass')).toBe(false)    // 空段
  })
})

// ==================== validateMockRule ====================

describe('validateMockRule', () => {
  it('完整合法规则 → 零错误', () => {
    const rule: Partial<MockRule> = {
      targetType: 'feign',
      className: 'com.example.feign.OrderClient',
      methodName: 'createOrder',
      responseTemplate: { code: 200 },
    }
    expect(validateMockRule(rule)).toEqual([])
  })

  it('className 为空 → 报错', () => {
    const errors = validateMockRule({ targetType: 'feign', methodName: 'foo', className: '' })
    expect(errors).toContainEqual(expect.objectContaining({ field: 'className' }))
  })

  it('className 非法格式 → 报错', () => {
    const errors = validateMockRule({ targetType: 'feign', methodName: 'foo', className: 'NoPackage' })
    expect(errors).toContainEqual(expect.objectContaining({ field: 'className', message: expect.stringContaining('全限定名') }))
  })

  it('methodName 为空 → 报错', () => {
    const errors = validateMockRule({ targetType: 'feign', className: 'com.example.A', methodName: '' })
    expect(errors).toContainEqual(expect.objectContaining({ field: 'methodName' }))
  })

  it('targetType 无效 → 报错', () => {
    const errors = validateMockRule({ targetType: 'invalid' as MockTargetType, className: 'com.example.A', methodName: 'foo' })
    expect(errors).toContainEqual(expect.objectContaining({ field: 'targetType' }))
  })

  it('paramTypes 中有非法类型 → 报错', () => {
    const errors = validateMockRule({
      targetType: 'feign',
      className: 'com.example.A',
      methodName: 'foo',
      paramTypes: ['com.example.Req', 'InvalidNoPkg'],
    })
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('paramTypes[1]')
  })

  it('responseDelay 为负数 → 报错', () => {
    const errors = validateMockRule({
      targetType: 'feign',
      className: 'com.example.A',
      methodName: 'foo',
      responseDelay: -100,
    })
    expect(errors).toContainEqual(expect.objectContaining({ field: 'responseDelay' }))
  })

  it('maxTimes 为 0 → 报错', () => {
    const errors = validateMockRule({
      targetType: 'feign',
      className: 'com.example.A',
      methodName: 'foo',
      maxTimes: 0,
    })
    expect(errors).toContainEqual(expect.objectContaining({ field: 'maxTimes' }))
  })

  it('maxTimes 为小数 → 报错', () => {
    const errors = validateMockRule({
      targetType: 'feign',
      className: 'com.example.A',
      methodName: 'foo',
      maxTimes: 2.5,
    })
    expect(errors).toContainEqual(expect.objectContaining({ field: 'maxTimes' }))
  })

  it('多个错误同时返回', () => {
    const errors = validateMockRule({})
    expect(errors.length).toBeGreaterThanOrEqual(3) // className, methodName, targetType
  })
})

// ==================== guessTargetType ====================

describe('guessTargetType', () => {
  it('包含 feign/client → feign', () => {
    expect(guessTargetType('com.example.feign.OrderFeignClient')).toBe('feign')
    expect(guessTargetType('com.example.UserServiceClient')).toBe('feign')
  })

  it('包含 mapper/dao/repository → mapper', () => {
    expect(guessTargetType('com.example.mapper.UserMapper')).toBe('mapper')
    expect(guessTargetType('com.example.dao.OrderDao')).toBe('mapper')
    expect(guessTargetType('com.example.repo.UserRepository')).toBe('mapper')
  })

  it('其他 → custom', () => {
    expect(guessTargetType('com.example.service.OrderService')).toBe('custom')
    expect(guessTargetType('com.example.util.DateUtils')).toBe('custom')
  })
})

// ==================== generateDefaultResponseTemplate ====================

describe('generateDefaultResponseTemplate', () => {
  it('Result 包装类型 → { code, message, data }', () => {
    const tpl = generateDefaultResponseTemplate('com.example.Result<OrderVO>') as Record<string, unknown>
    expect(tpl.code).toBe(200)
    expect(tpl.message).toBe('success')
    expect(tpl.data).toEqual({})
  })

  it('ApiResult 类型', () => {
    const tpl = generateDefaultResponseTemplate('ApiResult<String>') as Record<string, unknown>
    expect(tpl.code).toBe(200)
  })

  it('List 类型 → []', () => {
    expect(generateDefaultResponseTemplate('java.util.List<UserVO>')).toEqual([])
    expect(generateDefaultResponseTemplate('ArrayList<String>')).toEqual([])
  })

  it('Map 类型 → {}', () => {
    expect(generateDefaultResponseTemplate('java.util.Map<String, Object>')).toEqual({})
  })

  it('Page 类型 → 分页结构', () => {
    const tpl = generateDefaultResponseTemplate('Page<UserVO>') as Record<string, unknown>
    expect(tpl.total).toBe(0)
    expect(tpl.list).toEqual([])
  })

  it('基本类型 → 对应默认值', () => {
    expect(generateDefaultResponseTemplate('String')).toBe('')
    expect(generateDefaultResponseTemplate('Integer')).toBe(0)
    expect(generateDefaultResponseTemplate('Long')).toBe(0)
    expect(generateDefaultResponseTemplate('Boolean')).toBe(false)
    expect(generateDefaultResponseTemplate('Double')).toBe(0.0)
  })

  it('无返回类型 → {}', () => {
    expect(generateDefaultResponseTemplate(undefined)).toEqual({})
    expect(generateDefaultResponseTemplate('')).toEqual({})
  })

  it('普通对象类型 → {}', () => {
    expect(generateDefaultResponseTemplate('com.example.vo.OrderVO')).toEqual({})
  })
})

// ==================== toAgentPayload / toAgentPayloads ====================

describe('toAgentPayload', () => {
  it('基本转换：responseTemplate → JSON string', () => {
    const rule = createEmptyMockRule({
      className: 'com.example.A',
      methodName: 'foo',
      responseTemplate: { code: 200, data: { id: 1 } },
    })
    const payload = toAgentPayload(rule)
    expect(payload.id).toBe(rule.id)
    expect(payload.className).toBe('com.example.A')
    expect(payload.methodName).toBe('foo')
    expect(typeof payload.responseTemplate).toBe('string')
    expect(JSON.parse(payload.responseTemplate)).toEqual({ code: 200, data: { id: 1 } })
  })

  it('变量插值', () => {
    const rule = createEmptyMockRule({
      className: 'com.example.A',
      methodName: 'foo',
      responseTemplate: { orderId: '{{orderId}}', status: 'active' },
    })
    const payload = toAgentPayload(rule, { orderId: 'ORD_123' })
    const parsed = JSON.parse(payload.responseTemplate)
    expect(parsed.orderId).toBe('ORD_123')
    expect(parsed.status).toBe('active')
  })

  it('string 类型的 responseTemplate 直接传递', () => {
    const rule = createEmptyMockRule({
      className: 'com.example.A',
      methodName: 'foo',
      responseTemplate: 'raw string response',
    })
    const payload = toAgentPayload(rule)
    expect(payload.responseTemplate).toBe('raw string response')
  })

  it('剥离 UI-only 字段，保留 returnType', () => {
    const rule = createEmptyMockRule({
      enabled: true,
      targetType: 'feign',
      matchExpression: 'some expr',
      responseClassName: 'com.example.VO',
    })
    const payload = toAgentPayload(rule)
    expect(payload).not.toHaveProperty('enabled')
    expect(payload).not.toHaveProperty('targetType')
    expect(payload).not.toHaveProperty('matchExpression')
    expect(payload.returnType).toBe('com.example.VO')
  })
})

describe('toAgentPayloads', () => {
  it('过滤掉禁用规则', () => {
    const rules: MockRule[] = [
      createEmptyMockRule({ enabled: true, className: 'com.example.A', methodName: 'foo' }),
      createEmptyMockRule({ enabled: false, className: 'com.example.B', methodName: 'bar' }),
      createEmptyMockRule({ enabled: true, className: 'com.example.C', methodName: 'baz' }),
    ]
    const payloads = toAgentPayloads(rules)
    expect(payloads).toHaveLength(2)
    expect(payloads.map(p => p.className)).toEqual(['com.example.A', 'com.example.C'])
  })

  it('空列表 → 空数组', () => {
    expect(toAgentPayloads([])).toEqual([])
  })
})

// ==================== interpolateValue ====================

describe('interpolateValue', () => {
  const vars = { userId: '42', name: '张三' }

  it('string 插值', () => {
    expect(interpolateValue('用户 {{userId}} 的名字是 {{name}}', vars))
      .toBe('用户 42 的名字是 张三')
  })

  it('无匹配变量保持原样', () => {
    expect(interpolateValue('{{unknown}}', vars)).toBe('{{unknown}}')
  })

  it('递归处理 object', () => {
    const input = { id: '{{userId}}', nested: { name: '{{name}}' } }
    expect(interpolateValue(input, vars)).toEqual({ id: '42', nested: { name: '张三' } })
  })

  it('递归处理 array', () => {
    const input = ['{{userId}}', { key: '{{name}}' }]
    expect(interpolateValue(input, vars)).toEqual(['42', { key: '张三' }])
  })

  it('非 string 类型原样返回', () => {
    expect(interpolateValue(123, vars)).toBe(123)
    expect(interpolateValue(null, vars)).toBe(null)
    expect(interpolateValue(true, vars)).toBe(true)
  })
})

// ==================== formatMockCallLog ====================

describe('formatMockCallLog', () => {
  it('格式化可读字符串', () => {
    const log: MockCallLog = {
      className: 'com.example.feign.OrderClient',
      methodName: 'createOrder',
      args: [{ userId: '1' }, 'extra'],
      response: { code: 200 },
      matchedRuleId: 'rule-1',
      timestamp: 1000,
      durationMs: 5,
    }
    const result = formatMockCallLog(log)
    expect(result).toContain('OrderClient.createOrder')
    expect(result).toContain('5ms')
  })
})

// ==================== flattenDiscoveredMethods ====================

describe('flattenDiscoveredMethods', () => {
  it('扁平化 feign + mapper', () => {
    const discover: AgentDiscoverResult = {
      feignClients: [{
        className: 'com.example.feign.OrderClient',
        displayName: 'OrderClient',
        methods: [
          { name: 'createOrder', paramTypes: ['CreateOrderReq'], returnType: 'Result<OrderVO>', displayName: 'createOrder(CreateOrderReq) → Result<OrderVO>' },
        ],
      }],
      mappers: [{
        className: 'com.example.mapper.UserMapper',
        displayName: 'UserMapper',
        methods: [
          { name: 'selectById', paramTypes: ['Long'], returnType: 'User', displayName: 'selectById(Long) → User' },
        ],
      }],
      status: 'connected',
      version: '1.0.0',
    }

    const methods = flattenDiscoveredMethods(discover)
    expect(methods).toHaveLength(2)
    expect(methods[0].source).toBe('feign')
    expect(methods[0].className).toBe('com.example.feign.OrderClient')
    expect(methods[1].source).toBe('mapper')
    expect(methods[1].methodName).toBe('selectById')
  })

  it('空发现结果 → 空数组', () => {
    const discover: AgentDiscoverResult = {
      feignClients: [],
      mappers: [],
      status: 'disconnected',
      version: '',
    }
    expect(flattenDiscoveredMethods(discover)).toEqual([])
  })
})

// ==================== createMockRuleFromDiscovery ====================

describe('createMockRuleFromDiscovery', () => {
  it('从发现信息生成规则，自动推断 targetType 和 responseTemplate', () => {
    const rule = createMockRuleFromDiscovery(
      'com.example.feign.OrderClient',
      'createOrder',
      ['com.example.dto.CreateOrderReq'],
      'com.example.Result<OrderVO>',
    )
    expect(rule.enabled).toBe(true)
    expect(rule.targetType).toBe('feign')
    expect(rule.className).toBe('com.example.feign.OrderClient')
    expect(rule.methodName).toBe('createOrder')
    expect(rule.paramTypes).toEqual(['com.example.dto.CreateOrderReq'])
    expect(rule.responseClassName).toBe('com.example.Result<OrderVO>')
    // Result 类型应生成 { code: 200, ... }
    expect((rule.responseTemplate as Record<string, unknown>).code).toBe(200)
    expect(rule.id).toBeTruthy()
  })
})

// ==================== buildAgentPushPayload ====================

describe('buildAgentPushPayload', () => {
  it('完整流程：插值 + 序列化', () => {
    const nodeRules = [
      createEmptyMockRule({
        className: 'com.example.feign.UserClient',
        methodName: 'getUser',
        responseTemplate: { name: '{{userName}}', role: 'admin' },
      }),
      createEmptyMockRule({
        className: 'com.example.feign.OrderClient',
        methodName: 'createOrder',
        responseTemplate: { orderId: '{{orderId}}', status: 'created' },
      }),
    ]

    const variables = { userName: '张三', orderId: 'ORD_001' }
    const payload = buildAgentPushPayload(nodeRules, variables)

    expect(payload).toHaveLength(2)

    const userPayload = payload.find(p => p.className.includes('UserClient'))!
    const parsed = JSON.parse(userPayload.responseTemplate)
    expect(parsed.name).toBe('张三')
    expect(parsed.role).toBe('admin')

    const orderPayload = payload.find(p => p.className.includes('OrderClient'))!
    const parsedOrder = JSON.parse(orderPayload.responseTemplate)
    expect(parsedOrder.orderId).toBe('ORD_001')
  })

  it('空规则返回空 payload', () => {
    expect(buildAgentPushPayload([], {})).toEqual([])
    expect(buildAgentPushPayload(undefined, {})).toEqual([])
  })

  it('过滤禁用规则', () => {
    const rules = [
      createEmptyMockRule({ enabled: true, className: 'com.example.A', methodName: 'foo' }),
      createEmptyMockRule({ enabled: false, className: 'com.example.B', methodName: 'bar' }),
    ]
    const payload = buildAgentPushPayload(rules, {})
    expect(payload).toHaveLength(1)
    expect(payload[0].className).toBe('com.example.A')
  })
})

