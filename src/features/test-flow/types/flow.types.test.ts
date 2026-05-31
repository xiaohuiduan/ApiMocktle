import { describe, it, expect } from 'vitest'
import {
  FlowNodeType,
  type FlowNodeData,
  type BaseNodeData,
  type StartNodeData,
  type EndNodeData,
  type HttpRequestNodeData,
  type ConditionNodeData,
  type LoopNodeData,
  type ParallelNodeData,
  type WaitNodeData,
  type SubFlowNodeData,
  type SetVariableNodeData,
  type AssertNodeData,
  type FlowNode,
  type FlowEdge,
  type FlowGraph,
  type ExecutionStep,
  type ExecutionContext,
  type NodeResult,
  type NodeExecStatus,
  type NodeConfig,
  type ToolbarAction,
  type ValidationWarning,
} from './flow.types'

describe('FlowNodeType 枚举', () => {
  it('应该包含所有 10 种节点类型', () => {
    expect(FlowNodeType.Start).toBe('start')
    expect(FlowNodeType.End).toBe('end')
    expect(FlowNodeType.HttpRequest).toBe('httpRequest')
    expect(FlowNodeType.Condition).toBe('condition')
    expect(FlowNodeType.Loop).toBe('loop')
    expect(FlowNodeType.Parallel).toBe('parallel')
    expect(FlowNodeType.Wait).toBe('wait')
    expect(FlowNodeType.SubFlow).toBe('subFlow')
    expect(FlowNodeType.SetVariable).toBe('setVariable')
    expect(FlowNodeType.Assert).toBe('assert')
  })

  it('应该有 10 个枚举值', () => {
    const values = Object.values(FlowNodeType)
    expect(values).toHaveLength(10)
  })
})

describe('NodeExecStatus 类型', () => {
  it('应该支持所有执行状态', () => {
    const validStatuses: NodeExecStatus[] = [
      'idle',
      'running',
      'passed',
      'failed',
      'skipped',
      'error',
    ]
    expect(validStatuses).toHaveLength(6)
  })
})

describe('BaseNodeData 接口', () => {
  it('应该包含必需字段', () => {
    const baseData: BaseNodeData = {
      label: 'Test Node',
      enabled: true,
    }
    expect(baseData.label).toBe('Test Node')
    expect(baseData.enabled).toBe(true)
  })

  it('应该支持可选字段', () => {
    const baseData: BaseNodeData = {
      label: 'Test Node',
      enabled: true,
      description: 'Test description',
      execStatus: 'passed',
      execDurationMs: 100,
      execError: undefined,
    }
    expect(baseData.description).toBe('Test description')
    expect(baseData.execStatus).toBe('passed')
    expect(baseData.execDurationMs).toBe(100)
  })
})

describe('StartNodeData 接口', () => {
  it('应该扩展 BaseNodeData', () => {
    const startData: StartNodeData = {
      label: 'Start',
      enabled: true,
    }
    expect(startData.label).toBe('Start')
  })
})

describe('EndNodeData 接口', () => {
  it('应该扩展 BaseNodeData', () => {
    const endData: EndNodeData = {
      label: 'End',
      enabled: true,
    }
    expect(endData.label).toBe('End')
  })
})

describe('HttpRequestNodeData 接口', () => {
  it('应该包含 menuItemId', () => {
    const httpData: HttpRequestNodeData = {
      label: 'HTTP Request',
      enabled: true,
      menuItemId: 'api-123',
    }
    expect(httpData.menuItemId).toBe('api-123')
  })

  it('应该支持请求覆盖', () => {
    const httpData: HttpRequestNodeData = {
      label: 'HTTP Request',
      enabled: true,
      menuItemId: 'api-123',
      requestOverride: {
        headers: [{ name: 'Authorization', value: 'Bearer token' }],
      },
    }
    expect(httpData.requestOverride?.headers).toHaveLength(1)
  })

  it('应该支持脚本配置', () => {
    const httpData: HttpRequestNodeData = {
      label: 'HTTP Request',
      enabled: true,
      menuItemId: 'api-123',
      preScript: 'console.log("before")',
      postScript: 'console.log("after")',
    }
    expect(httpData.preScript).toBe('console.log("before")')
    expect(httpData.postScript).toBe('console.log("after")')
  })

  it('应该支持断言配置', () => {
    const httpData: HttpRequestNodeData = {
      label: 'HTTP Request',
      enabled: true,
      menuItemId: 'api-123',
      assertions: [
        {
          type: 'status',
          operator: 'equals',
          expected: 200,
        },
      ],
    }
    expect(httpData.assertions).toHaveLength(1)
    expect(httpData.assertions?.[0].type).toBe('status')
  })

  it('应该支持提取器配置', () => {
    const httpData: HttpRequestNodeData = {
      label: 'HTTP Request',
      enabled: true,
      menuItemId: 'api-123',
      extractors: [
        {
          type: 'json_path',
          path: '$.data.token',
          variable: 'auth_token',
        },
      ],
    }
    expect(httpData.extractors).toHaveLength(1)
    expect(httpData.extractors?.[0].variable).toBe('auth_token')
  })
})

describe('ConditionNodeData 接口', () => {
  it('应该支持表达式条件', () => {
    const conditionData: ConditionNodeData = {
      label: 'Condition',
      enabled: true,
      conditionType: 'expression',
      expression: 'token !== undefined',
    }
    expect(conditionData.conditionType).toBe('expression')
    expect(conditionData.expression).toBe('token !== undefined')
  })

  it('应该支持变量检查条件', () => {
    const conditionData: ConditionNodeData = {
      label: 'Condition',
      enabled: true,
      conditionType: 'variable_check',
      variableName: 'status',
      operator: 'equals',
      compareValue: 'success',
    }
    expect(conditionData.conditionType).toBe('variable_check')
    expect(conditionData.operator).toBe('equals')
  })

  it('应该支持状态码条件', () => {
    const conditionData: ConditionNodeData = {
      label: 'Condition',
      enabled: true,
      conditionType: 'status_code',
      operator: 'equals',
      compareValue: '200',
    }
    expect(conditionData.conditionType).toBe('status_code')
  })
})

describe('LoopNodeData 接口', () => {
  it('应该支持计数循环', () => {
    const loopData: LoopNodeData = {
      label: 'Loop',
      enabled: true,
      loopType: 'count',
      count: 10,
      iteratorVariable: 'i',
      maxIterations: 100,
    }
    expect(loopData.loopType).toBe('count')
    expect(loopData.count).toBe(10)
  })

  it('应该支持 while 循环', () => {
    const loopData: LoopNodeData = {
      label: 'Loop',
      enabled: true,
      loopType: 'while',
      whileExpression: 'i < 10',
      iteratorVariable: 'i',
    }
    expect(loopData.loopType).toBe('while')
    expect(loopData.whileExpression).toBe('i < 10')
  })

  it('应该支持 for_each 循环', () => {
    const loopData: LoopNodeData = {
      label: 'Loop',
      enabled: true,
      loopType: 'for_each',
      collectionVariable: 'items',
      iteratorVariable: 'item',
    }
    expect(loopData.loopType).toBe('for_each')
    expect(loopData.collectionVariable).toBe('items')
  })
})

describe('ParallelNodeData 接口', () => {
  it('应该支持并行配置', () => {
    const parallelData: ParallelNodeData = {
      label: 'Parallel',
      enabled: true,
      branchCount: 3,
      waitAll: true,
      timeoutMs: 5000,
    }
    expect(parallelData.branchCount).toBe(3)
    expect(parallelData.waitAll).toBe(true)
    expect(parallelData.timeoutMs).toBe(5000)
  })
})

describe('WaitNodeData 接口', () => {
  it('应该支持固定等待', () => {
    const waitData: WaitNodeData = {
      label: 'Wait',
      enabled: true,
      waitType: 'fixed',
      durationMs: 1000,
    }
    expect(waitData.waitType).toBe('fixed')
    expect(waitData.durationMs).toBe(1000)
  })

  it('应该支持变量等待', () => {
    const waitData: WaitNodeData = {
      label: 'Wait',
      enabled: true,
      waitType: 'variable',
      durationVariable: 'delay_ms',
    }
    expect(waitData.waitType).toBe('variable')
    expect(waitData.durationVariable).toBe('delay_ms')
  })

  it('应该支持条件等待', () => {
    const waitData: WaitNodeData = {
      label: 'Wait',
      enabled: true,
      waitType: 'condition',
      conditionExpression: 'ready === true',
      pollIntervalMs: 100,
      maxWaitMs: 10000,
    }
    expect(waitData.waitType).toBe('condition')
    expect(waitData.pollIntervalMs).toBe(100)
  })
})

describe('SubFlowNodeData 接口', () => {
  it('应该支持子流程配置', () => {
    const subFlowData: SubFlowNodeData = {
      label: 'Sub Flow',
      enabled: true,
      targetTaskId: 'task-456',
      passVariables: true,
      mergeVariables: false,
    }
    expect(subFlowData.targetTaskId).toBe('task-456')
    expect(subFlowData.passVariables).toBe(true)
    expect(subFlowData.mergeVariables).toBe(false)
  })
})

describe('SetVariableNodeData 接口', () => {
  it('应该支持变量赋值', () => {
    const setVarData: SetVariableNodeData = {
      label: 'Set Variable',
      enabled: true,
      assignments: [
        {
          variable: 'token',
          operator: '=',
          value: '{{response.token}}',
        },
        {
          variable: 'counter',
          operator: '+=',
          value: '1',
        },
      ],
    }
    expect(setVarData.assignments).toHaveLength(2)
    expect(setVarData.assignments[0].operator).toBe('=')
    expect(setVarData.assignments[1].operator).toBe('+=')
  })
})

describe('AssertNodeData 接口', () => {
  it('应该支持结构化断言', () => {
    const assertData: AssertNodeData = {
      label: 'Assert',
      enabled: true,
      assertions: [
        {
          type: 'json_path',
          path: '$.data.status',
          operator: 'equals',
          expected: 'success',
        },
      ],
    }
    expect(assertData.assertions).toHaveLength(1)
  })

  it('应该支持脚本断言', () => {
    const assertData: AssertNodeData = {
      label: 'Assert',
      enabled: true,
      assertions: [],
      script: 'pm.test("Status is 200", () => { pm.expect(pm.response.code).to.equal(200) })',
    }
    expect(assertData.script).toContain('pm.test')
  })
})

describe('FlowNode 类型', () => {
  it('应该支持所有节点类型', () => {
    const startNode: FlowNode = {
      id: 'start-1',
      type: FlowNodeType.Start,
      position: { x: 0, y: 0 },
      data: {
        label: 'Start',
        enabled: true,
      },
    }
    expect(startNode.type).toBe(FlowNodeType.Start)

    const httpNode: FlowNode = {
      id: 'http-1',
      type: FlowNodeType.HttpRequest,
      position: { x: 100, y: 0 },
      data: {
        label: 'HTTP Request',
        enabled: true,
        menuItemId: 'api-123',
      },
    }
    expect(httpNode.type).toBe(FlowNodeType.HttpRequest)
  })
})

describe('FlowEdge 类型', () => {
  it('应该支持标准边属性', () => {
    const edge: FlowEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }
    expect(edge.source).toBe('node-1')
    expect(edge.target).toBe('node-2')
  })

  it('应该支持带标签的边', () => {
    const edge: FlowEdge = {
      id: 'edge-1',
      source: 'condition-1',
      target: 'node-2',
      sourceHandle: 'true',
      label: 'true',
    }
    expect(edge.sourceHandle).toBe('true')
    expect(edge.label).toBe('true')
  })
})

describe('FlowGraph 接口', () => {
  it('应该包含节点和边', () => {
    const graph: FlowGraph = {
      nodes: [
        {
          id: 'start-1',
          type: FlowNodeType.Start,
          position: { x: 0, y: 0 },
          data: { label: 'Start', enabled: true },
        },
      ],
      edges: [],
    }
    expect(graph.nodes).toHaveLength(1)
    expect(graph.edges).toHaveLength(0)
  })

  it('应该支持视口配置', () => {
    const graph: FlowGraph = {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }
    expect(graph.viewport?.zoom).toBe(1)
  })
})

describe('ExecutionStep 接口', () => {
  it('应该支持顺序执行', () => {
    const step: ExecutionStep = {
      nodeId: 'node-1',
      type: FlowNodeType.HttpRequest,
      data: {
        label: 'HTTP Request',
        enabled: true,
        menuItemId: 'api-123',
      },
      next: {
        nodeId: 'node-2',
        type: FlowNodeType.End,
        data: { label: 'End', enabled: true },
      },
    }
    expect(step.next?.nodeId).toBe('node-2')
  })

  it('应该支持分支执行', () => {
    const step: ExecutionStep = {
      nodeId: 'condition-1',
      type: FlowNodeType.Condition,
      data: {
        label: 'Condition',
        enabled: true,
        conditionType: 'expression',
        expression: 'true',
      },
      branches: [
        {
          label: 'true',
          steps: {
            nodeId: 'node-true',
            type: FlowNodeType.HttpRequest,
            data: { label: 'True Branch', enabled: true, menuItemId: 'api-1' },
          },
        },
        {
          label: 'false',
          steps: {
            nodeId: 'node-false',
            type: FlowNodeType.HttpRequest,
            data: { label: 'False Branch', enabled: true, menuItemId: 'api-2' },
          },
        },
      ],
    }
    expect(step.branches).toHaveLength(2)
    expect(step.branches?.[0].label).toBe('true')
  })

  it('应该支持循环执行', () => {
    const step: ExecutionStep = {
      nodeId: 'loop-1',
      type: FlowNodeType.Loop,
      data: {
        label: 'Loop',
        enabled: true,
        loopType: 'count',
        count: 5,
        iteratorVariable: 'i',
      },
      loopBody: {
        nodeId: 'http-in-loop',
        type: FlowNodeType.HttpRequest,
        data: { label: 'Request in Loop', enabled: true, menuItemId: 'api-1' },
      },
      afterLoop: {
        nodeId: 'after-loop',
        type: FlowNodeType.End,
        data: { label: 'End', enabled: true },
      },
    }
    expect(step.loopBody?.nodeId).toBe('http-in-loop')
    expect(step.afterLoop?.nodeId).toBe('after-loop')
  })
})

describe('ExecutionContext 接口', () => {
  it('应该包含执行所需的所有上下文', () => {
    const controller = new AbortController()
    const context: ExecutionContext = {
      variables: { token: 'abc123' },
      projectId: 'project-1',
      baseUrl: 'https://api.example.com',
      environmentVariables: { API_KEY: 'key123' },
      failFast: true,
      abortSignal: controller.signal,
      onNodeStart: () => {},
      onNodeComplete: () => {},
      onVariableChange: () => {},
    }
    expect(context.projectId).toBe('project-1')
    expect(context.failFast).toBe(true)
    expect(context.variables.token).toBe('abc123')
  })
})

describe('NodeResult 接口', () => {
  it('应该包含执行结果', () => {
    const result: NodeResult = {
      nodeId: 'node-1',
      status: 'passed',
      requestJson: { url: '/api/test', method: 'GET' },
      responseJson: { status: 200, body: '{"success": true}' },
      assertionResults: [
        {
          assertion: { type: 'status', operator: 'equals', expected: 200 },
          passed: true,
          actual: 200,
        },
      ],
      variableDeltas: { token: 'new_token' },
      durationMs: 150,
    }
    expect(result.status).toBe('passed')
    expect(result.assertionResults).toHaveLength(1)
    expect(result.durationMs).toBe(150)
  })

  it('应该支持错误状态', () => {
    const result: NodeResult = {
      nodeId: 'node-1',
      status: 'error',
      error: 'Connection timeout',
      durationMs: 5000,
    }
    expect(result.status).toBe('error')
    expect(result.error).toBe('Connection timeout')
  })
})

describe('NodeConfig 接口', () => {
  it('应该支持节点配置', () => {
    const config: NodeConfig = {
      type: FlowNodeType.HttpRequest,
      label: 'HTTP Request',
      icon: 'Globe',
      color: 'blue',
      defaultData: {
        label: 'New Request',
        enabled: true,
        menuItemId: '',
      },
      inputHandles: ['in'],
      outputHandles: ['out'],
    }
    expect(config.type).toBe(FlowNodeType.HttpRequest)
    expect(config.inputHandles).toHaveLength(1)
    expect(config.outputHandles).toHaveLength(1)
  })
})

describe('ToolbarAction 类型', () => {
  it('应该支持所有工具栏动作', () => {
    const actions: ToolbarAction[] = [
      'run',
      'abort',
      'validate',
      'autoLayout',
      'undo',
      'redo',
      'zoomIn',
      'zoomOut',
      'fitView',
      'export',
      'import',
      'clear',
    ]
    expect(actions).toHaveLength(12)
  })
})

describe('ValidationWarning 接口', () => {
  it('应该支持错误和警告', () => {
    const error: ValidationWarning = {
      type: 'error',
      message: 'Missing Start node',
      nodeId: 'start-1',
    }
    expect(error.type).toBe('error')

    const warning: ValidationWarning = {
      type: 'warning',
      message: 'Unreachable node detected',
      nodeId: 'node-5',
    }
    expect(warning.type).toBe('warning')
  })
})
