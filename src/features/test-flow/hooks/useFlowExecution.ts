import { useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { FlowNode, FlowEdge, FlowNodeType, NodeExecStatus } from '../types/flow.types'
import { FlowNodeType as NT } from '../types/flow.types'

// ==================== 类型 ====================

export interface FlowExecLog {
  nodeId: string
  nodeName: string
  nodeType: FlowNodeType
  status: NodeExecStatus
  message: string
  timestamp: number
  durationMs?: number
  requestJson?: Record<string, unknown>
  responseJson?: Record<string, unknown>
  variables?: Record<string, string>
}

export interface VariableSource {
  value: string
  source: string
  sourceType: 'init' | 'setVariable' | 'postScript' | 'extractor' | 'loop' | 'system'
  nodeId?: string
  nodeName?: string
  timestamp: number
}

export interface FlowExecState {
  status: 'idle' | 'running' | 'passed' | 'failed' | 'aborted'
  nodeStatuses: Record<string, NodeExecStatus>
  nodeErrors: Record<string, string>
  nodeDurations: Record<string, number>
  nodeRequests: Record<string, Record<string, unknown>>
  nodeResponses: Record<string, Record<string, unknown>>
  logs: FlowExecLog[]
  variables: Record<string, string>
  variableSources: Record<string, VariableSource>
  currentNodeId: string | null
  startTime?: number
  endTime?: number
}

interface RunFlowNodeRequestResult {
  request: Record<string, unknown>
  response: {
    status: number
    headers: Record<string, string>
    body: string
    responseTime: number
  }
}

// ==================== Hook ====================

export function useFlowExecution() {
  const [state, setState] = useState<FlowExecState>({
    status: 'idle',
    nodeStatuses: {},
    nodeErrors: {},
    nodeDurations: {},
    nodeRequests: {},
    nodeResponses: {},
    logs: [],
    variables: {},
    variableSources: {},
    currentNodeId: null,
  })
  const abortRef = useRef(false)

  const addLog = useCallback((
    logs: FlowExecLog[],
    nodeId: string,
    nodeName: string,
    nodeType: FlowNodeType,
    status: NodeExecStatus,
    message: string,
    extra?: Partial<FlowExecLog>,
  ): FlowExecLog[] => {
    return [...logs, {
      nodeId,
      nodeName,
      nodeType,
      status,
      message,
      timestamp: Date.now(),
      ...extra,
    }]
  }, [])

  const setNodeStatus = useCallback((
    statuses: Record<string, NodeExecStatus>,
    nodeId: string,
    status: NodeExecStatus,
  ): Record<string, NodeExecStatus> => {
    return { ...statuses, [nodeId]: status }
  }, [])

  const executeFlow = useCallback(async (
    nodes: FlowNode[],
    edges: FlowEdge[],
    projectId: string,
    baseUrl?: string,
    initialVariables?: Record<string, string>,
    failFast?: boolean,
    onStateChange?: (state: FlowExecState) => void,
  ) => {
    abortRef.current = false
    const variables: Record<string, string> = { ...(initialVariables || {}) }
    const variableSources: Record<string, VariableSource> = {}
    let nodeStatuses: Record<string, NodeExecStatus> = {}
    let nodeErrors: Record<string, string> = {}
    let nodeDurations: Record<string, number> = {}
    let nodeRequests: Record<string, Record<string, unknown>> = {}
    let nodeResponses: Record<string, Record<string, unknown>> = {}
    let logs: FlowExecLog[] = []
    const startTime = Date.now()

    // 记录初始变量来源
    if (initialVariables) {
      for (const [k, v] of Object.entries(initialVariables)) {
        variableSources[k] = { value: v, source: '环境变量', sourceType: 'init', timestamp: Date.now() }
      }
    }

    // 记录变量来源的辅助函数
    const recordVar = (key: string, value: string, source: string, sourceType: VariableSource['sourceType'], nodeId?: string, nodeName?: string) => {
      variables[key] = value
      variableSources[key] = { value, source, sourceType, nodeId, nodeName, timestamp: Date.now() }
    }

    // 初始化所有节点为 idle
    for (const node of nodes) {
      nodeStatuses[node.id] = 'idle'
    }

    const updateState = (partial: Partial<FlowExecState>) => {
      const newState: FlowExecState = {
        status: 'running',
        nodeStatuses: { ...nodeStatuses },
        nodeErrors: { ...nodeErrors },
        nodeDurations: { ...nodeDurations },
        nodeRequests: { ...nodeRequests },
        nodeResponses: { ...nodeResponses },
        logs: [...logs],
        variables: { ...variables },
        variableSources: { ...variableSources },
        currentNodeId: null,
        startTime,
        ...partial,
      }
      setState(newState)
      onStateChange?.(newState)
    }

    updateState({})

    // 查找 start 节点
    const startNode = nodes.find((n) => n.type === NT.Start)
    if (!startNode) {
      const finalState: FlowExecState = {
        status: 'failed',
        nodeStatuses,
        nodeErrors,
        nodeDurations,
        nodeRequests,
        nodeResponses,
        logs: addLog(logs, '', '', NT.Start, 'error', '未找到 Start 节点'),
        variables,
        variableSources,
        currentNodeId: null,
        startTime,
        endTime: Date.now(),
      }
      setState(finalState)
      return finalState
    }

    // 获取节点的后继节点
    const getNextNodes = (nodeId: string, handleId?: string): FlowNode[] => {
      return edges
        .filter((e) => e.source === nodeId && (!handleId || e.sourceHandle === handleId))
        .map((e) => nodes.find((n) => n.id === e.target))
        .filter((n): n is FlowNode => n !== undefined)
    }

    // 变量替换
    const interpolate = (str: string): string => {
      return str.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`)
    }

    const interpolateObj = (obj: Record<string, unknown>): Record<string, unknown> => {
      const result: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') result[k] = interpolate(v)
        else if (Array.isArray(v)) {
          result[k] = v.map((item) => {
            if (typeof item === 'string') return interpolate(item)
            if (item && typeof item === 'object') return interpolateObj(item as Record<string, unknown>)
            return item
          })
        }
        else if (v && typeof v === 'object') result[k] = interpolateObj(v as Record<string, unknown>)
        else result[k] = v
      }
      return result
    }

    // 执行单个节点
    const executeNode = async (node: FlowNode): Promise<{ handleId?: string; error?: boolean }> => {
      if (abortRef.current) return { error: true }

      const nodeId = node.id
      const nodeData = node.data as Record<string, unknown>
      const nodeName = (nodeData.label as string) || node.id
      const nodeType = node.type as FlowNodeType

      nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'running')
      updateState({ currentNodeId: nodeId })

      const startMs = Date.now()

      try {
        switch (nodeType) {
          case NT.Start: {
            logs = addLog(logs, nodeId, nodeName, nodeType, 'passed', '流程开始')
            nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'passed')
            return { handleId: 'out' }
          }

          case NT.End: {
            logs = addLog(logs, nodeId, nodeName, nodeType, 'passed', '流程结束')
            nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'passed')
            return {}
          }

          case NT.SetVariable: {
            const assignments = nodeData.assignments as Array<{ variable: string; operator: string; value: string }> || []
            for (const a of assignments) {
              const val = interpolate(a.value)
              let newVal: string
              if (a.operator === '=') newVal = val
              else if (a.operator === '+=') newVal = (variables[a.variable] || '') + val
              else if (a.operator === '-=') newVal = (variables[a.variable] || '').replace(val, '')
              else continue
              recordVar(a.variable, newVal, `赋值: ${a.operator} ${a.value}`, 'setVariable', nodeId, nodeName)
            }
            const dur = Date.now() - startMs
            logs = addLog(logs, nodeId, nodeName, nodeType, 'passed',
              `设置变量: ${assignments.map((a) => `${a.variable}=${a.value}`).join(', ')}`,
              { durationMs: dur, variables: { ...variables } })
            nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'passed')
            return { handleId: 'out' }
          }

          case NT.Wait: {
            const waitType = nodeData.waitType as string
            let waitMs = 1000
            if (waitType === 'fixed') waitMs = (nodeData.durationMs as number) || 1000
            else if (waitType === 'variable') {
              const varName = nodeData.durationVariable as string
              waitMs = parseInt(variables[varName] || '1000', 10)
            }
            logs = addLog(logs, nodeId, nodeName, nodeType, 'running', `等待 ${waitMs}ms...`)
            updateState({})
            await new Promise((r) => setTimeout(r, waitMs))
            const dur = Date.now() - startMs
            logs = addLog(logs, nodeId, nodeName, nodeType, 'passed', `等待完成 (${waitMs}ms)`, { durationMs: dur })
            nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'passed')
            return { handleId: 'out' }
          }

          case NT.HttpRequest: {
            const menuItemId = nodeData.menuItemId as string
            if (!menuItemId) {
              const errMsg = '缺少 menuItemId'
              logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg)
              nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
              nodeErrors[nodeId] = errMsg
              return { error: true }
            }

            // 处理 requestOverride 中的变量替换
            let override = nodeData.requestOverride as Record<string, unknown> | undefined
            if (override) override = interpolateObj(override)

            // 检查是否有 base_url（相对路径需要）
            if (!baseUrl) {
              // 检查节点数据中的 path 是否是绝对 URL
              // 如果没有 base_url 且 API 路径是相对的，给出提示
              const warnMsg = '未选择运行环境，相对路径可能无法解析。请在运行弹窗中选择一个包含 Base URL 的环境。'
              logs = addLog(logs, nodeId, nodeName, nodeType, 'running', warnMsg)
              updateState({})
            }

            logs = addLog(logs, nodeId, nodeName, nodeType, 'running', `发送请求...`)
            updateState({})

            const result = await invoke<{ ok: boolean; data?: RunFlowNodeRequestResult; error?: string }>(
              'execute_flow_node_request',
              {
                projectId,
                menuItemId,
                requestOverride: override || null,
                variables,
                baseUrl: baseUrl || null,
              },
            )

            const dur = Date.now() - startMs

            if (!result.ok || !result.data) {
              const errMsg = result.error?.includes('builder error')
                ? `请求 URL 无效（需要完整的绝对路径或选择包含 Base URL 的环境）`
                : `HTTP 请求失败: ${result.error || '未知错误'}`
              logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg, { durationMs: dur })
              nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
              nodeErrors[nodeId] = errMsg
              nodeDurations[nodeId] = dur
              recordVar('__last_status__', '0', '请求失败', 'system', nodeId, nodeName)
              recordVar('__last_error__', result.error || '未知错误', '请求失败', 'system', nodeId, nodeName)
              return { handleId: 'out' }
            }

            const resp = result.data.response
            const status = resp.status
            recordVar('__last_status__', String(status), `HTTP ${status}`, 'system', nodeId, nodeName)
            recordVar('__last_duration__', String(resp.responseTime), `响应时间`, 'system', nodeId, nodeName)

            // 存储请求/响应用于节点详情展示
            nodeRequests[nodeId] = result.data.request as Record<string, unknown>
            nodeResponses[nodeId] = {
              status,
              headers: resp.headers,
              body: resp.body.substring(0, 5000),
              duration_ms: resp.responseTime,
            }

            // 运行 postScript
            const postScript = nodeData.postScript as string | undefined
            if (postScript) {
              try {
                const pmContext = {
                  response: {
                    json: () => { try { return JSON.parse(resp.body) } catch { return {} } },
                    status,
                    headers: resp.headers,
                    body: resp.body,
                  },
                  variables: {
                    set: (k: string, v: string) => {
                      recordVar(k, String(v), `postScript`, 'postScript', nodeId, nodeName)
                    },
                    get: (k: string) => variables[k],
                  },
                }
                const fn = new Function('pm', postScript)
                fn(pmContext)
              } catch (err) {
                logs = addLog(logs, nodeId, nodeName, nodeType, 'error',
                  `postScript 执行失败: ${err}`, { durationMs: dur })
              }
            }

            // 运行 extractors
            const extractors = nodeData.extractors as Array<Record<string, unknown>> | undefined
            if (extractors && extractors.length > 0) {
              try {
                const extResult = await invoke<{ ok: boolean; data?: { results: unknown[]; variables: Record<string, string> } }>(
                  'execute_extractors',
                  {
                    extractors: extractors.map((e) => ({
                      type: e.type,
                      path: e.path || null,
                      name: e.name || null,
                      pattern: e.pattern || null,
                      variable: e.variable,
                    })),
                    responseBody: resp.body,
                    statusCode: resp.status,
                    responseHeaders: resp.headers,
                  },
                )
                if (extResult.ok && extResult.data) {
                  const extractedVars = extResult.data.variables
                  // 记录所有提取器的结果（包括未匹配的）
                  for (const ext of extractors) {
                    const varName = ext.variable as string
                    const extType = (ext.type as string) || 'unknown'
                    if (extractedVars[varName] !== undefined) {
                      recordVar(varName, extractedVars[varName], `提取器 (${extType})`, 'extractor', nodeId, nodeName)
                    } else {
                      // 提取失败，记录空值
                      recordVar(varName, '', `提取器 (${extType}) - 未匹配`, 'extractor', nodeId, nodeName)
                    }
                  }
                }
              } catch { /* ignore extractor errors */ }
            }

            // 运行 assertions
            const assertions = nodeData.assertions as Array<Record<string, unknown>> | undefined
            let assertionResults: Array<{ passed: boolean; error?: string; actual?: unknown; assertion?: Record<string, unknown> }> = []
            if (assertions && assertions.length > 0) {
              try {
                const assertResult = await invoke<{ ok: boolean; data?: Array<{ passed: boolean; error?: string; actual?: unknown; assertion?: Record<string, unknown> }>; error?: string }>(
                  'execute_assertions',
                  {
                    assertions: assertions.map((a) => ({
                      type: a.type,
                      path: a.path || null,
                      name: a.name || null,
                      operator: a.operator,
                      // status 断言的 expected 必须是数字，response_time 类似
                      expected: a.type === 'status' || a.type === 'response_time'
                        ? (a.expected != null ? Number(a.expected) : null)
                        : (a.expected ?? null),
                    })),
                    responseBody: resp.body,
                    statusCode: resp.status,
                    responseHeaders: resp.headers,
                    durationMs: resp.responseTime,
                  },
                )
                if (assertResult.ok && assertResult.data) {
                  assertionResults = assertResult.data
                } else if (!assertResult.ok) {
                  // 断言命令本身执行失败，记录错误
                  assertionResults = assertions.map((a) => ({
                    passed: false,
                    error: `断言执行失败: ${assertResult.error || '未知错误'}`,
                  }))
                }
              } catch (err) {
                // catch 也不应静默吞掉，标记为失败
                assertionResults = assertions.map(() => ({
                  passed: false,
                  error: `断言调用异常: ${err}`,
                }))
              }
            }

            const allAssertsPassed = assertionResults.length === 0 || assertionResults.every((a) => a.passed)
            const nodeStatus: NodeExecStatus = allAssertsPassed ? 'passed' : 'failed'

            const statusMsg = allAssertsPassed
              ? `HTTP ${status} (${resp.responseTime}ms)`
              : `HTTP ${status} - 断言失败 (${assertionResults.filter((a) => !a.passed).length}/${assertionResults.length})`

            // 存储错误信息到节点
            if (!allAssertsPassed) {
              const failedAsserts = assertionResults.filter((a) => !a.passed)
              const details = failedAsserts.map((a) => {
                const atn = a.assertion as Record<string, unknown> | undefined
                const atype = (atn?.type as string) || '未知'
                const path = atn?.path as string | undefined
                const name = atn?.name as string | undefined
                const op = (atn?.operator as string) || '?'
                const expected = atn?.expected
                const actual = a.actual

                // 构建标识：json_path:data.username / header:Content-Type / status
                let target = atype
                if (atype === 'json_path' && path) target = `json_path:${path}`
                else if (atype === 'header' && name) target = `header:${name}`

                // 构建详情
                const expStr = expected !== undefined && expected !== null ? JSON.stringify(expected) : undefined
                const actStr = actual !== undefined ? JSON.stringify(actual) : 'undefined'
                if (expStr) {
                  return `${target} ${op} 失败: 期望 ${expStr}, 实际 ${actStr}`
                }
                return `${target} ${op} 失败: ${a.error || `实际 ${actStr}`}`
              }).join('\n')
              nodeErrors[nodeId] = details
            } else {
              delete nodeErrors[nodeId]
            }
            nodeDurations[nodeId] = resp.responseTime

            logs = addLog(logs, nodeId, nodeName, nodeType, nodeStatus, statusMsg, {
              durationMs: dur,
              requestJson: result.data.request as Record<string, unknown>,
              responseJson: { status, headers: resp.headers, body: resp.body.substring(0, 2000) } as Record<string, unknown>,
              variables: { ...variables },
            })
            nodeStatuses = setNodeStatus(nodeStatuses, nodeId, nodeStatus)
            // 断言失败时返回 error，让快速失败逻辑生效
            return allAssertsPassed ? { handleId: 'out' } : { error: true }
          }

          case NT.Condition: {
            const conditionType = nodeData.conditionType as string
            const expression = nodeData.expression as string | undefined
            let result = false

            if (conditionType === 'status_code') {
              const lastStatus = variables['__last_status__'] || '0'
              result = lastStatus === (expression || '200')
            } else if (conditionType === 'expression' && expression) {
              try {
                const fn = new Function('variables', `return !!(${expression})`)
                result = fn(variables)
              } catch {
                result = false
              }
            } else if (conditionType === 'variable_check') {
              const vn = nodeData.variableName as string
              const op = nodeData.operator as string
              const cv = nodeData.compareValue as string
              const val = variables[vn]
              if (op === 'exists') result = val !== undefined
              else if (op === 'equals') result = val === cv
              else if (op === 'not_equals') result = val !== cv
              else if (op === 'contains') result = (val || '').includes(cv || '')
              else if (op === 'greater_than') result = val !== undefined && Number(val) > Number(cv)
              else if (op === 'less_than') result = val !== undefined && Number(val) < Number(cv)
            }

            const handleId = result ? 'true' : 'false'
            const dur = Date.now() - startMs
            logs = addLog(logs, nodeId, nodeName, nodeType, 'passed',
              `条件 ${result ? '满足' : '不满足'} → ${handleId}`, { durationMs: dur })
            nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'passed')
            return { handleId }
          }

          case NT.Loop: {
            // 简单实现：根据 loopType 确定循环次数
            const loopType = nodeData.loopType as string
            const count = loopType === 'count' ? (Number(nodeData.count) || 3) : 3
            const maxIter = (nodeData.maxIterations as number) || 100
            const actualCount = Math.min(count, maxIter)

            logs = addLog(logs, nodeId, nodeName, nodeType, 'running', `循环 ${actualCount} 次`)
            updateState({})

            // 执行循环体
            for (let i = 0; i < actualCount; i++) {
              if (abortRef.current) break
              variables['__loop_index__'] = String(i)
              variableSources['__loop_index__'] = { value: String(i), source: `循环索引 #${i}`, sourceType: 'loop', nodeId, nodeName, timestamp: Date.now() }
              logs = addLog(logs, nodeId, nodeName, nodeType, 'running', `循环 #${i + 1}/${actualCount}`)
              updateState({})

              // 执行循环体节点
              const loopBodyNodes = getNextNodes(nodeId, 'loop')
              for (const bodyNode of loopBodyNodes) {
                const bodyResult = await executeNode(bodyNode)
                if (bodyResult.error) break
              }
            }

            const dur = Date.now() - startMs
            logs = addLog(logs, nodeId, nodeName, nodeType, 'passed', `循环完成 (${actualCount} 次)`, { durationMs: dur })
            nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'passed')
            return { handleId: 'out' }
          }

          case NT.Assert: {
            const dur = Date.now() - startMs
            const script = nodeData.script as string | undefined
            const failures: string[] = []

            // 1. 执行变量断言规则
            const varAssertions = nodeData.assertions as Array<{ variable?: string; operator?: string; expected?: string }> | undefined
            if (varAssertions && varAssertions.length > 0) {
              for (const rule of varAssertions) {
                if (!rule.variable || !rule.operator) continue
                const actual = variables[rule.variable]
                const expected = rule.expected
                const label = `${rule.variable} ${rule.operator}${expected ? ` ${expected}` : ''}`

                switch (rule.operator) {
                  case 'exists':
                    if (actual === undefined) failures.push(`${label}: 变量不存在`)
                    break
                  case 'not_exists':
                    if (actual !== undefined) failures.push(`${label}: 变量不应存在`)
                    break
                  case 'equals':
                    if (actual !== expected) failures.push(`${label}: 实际值 "${actual}"`)
                    break
                  case 'not_equals':
                    if (actual === expected) failures.push(`${label}: 不应等于`)
                    break
                  case 'contains':
                    if (!actual || !String(actual).includes(expected || '')) failures.push(`${label}: 不包含`)
                    break
                  case 'not_contains':
                    if (actual && String(actual).includes(expected || '')) failures.push(`${label}: 不应包含`)
                    break
                  case 'greater_than':
                    if (actual === undefined || Number(actual) <= Number(expected)) failures.push(`${label}: 实际值 ${actual}`)
                    break
                  case 'less_than':
                    if (actual === undefined || Number(actual) >= Number(expected)) failures.push(`${label}: 实际值 ${actual}`)
                    break
                }
              }
            }

            // 2. 执行脚本断言
            if (script && script.trim()) {
              try {
                const pm = {
                  test: (name: string, fn: () => void) => {
                    try { fn() } catch { failures.push(name) }
                  },
                  expect: (actual: unknown) => ({
                    toBe: (expected: unknown) => { if (actual !== expected) throw new Error(`expected ${expected}, got ${actual}`) },
                    toEqual: (expected: unknown) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`not equal`) },
                    toBeTruthy: () => { if (!actual) throw new Error(`expected truthy, got ${actual}`) },
                    toBeDefined: () => { if (actual === undefined) throw new Error('expected defined') },
                    toContain: (substr: string) => { if (typeof actual === 'string' && !actual.includes(substr)) throw new Error(`not contain ${substr}`) },
                    toBeGreaterThan: (n: number) => { if (typeof actual === 'number' && actual <= n) throw new Error(`${actual} <= ${n}`) },
                    toBeLessThan: (n: number) => { if (typeof actual === 'number' && actual >= n) throw new Error(`${actual} >= ${n}`) },
                  }),
                  variables: {
                    get: (k: string) => variables[k],
                    all: () => ({ ...variables }),
                  },
                }
                const fn = new Function('pm', 'variables', script)
                fn(pm, { ...variables })
              } catch (err) {
                failures.push(`脚本执行异常: ${err}`)
              }
            }

            const allPassed = failures.length === 0
            const status: NodeExecStatus = allPassed ? 'passed' : 'failed'
            const msg = allPassed ? '断言通过' : `断言失败: ${failures.join('; ')}`

            if (!allPassed) nodeErrors[nodeId] = msg
            nodeDurations[nodeId] = dur
            logs = addLog(logs, nodeId, nodeName, nodeType, status, msg, { durationMs: dur, variables: { ...variables } })
            nodeStatuses = setNodeStatus(nodeStatuses, nodeId, status)
            return allPassed ? { handleId: 'out' } : { error: true }
          }

          case NT.Parallel: {
            const branchCount = (nodeData.branchCount as number) || 2
            logs = addLog(logs, nodeId, nodeName, nodeType, 'running', `并行执行 ${branchCount} 个分支`)
            updateState({})

            const branchPromises: Promise<void>[] = []
            for (let i = 0; i < branchCount; i++) {
              const branchIdx = i
              const firstNodes = getNextNodes(nodeId, `branch-${i}`)
              branchPromises.push((async () => {
                // 从分支入口开始，沿 out 逐个执行整条链
                let current = firstNodes[0]
                while (current) {
                  const branchResult = await executeNode(current)
                  if (branchResult.error) {
                    // 标记后续节点为 skipped
                    const nextNodes = getNextNodes(current.id, branchResult.handleId || 'out')
                    const failedName = (current.data as Record<string, unknown>)?.label as string || current.id
                    const failedErr = nodeErrors[current.id] || '未知原因'
                    const reason = `分支${branchIdx + 1}内「${failedName}」失败，后续跳过（${failedErr.substring(0, 60)}）`
                    for (const nn of nextNodes) {
                      if (nodeStatuses[nn.id] === 'idle') {
                        nodeStatuses = setNodeStatus(nodeStatuses, nn.id, 'skipped')
                        nodeErrors[nn.id] = reason
                        logs = addLog(logs, nn.id, (nn.data as Record<string, unknown>)?.label as string || nn.id, nn.type as FlowNodeType, 'skipped', reason)
                      }
                    }
                    break
                  }
                  // 查找分支内的下一个节点
                  const next = getNextNodes(current.id, branchResult.handleId)
                  current = next[0]
                }
              })())
            }

            const waitAll = nodeData.waitAll !== false
            if (waitAll) {
              await Promise.all(branchPromises)
            } else {
              await Promise.race(branchPromises)
            }

            const dur = Date.now() - startMs
            logs = addLog(logs, nodeId, nodeName, nodeType, 'passed', '并行执行完成', { durationMs: dur })
            nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'passed')
            return { handleId: 'out' }
          }

          default: {
            logs = addLog(logs, nodeId, nodeName, nodeType, 'passed', `跳过 (${nodeType})`)
            nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'passed')
            return { handleId: 'out' }
          }
        }
      } catch (err) {
        const dur = Date.now() - startMs
        const errMsg = `异常: ${err}`
        logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg, { durationMs: dur })
        nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
        nodeErrors[nodeId] = errMsg
        nodeDurations[nodeId] = dur
        return { error: true }
      }
    }

    // 从 start 节点开始遍历
    let currentNode: FlowNode | undefined = startNode
    while (currentNode && !abortRef.current) {
      const result = await executeNode(currentNode)
      updateState({ currentNodeId: currentNode.id })

      if (result.error || !result.handleId) {
        // 快速失败：标记后续所有未执行节点为 skipped
        if (failFast && result.error) {
          const failedId = currentNode.id
          const failedName = (currentNode.data as Record<string, unknown>)?.label as string || failedId
          const failedErr = nodeErrors[failedId] || '未知原因'
          const reason = `因「${failedName}」失败而跳过（${failedErr.substring(0, 80)}）`
          for (const n of nodes) {
            if (nodeStatuses[n.id] === 'idle') {
              nodeStatuses = setNodeStatus(nodeStatuses, n.id, 'skipped')
              nodeErrors[n.id] = reason
              logs = addLog(logs, n.id, (n.data as Record<string, unknown>)?.label as string || n.id, n.type as FlowNodeType, 'skipped', reason)
            }
          }
        }
        break
      }

      const nextNodes = getNextNodes(currentNode.id, result.handleId)
      if (nextNodes.length === 0) break
      currentNode = nextNodes[0] // 简单取第一个后继
    }

    const endTime = Date.now()
    const hasFailed = Object.values(nodeStatuses).some((s) => s === 'failed' || s === 'error')
    const finalStatus = abortRef.current ? 'aborted' : hasFailed ? 'failed' : 'passed'

    const finalState: FlowExecState = {
      status: finalStatus,
      nodeStatuses,
      nodeErrors,
      nodeDurations,
      nodeRequests,
      nodeResponses,
      logs,
      variables: { ...variables },
      variableSources: { ...variableSources },
      currentNodeId: null,
      startTime,
      endTime,
    }
    setState(finalState)
    return finalState
  }, [addLog, setNodeStatus])

  const abort = useCallback(() => {
    abortRef.current = true
    setState((prev) => ({ ...prev, status: 'aborted' }))
  }, [])

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      nodeStatuses: {},
      nodeErrors: {},
      nodeDurations: {},
      nodeRequests: {},
      nodeResponses: {},
      logs: [],
      variables: {},
      variableSources: {},
      currentNodeId: null,
    })
  }, [])

  return { state, executeFlow, abort, reset }
}
