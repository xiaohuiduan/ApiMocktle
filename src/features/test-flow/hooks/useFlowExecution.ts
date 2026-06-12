import { useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { FlowNode, FlowEdge, FlowNodeType, NodeExecStatus } from '../types/flow.types'
import { FlowNodeType as NT } from '../types/flow.types'
import type { MockRule, MockCallLog } from '../types/mock.types'
import { buildAgentPushPayload } from '../utils/mock-rule-utils'

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
  sourceType: 'init' | 'setVariable' | 'preScript' | 'postScript' | 'extractor' | 'loop' | 'system'
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
    agentUrl?: string,
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

    // 获取节点的后继节点（executeGraph 会临时替换为子流程的版本）
    let getNextNodes = (nodeId: string, handleId?: string): FlowNode[] => {
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
            if (waitType === 'condition') {
              const conditionExpr = nodeData.conditionExpression as string
              const pollInterval = (nodeData.pollIntervalMs as number) || 1000
              const maxWait = (nodeData.maxWaitMs as number) || 30000
              const waitStart = Date.now()

              if (!conditionExpr) {
                const errMsg = '条件等待缺少表达式'
                logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg)
                nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
                nodeErrors[nodeId] = errMsg
                return { error: true }
              }

              logs = addLog(logs, nodeId, nodeName, nodeType, 'running', `条件等待: 轮询 ${pollInterval}ms, 超时 ${maxWait}ms`)
              updateState({})

              let conditionMet = false
              while (!conditionMet && !abortRef.current) {
                const elapsed = Date.now() - waitStart
                if (elapsed >= maxWait) {
                  const errMsg = `条件等待超时 (${maxWait}ms)`
                  const dur = Date.now() - startMs
                  logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg, { durationMs: dur })
                  nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
                  nodeErrors[nodeId] = errMsg
                  nodeDurations[nodeId] = dur
                  return { error: true }
                }

                try {
                  const fn = new Function('variables', `return !!(${conditionExpr})`)
                  conditionMet = fn(variables)
                } catch (err) {
                  const errMsg = `条件表达式求值失败: ${err}`
                  const dur = Date.now() - startMs
                  logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg, { durationMs: dur })
                  nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
                  nodeErrors[nodeId] = errMsg
                  nodeDurations[nodeId] = dur
                  return { error: true }
                }

                if (!conditionMet) {
                  await new Promise((r) => setTimeout(r, pollInterval))
                }
              }

              if (!conditionMet) {
                // 被中止（abortRef）
                const dur = Date.now() - startMs
                logs = addLog(logs, nodeId, nodeName, nodeType, 'skipped', `条件等待被中止`, { durationMs: dur })
                nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'skipped')
                nodeDurations[nodeId] = dur
                return { error: true }
              }

              const dur = Date.now() - startMs
              logs = addLog(logs, nodeId, nodeName, nodeType, 'passed', `条件满足 (${dur}ms)`, { durationMs: dur })
              nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'passed')
              return { handleId: 'out' }
            }

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

            // 运行 preScript（请求发送前）
            const preScript = nodeData.preScript as string | undefined
            if (preScript) {
              try {
                // preScript 可以直接修改 override（生效于后续请求），也可以通过 variables.set 写变量
                const requestProxy = override || {}
                const prePmContext = {
                  request: requestProxy,
                  variables: {
                    set: (k: string, v: string) => {
                      recordVar(k, String(v), 'preScript', 'preScript', nodeId, nodeName)
                    },
                    get: (k: string) => variables[k],
                  },
                }
                const fn = new Function('pm', preScript)
                fn(prePmContext)
                // 将 preScript 修改后的 requestProxy 赋回 override
                if (!override && Object.keys(requestProxy).length > 0) {
                  override = requestProxy
                }
              } catch (err) {
                logs = addLog(logs, nodeId, nodeName, nodeType, 'error',
                  `preScript 执行失败: ${err}`)
              }
            }

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

            // 推送 Mock 规则到 Agent（仅节点级别规则）
            const nodeMockRules = nodeData.mockRules as MockRule[] | undefined
            if (agentUrl && nodeMockRules && nodeMockRules.length > 0) {
              try {
                const payload = buildAgentPushPayload(nodeMockRules, variables)
                if (payload.length > 0) {
                  await invoke('push_mock_rules', { agentUrl, rules: payload })
                  logs = addLog(logs, nodeId, nodeName, nodeType, 'running',
                    `推送 ${payload.length} 条 Mock 规则到 Agent`)
                }
              } catch (err) {
                logs = addLog(logs, nodeId, nodeName, nodeType, 'running',
                  `Mock 规则推送失败（不影响请求）: ${err}`)
              }
            }

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
              body: resp.body,
              duration_ms: resp.responseTime,
            }

            // 拉取 Mock 调用日志
            let mockCallLogs: MockCallLog[] = []
            if (agentUrl) {
              try {
                const logsResult = await invoke<{ ok: boolean; data?: MockCallLog[] }>(
                  'get_mock_call_logs', { agentUrl }
                )
                if (logsResult.ok && logsResult.data) {
                  mockCallLogs = logsResult.data
                  if (mockCallLogs.length > 0) {
                    logs = addLog(logs, nodeId, nodeName, nodeType, 'running',
                      `捕获 ${mockCallLogs.length} 次 Mock 调用: ${mockCallLogs.map(l => `${l.className.split('.').pop()}.${l.methodName}`).join(', ')}`)
                  }
                }
              } catch { /* ignore */ }
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
            const loopType = nodeData.loopType as string
            const maxIter = (nodeData.maxIterations as number) || 100

            // 根据循环类型确定迭代
            let iterations: unknown[] = []
            if (loopType === 'while') {
              const whileExpr = nodeData.whileExpression as string
              if (!whileExpr) {
                const errMsg = 'while 循环缺少条件表达式'
                logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg)
                nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
                nodeErrors[nodeId] = errMsg
                return { error: true }
              }
              // while 循环的迭代次数在运行时确定，用占位数组
              iterations = new Array(maxIter).fill(null)
            } else if (loopType === 'for_each') {
              const collVar = nodeData.collectionVariable as string
              if (!collVar || variables[collVar] === undefined) {
                const errMsg = `for_each 循环: 变量 ${collVar || '(未设置)'} 不存在`
                logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg)
                nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
                nodeErrors[nodeId] = errMsg
                return { error: true }
              }
              try {
                const parsed = JSON.parse(variables[collVar])
                if (!Array.isArray(parsed)) throw new Error('变量值不是数组')
                iterations = parsed.slice(0, maxIter)
              } catch (err) {
                const errMsg = `for_each 循环: 解析变量 ${collVar} 失败 - ${err}`
                logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg)
                nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
                nodeErrors[nodeId] = errMsg
                return { error: true }
              }
            } else {
              // count 类型：支持 {{variable}} 插值
              let countVal = nodeData.count as number | string | undefined
              if (typeof countVal === 'string') countVal = Number(interpolate(countVal))
              const count = Number(countVal) || 3
              iterations = new Array(Math.min(count, maxIter)).fill(null)
            }

            const totalIter = iterations.length
            logs = addLog(logs, nodeId, nodeName, nodeType, 'running', `循环 ${loopType === 'while' ? '(while)' : totalIter} 次`)
            updateState({})

            let loopBroken = false
            const breakOnFailure = nodeData.breakOnFailure !== false // 默认 true
            for (let i = 0; i < iterations.length; i++) {
              if (abortRef.current) break

              // while 循环：每次迭代前检查条件
              if (loopType === 'while') {
                try {
                  const fn = new Function('variables', `return !!(${nodeData.whileExpression})`)
                  if (!fn(variables)) {
                    logs = addLog(logs, nodeId, nodeName, nodeType, 'running', `while 条件不满足，在第 ${i} 次迭代后退出`)
                    break
                  }
                } catch (err) {
                  const errMsg = `while 条件求值失败: ${err}`
                  logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg)
                  nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
                  nodeErrors[nodeId] = errMsg
                  loopBroken = true
                  break
                }
              }

              variables['__loop_index__'] = String(i)
              variableSources['__loop_index__'] = { value: String(i), source: `循环索引 #${i}`, sourceType: 'loop', nodeId, nodeName, timestamp: Date.now() }

              // for_each: 设置迭代变量
              if (loopType === 'for_each') {
                const iterVar = nodeData.iteratorVariable as string
                if (!iterVar) {
                  const errMsg = 'for_each 循环缺少迭代变量名 (iteratorVariable)'
                  logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg)
                  nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
                  nodeErrors[nodeId] = errMsg
                  return { error: true }
                }
                const item = iterations[i]
                const itemStr = typeof item === 'string' ? item : JSON.stringify(item)
                recordVar(iterVar, itemStr, `forEach #${i}`, 'loop', nodeId, nodeName)
              }

              logs = addLog(logs, nodeId, nodeName, nodeType, 'running', `循环 #${i + 1}${loopType === 'while' ? '' : '/' + totalIter}`)
              updateState({})

              const loopBodyNodes = getNextNodes(nodeId, 'loop')
              for (const bodyNode of loopBodyNodes) {
                const bodyResult = await executeNode(bodyNode)
                if (bodyResult.error) {
                  if (breakOnFailure) {
                    loopBroken = true
                    break
                  }
                  // 不中断：记录错误日志但继续下一次迭代
                  logs = addLog(logs, nodeId, nodeName, nodeType, 'running', `迭代 #${i + 1} 中有节点失败，继续执行`)
                }
              }
              if (loopBroken) break
            }

            const dur = Date.now() - startMs
            if (loopBroken) {
              // 循环因失败中断：如果还没有设置 error 状态（如循环体失败而非 while 条件失败），设置之
              if (nodeStatuses[nodeId] !== 'error') {
                logs = addLog(logs, nodeId, nodeName, nodeType, 'error', `循环因执行失败而中断`, { durationMs: dur })
                nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
              }
              return { error: true }
            }
            logs = addLog(logs, nodeId, nodeName, nodeType, 'passed', `循环完成 (${loopType})`, { durationMs: dur })
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
                    toContain: (substr: string) => {
                      const actualStr = typeof actual === 'string' ? actual : String(actual ?? '')
                      if (!actualStr.includes(substr)) throw new Error(`not contain ${substr}`)
                    },
                    toBeGreaterThan: (n: number) => {
                      const num = typeof actual === 'number' ? actual : Number(actual)
                      if (isNaN(num)) throw new Error(`expected number, got ${typeof actual} (${actual})`)
                      if (num <= n) throw new Error(`${num} <= ${n}`)
                    },
                    toBeLessThan: (n: number) => {
                      const num = typeof actual === 'number' ? actual : Number(actual)
                      if (isNaN(num)) throw new Error(`expected number, got ${typeof actual} (${actual})`)
                      if (num >= n) throw new Error(`${num} >= ${n}`)
                    },
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

          case NT.SubFlow: {
            const targetTaskId = nodeData.targetTaskId as string
            if (!targetTaskId) {
              const errMsg = '子流程节点缺少目标任务 ID'
              logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg)
              nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
              nodeErrors[nodeId] = errMsg
              return { error: true }
            }

            logs = addLog(logs, nodeId, nodeName, nodeType, 'running', `加载子流程 (${targetTaskId})...`)
            updateState({})

            // 加载子流程图
            let subFlowGraph: { nodes: FlowNode[]; edges: FlowEdge[] }
            try {
              const res = await invoke<{ ok: boolean; data?: string }>('load_test_flow_graph', { taskId: targetTaskId })
              if (!res.ok || !res.data) throw new Error('加载失败')
              subFlowGraph = JSON.parse(res.data)
            } catch (err) {
              const errMsg = `加载子流程失败: ${err}`
              logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg)
              nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
              nodeErrors[nodeId] = errMsg
              return { error: true }
            }

            // 准备子流程变量
            const passVars = nodeData.passVariables !== false
            const mergeVars = nodeData.mergeVariables !== false
            const preVarKeys = new Set(Object.keys(variables))

            const subResult = await executeGraph(
              subFlowGraph.nodes, subFlowGraph.edges,
              passVars ? { ...variables } : {},
            )

            // 恢复当前作用域的节点状态（executeGraph 内部 mutate 了闭包变量）
            for (const n of subFlowGraph.nodes) {
              delete nodeStatuses[n.id]
              delete nodeErrors[n.id]
              delete nodeDurations[n.id]
            }

            // 检查子流程失败
            const subFailed = Object.entries(subResult.nodeStatuses)
              .find(([, s]) => s === 'failed' || s === 'error')
            if (subFailed) {
              const [failId, failStatus] = subFailed
              const failErr = subResult.nodeErrors[failId] || '未知原因'
              const failNodeName = subResult.variables.__subflow_fail_name || failId
              const errMsg = `子流程失败: ${failNodeName} (${failStatus}) - ${failErr.substring(0, 100)}`
              logs = addLog(logs, nodeId, nodeName, nodeType, 'error', errMsg)
              nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'error')
              nodeErrors[nodeId] = errMsg
              return { error: true }
            }

            // 合并子流程变量
            if (mergeVars) {
              for (const [k, v] of Object.entries(subResult.variables)) {
                if (!preVarKeys.has(k) || variables[k] !== v) {
                  recordVar(k, v, '子流程', 'setVariable', nodeId, nodeName)
                }
              }
            }

            const dur = Date.now() - startMs
            logs = addLog(logs, nodeId, nodeName, nodeType, 'passed', `子流程完成`, { durationMs: dur })
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

    // 子流程执行辅助（复用 executeNode 闭包，独立变量作用域）
    interface ExecGraphResult {
      nodeStatuses: Record<string, NodeExecStatus>
      nodeErrors: Record<string, string>
      nodeDurations: Record<string, number>
      logs: FlowExecLog[]
      variables: Record<string, string>
      variableSources: Record<string, VariableSource>
    }

    const executeGraph = async (
      graphNodes: FlowNode[],
      graphEdges: FlowEdge[],
      initVars: Record<string, string>,
    ): Promise<ExecGraphResult> => {
      // 快照父作用域
      const savedVars = { ...variables }
      const savedSources = { ...variableSources }
      const savedStatuses = { ...nodeStatuses }
      const savedErrors = { ...nodeErrors }
      const savedDurations = { ...nodeDurations }
      const savedLogs = [...logs]

      // 初始化子流程变量
      Object.keys(variables).forEach(k => delete variables[k])
      Object.assign(variables, initVars)
      Object.keys(variableSources).forEach(k => delete variableSources[k])
      for (const n of graphNodes) nodeStatuses[n.id] = 'idle'
      logs = []

      // 子流程的后继节点查找
      const getSubNext = (nid: string, hid?: string): FlowNode[] =>
        graphEdges.filter((e) => e.source === nid && (!hid || e.sourceHandle === hid))
          .map((e) => graphNodes.find((n) => n.id === e.target))
          .filter((n): n is FlowNode => n !== undefined)

      // 临时替换 getNextNodes 为子流程版本
      const origGetNextNodes = getNextNodes
      getNextNodes = getSubNext

      // 遍历执行
      const subStart = graphNodes.find((n) => n.type === NT.Start)
      let subCurrent: FlowNode | undefined = subStart
      while (subCurrent && !abortRef.current) {
        const subResult = await executeNode(subCurrent)
        if (subResult.error || !subResult.handleId) break
        const nextNodes = getSubNext(subCurrent.id, subResult.handleId)
        subCurrent = nextNodes[0]
      }

      // 恢复 getNextNodes
      getNextNodes = origGetNextNodes

      // 收集子流程结果
      const resultStatuses: Record<string, NodeExecStatus> = {}
      const resultErrors: Record<string, string> = {}
      const resultDurations: Record<string, number> = {}
      for (const n of graphNodes) {
        resultStatuses[n.id] = nodeStatuses[n.id] || 'idle'
        if (nodeErrors[n.id]) resultErrors[n.id] = nodeErrors[n.id]
        if (nodeDurations[n.id]) resultDurations[n.id] = nodeDurations[n.id]
      }
      const resultVars = { ...variables }
      const resultSources = { ...variableSources }
      const resultLogs = [...logs]

      // 恢复父作用域
      Object.keys(variables).forEach(k => delete variables[k])
      Object.assign(variables, savedVars)
      Object.keys(variableSources).forEach(k => delete variableSources[k])
      Object.assign(variableSources, savedSources)
      Object.keys(nodeStatuses).forEach(k => delete nodeStatuses[k])
      Object.assign(nodeStatuses, savedStatuses)
      Object.keys(nodeErrors).forEach(k => delete nodeErrors[k])
      Object.assign(nodeErrors, savedErrors)
      Object.keys(nodeDurations).forEach(k => delete nodeDurations[k])
      Object.assign(nodeDurations, savedDurations)
      logs = savedLogs

      return {
        nodeStatuses: resultStatuses,
        nodeErrors: resultErrors,
        nodeDurations: resultDurations,
        logs: resultLogs,
        variables: resultVars,
        variableSources: resultSources,
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

    // 清除 Agent 上的 Mock 规则
    if (agentUrl) {
      try {
        await invoke('clear_mock_rules', { agentUrl })
      } catch { /* ignore */ }
    }

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
