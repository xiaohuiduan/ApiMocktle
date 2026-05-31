/**
 * 测试任务数据
 */
export const testTaskData = {
  // 有效任务数据
  valid: {
    name: '测试任务',
    description: '这是一个测试任务的描述',
  },

  // 最小任务数据（仅必填字段）
  minimal: {
    name: '最小任务',
  },

  // 无效任务数据（缺少必填字段）
  invalid: {
    name: '',
    description: '缺少名称的任务',
  },

  // 更新任务数据
  update: {
    name: '更新后的任务名称',
    description: '更新后的任务描述',
  },
}

/**
 * 测试步骤数据
 */
export const testStepData = {
  // HTTP GET 请求
  httpGet: {
    name: '获取用户列表',
    method: 'GET',
    url: '/api/users',
    enabled: true,
  },

  // HTTP POST 请求
  httpPost: {
    name: '创建用户',
    method: 'POST',
    url: '/api/users',
    body: JSON.stringify({ name: '测试用户', email: 'test@example.com' }),
    enabled: true,
  },

  // HTTP PUT 请求
  httpPut: {
    name: '更新用户',
    method: 'PUT',
    url: '/api/users/1',
    body: JSON.stringify({ name: '更新用户' }),
    enabled: true,
  },

  // HTTP DELETE 请求
  httpDelete: {
    name: '删除用户',
    method: 'DELETE',
    url: '/api/users/1',
    enabled: true,
  },

  // 禁用的步骤
  disabled: {
    name: '禁用的步骤',
    method: 'GET',
    url: '/api/disabled',
    enabled: false,
  },
}

/**
 * 断言数据
 */
export const assertionData = {
  // 状态码断言
  statusCode: {
    type: 'status',
    operator: 'equals',
    expected: 200,
  },

  // JSON 路径断言
  jsonPath: {
    type: 'json_path',
    path: '$.data.id',
    operator: 'exists',
  },

  // 响应头断言
  header: {
    type: 'header',
    name: 'content-type',
    operator: 'contains',
    expected: 'application/json',
  },

  // 响应体包含断言
  bodyContains: {
    type: 'body',
    operator: 'contains',
    expected: 'success',
  },
}

/**
 * 提取器数据
 */
export const extractorData = {
  // JSON 路径提取
  jsonPath: {
    type: 'json_path',
    path: '$.data.id',
    variable: 'userId',
  },

  // 响应头提取
  header: {
    type: 'header',
    name: 'x-request-id',
    variable: 'requestId',
  },

  // 正则表达式提取
  regex: {
    type: 'regex',
    pattern: '"id":\\s*(\\d+)',
    group: 1,
    variable: 'extractedId',
  },
}

/**
 * 流程节点数据
 */
export const flowNodeData = {
  // 开始节点
  start: {
    type: 'start',
    data: { label: '开始' },
  },

  // 结束节点
  end: {
    type: 'end',
    data: { label: '结束' },
  },

  // HTTP 请求节点
  httpRequest: {
    type: 'httpRequest',
    data: {
      label: 'HTTP 请求',
      method: 'GET',
      url: '/api/users',
    },
  },

  // 条件节点
  condition: {
    type: 'condition',
    data: {
      label: '条件判断',
      condition: '{{statusCode}} === 200',
    },
  },

  // 循环节点
  loop: {
    type: 'loop',
    data: {
      label: '循环',
      count: 3,
    },
  },

  // 并行节点
  parallel: {
    type: 'parallel',
    data: {
      label: '并行执行',
    },
  },

  // 等待节点
  wait: {
    type: 'wait',
    data: {
      label: '等待',
      duration: 1000,
    },
  },

  // 子流程节点
  subFlow: {
    type: 'subFlow',
    data: {
      label: '子流程',
      flowId: 'flow-1',
    },
  },

  // 设置变量节点
  setVariable: {
    type: 'setVariable',
    data: {
      label: '设置变量',
      variable: 'myVar',
      value: 'testValue',
    },
  },

  // 断言节点
  assert: {
    type: 'assert',
    data: {
      label: '断言',
      assertions: [assertionData.statusCode],
    },
  },
}

/**
 * 流程图数据
 */
export const flowGraphData = {
  // 简单流程
  simple: {
    nodes: [
      { id: 'start-1', ...flowNodeData.start, position: { x: 100, y: 100 } },
      { id: 'http-1', ...flowNodeData.httpRequest, position: { x: 300, y: 100 } },
      { id: 'end-1', ...flowNodeData.end, position: { x: 500, y: 100 } },
    ],
    edges: [
      { id: 'edge-1', source: 'start-1', target: 'http-1' },
      { id: 'edge-2', source: 'http-1', target: 'end-1' },
    ],
  },

  // 复杂流程（包含条件分支）
  complex: {
    nodes: [
      { id: 'start-1', ...flowNodeData.start, position: { x: 100, y: 200 } },
      { id: 'http-1', ...flowNodeData.httpRequest, position: { x: 300, y: 200 } },
      { id: 'condition-1', ...flowNodeData.condition, position: { x: 500, y: 200 } },
      { id: 'http-2', type: 'httpRequest', data: { label: '成功处理', method: 'POST', url: '/api/success' }, position: { x: 700, y: 100 } },
      { id: 'http-3', type: 'httpRequest', data: { label: '失败处理', method: 'POST', url: '/api/error' }, position: { x: 700, y: 300 } },
      { id: 'end-1', ...flowNodeData.end, position: { x: 900, y: 200 } },
    ],
    edges: [
      { id: 'edge-1', source: 'start-1', target: 'http-1' },
      { id: 'edge-2', source: 'http-1', target: 'condition-1' },
      { id: 'edge-3', source: 'condition-1', target: 'http-2', sourceHandle: 'true' },
      { id: 'edge-4', source: 'condition-1', target: 'http-3', sourceHandle: 'false' },
      { id: 'edge-5', source: 'http-2', target: 'end-1' },
      { id: 'edge-6', source: 'http-3', target: 'end-1' },
    ],
  },
}

/**
 * 测试执行结果数据
 */
export const executionResultData = {
  // 成功执行
  success: {
    status: 'passed',
    total: 3,
    passed: 3,
    failed: 0,
    skipped: 0,
    stepResults: [
      { stepId: 'step-1', status: 'passed', duration: 100 },
      { stepId: 'step-2', status: 'passed', duration: 200 },
      { stepId: 'step-3', status: 'passed', duration: 150 },
    ],
  },

  // 失败执行
  failure: {
    status: 'failed',
    total: 3,
    passed: 1,
    failed: 1,
    skipped: 1,
    stepResults: [
      { stepId: 'step-1', status: 'passed', duration: 100 },
      { stepId: 'step-2', status: 'failed', duration: 50, error: '断言失败' },
      { stepId: 'step-3', status: 'skipped' },
    ],
  },

  // 部分成功
  partial: {
    status: 'passed',
    total: 5,
    passed: 4,
    failed: 0,
    skipped: 1,
    stepResults: [
      { stepId: 'step-1', status: 'passed', duration: 100 },
      { stepId: 'step-2', status: 'passed', duration: 200 },
      { stepId: 'step-3', status: 'skipped' },
      { stepId: 'step-4', status: 'passed', duration: 150 },
      { stepId: 'step-5', status: 'passed', duration: 100 },
    ],
  },
}

/**
 * 项目 ID（用于测试路由）
 */
export const TEST_PROJECT_ID = 'project-1'

/**
 * 任务 ID（用于测试路由）
 */
export const TEST_TASK_ID = 'task-1'