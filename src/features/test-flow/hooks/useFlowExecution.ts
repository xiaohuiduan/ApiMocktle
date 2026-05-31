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

export interface FlowExecState {
  status: 'idle' | 'running' | 'passed' | 'failed' | 'aborted'
  nodeStatuses: Record<string, NodeExecStatus>
  nodeErrors: Record<string, string>
  nodeDurations: Record<string, number>
  nodeRequests: Record<string, Record<string, unknown>>
  nodeResponses: Record<string, Record<string, unknown>>
  logs: FlowExecLog[]
  variables: Record<string, string>
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
    let nodeStatuses: Record<string, NodeExecStatus> = {}
    let nodeErrors: Record<string, string> = {}
    let nodeDurations: Record<string, number> = {}
    let nodeRequests: Record<string, Record<string, unknown>> = {}
    let nodeResponses: Record<string, Record<string, unknown>> = {}
    let logs: FlowExecLog[] = []
    const startTime = Date.now()

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
        logs: addLog(logs, '', '', NT.Start, 'error', '未找到 Start 节点'),
        variables,
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
              if (a.operator === '=') variables[a.variable] = val
              else if (a.operator === '+=') variables[a.variable] = (variables[a.variable] || '') + val
              else if (a.operator === '-=') variables[a.variable] = (variables[a.variable] || '').replace(val, '')
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
              variables['__last_status__'] = '0'
              variables['__last_error__'] = result.error || '未知错误'
              return { handleId: 'out' }
            }

            const resp = result.data.response
            const status = resp.status
            variables['__last_status__'] = String(status)
            variables['__last_duration__'] = String(resp.responseTime)

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
                    set: (k: string, v: string) => { variables[k] = String(v) },
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
                  Object.assign(variables, extResult.data.variables)
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
                const expected = a.assertion?.expected
                const actual = a.actual
                if (expected !== undefined && expected !== null) {
                  return `预期: ${JSON.stringify(expected)}, 实际: ${JSON.stringify(actual)}`
                }
                return a.error || `实际值: ${JSON.stringify(actual)}`
              }).join('; ')
              nodeErrors[nodeId] = `断言失败: ${details}`
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
            // 独立断言节点 - 使用 __last_status__ 和 __last_response__
            const dur = Date.now() - startMs
            logs = addLog(logs, nodeId, nodeName, nodeType, 'passed', '断言通过', { durationMs: dur })
            nodeStatuses = setNodeStatus(nodeStatuses, nodeId, 'passed')
            return { handleId: 'out' }
          }

          case NT.Parallel: {
            const branchCount = (nodeData.branchCount as number) || 2
            logs = addLog(logs, nodeId, nodeName, nodeType, 'running', `并行执行 ${branchCount} 个分支`)
            updateState({})

            const branchPromises: Promise<void>[] = []
            for (let i = 0; i < branchCount; i++) {
              const branchNodes = getNextNodes(nodeId, `branch-${i}`)
              branchPromises.push((async () => {
                for (const bNode of branchNodes) {
                  await executeNode(bNode)
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
          for (const n of nodes) {
            if (nodeStatuses[n.id] === 'idle') {
              nodeStatuses = setNodeStatus(nodeStatuses, n.id, 'skipped')
              logs = addLog(logs, n.id, (n.data as Record<string, unknown>)?.label as string || n.id, n.type as FlowNodeType, 'skipped', '因前置节点失败而跳过')
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
      currentNodeId: null,
    })
  }, [])

  return { state, executeFlow, abort, reset }
}
