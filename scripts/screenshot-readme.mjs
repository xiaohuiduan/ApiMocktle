import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = 'scripts/readme-shots'
fs.mkdirSync(OUT, { recursive: true })

const now = new Date().toISOString()

// ---------- 基础 ----------
const baseMocks = {
  get_current_user: { ok: true, data: { id: 'user-1', username: 'apimocktle' }, error: null },
  get_app_config: { ok: true, data: null, error: null },
  logout: { ok: true, data: null, error: null },
}

const listProjects = {
  ok: true, error: null,
  data: { projects: [
    { id: 'project-1', name: '宠物商城 API', role: 'owner', ownerId: 'user-1', createdAt: '2026-05-01T10:00:00Z', icon: '🐱', apiCount: 18, schemaCount: 6, requestCount: 9, testCount: 3 },
    { id: 'project-2', name: '用户中心服务', role: 'editor', ownerId: 'user-2', createdAt: '2026-05-12T10:00:00Z', icon: '🦄', apiCount: 32, schemaCount: 11, requestCount: 14, testCount: 5 },
    { id: 'project-3', name: '支付网关', role: 'viewer', ownerId: 'user-3', createdAt: '2026-06-01T10:00:00Z', icon: '💳', apiCount: 24, schemaCount: 9, requestCount: 6, testCount: 0 },
  ] },
}

const getProject = {
  ok: true, error: null,
  data: {
    project: { id: 'project-1', name: '宠物商城 API', role: 'owner', ownerId: 'user-1', createdAt: now, icon: '🐱', apiCount: 18, schemaCount: 6, requestCount: 9, testCount: 3 },
    currentUserId: 'user-1', role: 'owner',
    members: [
      { id: 'user-1', username: 'apimocktle', role: 'owner' },
      { id: 'user-2', username: 'xiaoming', role: 'editor' },
      { id: 'user-3', username: 'xiaohong', role: 'viewer' },
    ],
  },
}

const userListApi = {
  id: 'api-users', parentId: 'folder-user', name: '获取用户列表', type: 'apiDetail',
  data: {
    id: 'api-users', method: 'GET', path: '/api/users', name: '获取用户列表', status: 'released',
    description: '分页获取用户列表，支持按关键字搜索与角色过滤。',
    tags: ['用户', '查询'],
    parameters: {
      query: [
        { id: 'q1', name: 'page', description: '页码，从 1 开始', type: 'integer', example: '1', enable: true, required: false },
        { id: 'q2', name: 'pageSize', description: '每页条数', type: 'integer', example: '20', enable: true, required: false },
        { id: 'q3', name: 'keyword', description: '用户名/邮箱搜索关键字', type: 'string', example: 'api', enable: true, required: false },
      ],
      header: [
        { id: 'h1', name: 'Authorization', description: 'Bearer 访问令牌', type: 'string', example: 'Bearer eyJhbGciOi...', enable: true, required: true },
      ],
      path: [], cookie: [],
    },
    requestBody: { type: 'none' },
    responses: [
      {
        id: 'r1', code: 200, name: 'OK', contentType: 'json',
        jsonSchema: {
          type: 'object', name: 'data', properties: [
            { type: 'integer', name: 'code', description: '业务状态码', example: '0' },
            { type: 'string', name: 'message', description: '提示信息', example: 'success' },
            { type: 'object', name: 'data', description: '分页数据', properties: [
              { type: 'integer', name: 'total', example: '100' },
              { type: 'array', name: 'list', items: { type: 'object', properties: [
                { type: 'integer', name: 'id', example: '1' },
                { type: 'string', name: 'username', example: 'apimocktle' },
                { type: 'string', name: 'email', example: 'dev@example.com' },
                { type: 'string', name: 'role', example: 'admin' },
              ] } },
            ] },
          ],
        },
      },
      { id: 'r2', code: 401, name: 'Unauthorized', contentType: 'json', jsonSchema: { type: 'object', name: 'error', properties: [{ type: 'string', name: 'message', example: '未登录或登录已过期' }] } },
    ],
    createdAt: now, updatedAt: now,
  },
}

const createUserApi = {
  id: 'api-create-user', parentId: 'folder-user', name: '创建用户', type: 'apiDetail',
  data: {
    id: 'api-create-user', method: 'POST', path: '/api/users', name: '创建用户', status: 'released',
    description: '创建新用户，用户名需全局唯一。',
    tags: ['用户', '写入'],
    parameters: { query: [], header: [
      { id: 'h1', name: 'Content-Type', description: '请求体类型', type: 'string', example: 'application/json', enable: true, required: true },
    ], path: [], cookie: [] },
    requestBody: {
      type: 'application/json',
      jsonSchema: {
        type: 'object', name: 'body', properties: [
          { type: 'string', name: 'username', description: '用户名，3-32 位', example: 'newuser', required: true },
          { type: 'string', name: 'email', description: '邮箱', example: 'new@example.com', required: true },
          { type: 'string', name: 'password', description: '密码，至少 8 位', example: '********', required: true },
          { type: 'string', name: 'role', description: '角色', example: 'member' },
        ],
      },
    },
    responses: [
      { id: 'r1', code: 201, name: 'Created', contentType: 'json', jsonSchema: { type: 'object', name: 'data', properties: [{ type: 'integer', name: 'id', example: '101' }] } },
    ],
    createdAt: now, updatedAt: now,
  },
}

const petListApi = {
  id: 'api-pets', parentId: 'folder-pet', name: '查询宠物列表', type: 'apiDetail',
  data: {
    id: 'api-pets', method: 'GET', path: '/api/pets', name: '查询宠物列表', status: 'testing',
    description: '按分类、状态查询宠物列表，支持分页。',
    tags: ['宠物', '查询'],
    parameters: {
      query: [
        { id: 'q1', name: 'category', description: '宠物分类', type: 'string', example: 'cat', enable: true, required: false },
        { id: 'q2', name: 'status', description: '领养状态', type: 'string', example: 'available', enable: true, required: false },
        { id: 'q3', name: 'page', description: '页码', type: 'integer', example: '1', enable: true, required: false },
      ],
      header: [
        { id: 'h1', name: 'Authorization', description: 'Bearer 访问令牌', type: 'string', example: 'Bearer eyJhbGciOi...', enable: true, required: true },
      ],
      path: [], cookie: [],
    },
    requestBody: { type: 'none' },
    responses: [
      { id: 'r1', code: 200, name: 'OK', contentType: 'json', jsonSchema: { type: 'object', name: 'data', properties: [
        { type: 'integer', name: 'code', example: '0' },
        { type: 'array', name: 'data', items: { type: 'object', properties: [
          { type: 'integer', name: 'id', example: '1' },
          { type: 'string', name: 'name', example: '布丁' },
          { type: 'string', name: 'category', example: 'cat' },
          { type: 'string', name: 'status', example: 'available' },
        ] } },
      ] } },
    ],
    createdAt: now, updatedAt: now,
  },
}

const menuRawList = [
  { id: 'folder-user', parentId: undefined, name: '用户中心', type: 'apiDetailFolder', data: { name: '用户中心' } },
  userListApi,
  createUserApi,
  { id: 'folder-pet', parentId: undefined, name: '宠物管理', type: 'apiDetailFolder', data: { name: '宠物管理' } },
  petListApi,
  { id: 'api-pet-create', parentId: 'folder-pet', name: '新建宠物', type: 'apiDetail', data: { id: 'api-pet-create', method: 'POST', path: '/api/pets', name: '新建宠物', status: 'developing', description: '新增一只宠物。', parameters: { query: [], header: [], path: [], cookie: [] }, requestBody: { type: 'application/json', jsonSchema: { type: 'object', name: 'body', properties: [
    { type: 'string', name: 'name', description: '宠物名字', example: '布丁', required: true },
    { type: 'string', name: 'category', description: '分类', example: 'cat', required: true },
    { type: 'string', name: 'status', description: '状态', example: 'available' },
  ] } }, responses: [{ id: 'r1', code: 201, name: 'Created', contentType: 'json' }], createdAt: now, updatedAt: now } },
  { id: 'doc-guide', parentId: undefined, name: '项目使用说明', type: 'doc', data: { id: 'doc-guide', name: '项目使用说明', content: '# 宠物商城 API\n\n本文档描述宠物商城开放接口的使用方法。', createAt: now, updateAt: now } },
  { id: 'folder-schema', parentId: undefined, name: '数据模型', type: 'apiSchemaFolder', data: { name: '数据模型' } },
  { id: 'schema-user', parentId: 'folder-schema', name: '用户模型', type: 'apiSchema', data: { jsonSchema: { type: 'object', name: 'User', properties: [
    { type: 'integer', name: 'id', description: '用户 ID' },
    { type: 'string', name: 'username', description: '用户名' },
    { type: 'string', name: 'email', description: '邮箱' },
    { type: 'string', name: 'role', description: '角色' },
  ] } } },
  { id: 'schema-pet', parentId: 'folder-schema', name: '宠物模型', type: 'apiSchema', data: { jsonSchema: { type: 'object', name: 'Pet', properties: [
    { type: 'integer', name: 'id' },
    { type: 'string', name: 'name' },
    { type: 'string', name: 'category' },
    { type: 'string', name: 'status' },
  ] } } },
  { id: 'folder-request', parentId: undefined, name: '快捷请求', type: 'requestFolder', data: { name: '快捷请求' } },
  { id: 'req-weather', parentId: 'folder-request', name: '天气查询', type: 'httpRequest', data: { id: 'req-weather', method: 'GET', path: '/api/weather', name: '天气查询', status: 'released', parameters: { query: [{ id: 'q1', name: 'city', description: '城市名', type: 'string', example: '上海', enable: true, required: true }], header: [], path: [], cookie: [] }, requestBody: { type: 'none' }, responses: [], createdAt: now, updatedAt: now } },
]

const environments = [
  { id: 'env-dev', name: '开发环境', url: 'http://dev.api.example.com', baseUrls: [{ id: 'b1', url: 'http://dev.api.example.com' }], variables: [
    { id: 'v1', name: 'baseUrl', value: 'http://dev.api.example.com', enable: true },
    { id: 'v2', name: 'token', value: 'dev-token-123456', enable: true },
  ], parameters: { header: [{ id: 'p1', name: 'X-Env', value: 'dev', enable: true }], query: [], cookie: [], body: [] } },
  { id: 'env-prod', name: '生产环境', url: 'https://api.example.com', baseUrls: [{ id: 'b1', url: 'https://api.example.com' }], variables: [
    { id: 'v1', name: 'baseUrl', value: 'https://api.example.com', enable: true },
    { id: 'v2', name: 'token', value: 'prod-token-abcdef', enable: true },
  ], parameters: { header: [{ id: 'p1', name: 'X-Env', value: 'prod', enable: true }], query: [], cookie: [], body: [] } },
]

const getProjectState = {
  ok: true, error: null,
  data: {
    menuRawList,
    recyleRawData: { http: { list: [] }, schema: { list: [] }, request: { list: [] } },
    projectEnvironments: environments,
    projectEnvironmentConfig: {
      globalVariables: [{ id: 'gv1', name: 'appName', value: '宠物商城', enable: true }, { id: 'gv2', name: 'apiVersion', value: 'v1', enable: true }],
      globalParameters: { header: [{ id: 'gp1', name: 'X-Trace-Id', value: '{{traceId}}', enable: true }], query: [{ id: 'gq1', name: 'debug', value: '0', enable: true }], cookie: [], body: [] },
      environments: [environments[0], environments[1]],
    },
  },
}

const flowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 180 }, data: { label: '开始', enabled: true } },
    { id: 'http-login', type: 'httpRequest', position: { x: 200, y: 120 }, data: { label: '登录获取 Token', menuItemId: 'api-login', enabled: true, method: 'POST', url: '/api/auth/login' } },
    { id: 'set-token', type: 'setVariable', position: { x: 420, y: 120 }, data: { label: '保存 Token', enabled: true, assignments: [{ variable: 'token', operator: '=', value: '{{loginResponse.data.token}}' }] } },
    { id: 'http-users', type: 'httpRequest', position: { x: 640, y: 60 }, data: { label: '获取用户列表', menuItemId: 'api-users', enabled: true, method: 'GET', url: '/api/users' } },
    { id: 'cond', type: 'condition', position: { x: 640, y: 260 }, data: { label: '状态码判断', enabled: true, conditionType: 'status_code', conditions: [
      { id: 'cond-0', expression: 'status === 200', label: '200 OK' },
      { id: 'cond-1', expression: 'status !== 200', label: '其他状态' },
    ], defaultLabel: '其他状态' } },
    { id: 'parallel', type: 'parallel', position: { x: 900, y: 40 }, data: { label: '并行查询', enabled: true, branchCount: 2, waitAll: true } },
    { id: 'http-pets', type: 'httpRequest', position: { x: 1130, y: -40 }, data: { label: '查询宠物', menuItemId: 'api-pets', enabled: true, method: 'GET', url: '/api/pets' } },
    { id: 'http-orders', type: 'httpRequest', position: { x: 1130, y: 120 }, data: { label: '查询订单', menuItemId: 'api-orders', enabled: true, method: 'GET', url: '/api/orders' } },
    { id: 'assert', type: 'assert', position: { x: 900, y: 300 }, data: { label: '校验响应', enabled: true, assertions: [{ id: 'a1', type: 'status', operator: 'equals', expectedValue: '200', variable: 'status' }] } },
    { id: 'wait', type: 'wait', position: { x: 1130, y: 300 }, data: { label: '等待 1 秒', enabled: true, waitType: 'fixed', durationMs: 1000 } },
    { id: 'loop', type: 'loop', position: { x: 1380, y: 120 }, data: { label: '循环 3 次', enabled: true, loopType: 'count', count: 3, iteratorVariable: 'i' } },
    { id: 'http-orders-detail', type: 'httpRequest', position: { x: 1580, y: 120 }, data: { label: '查询订单详情', menuItemId: 'api-order-detail', enabled: true, method: 'GET', url: '/api/orders/{id}' } },
    { id: 'end', type: 'end', position: { x: 1800, y: 120 }, data: { label: '结束', enabled: true } },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'http-login' },
    { id: 'e2', source: 'http-login', target: 'set-token' },
    { id: 'e3', source: 'set-token', target: 'http-users' },
    { id: 'e4', source: 'http-users', target: 'cond' },
    { id: 'e5', source: 'cond', target: 'parallel', sourceHandle: 'cond-0', label: '200 OK' },
    { id: 'e6', source: 'cond', target: 'assert', sourceHandle: 'cond-1', label: '其他状态' },
    { id: 'e7', source: 'parallel', target: 'http-pets' },
    { id: 'e8', source: 'parallel', target: 'http-orders' },
    { id: 'e9', source: 'http-pets', target: 'wait' },
    { id: 'e10', source: 'http-orders', target: 'wait' },
    { id: 'e11', source: 'wait', target: 'loop' },
    { id: 'e12', source: 'loop', target: 'http-orders-detail' },
    { id: 'e13', source: 'http-orders-detail', target: 'loop' },
    { id: 'e14', source: 'loop', target: 'end', sourceHandle: 'loop-exit' },
    { id: 'e15', source: 'assert', target: 'end' },
  ],
  viewport: { x: 0, y: 0, zoom: 0.7 },
}

const testTasks = {
  ok: true, error: null,
  data: [
    { id: 'task-1', projectId: 'project-1', name: '宠物商城全流程回归', description: '登录 → 用户列表 → 宠物/订单并行查询', folderId: 'f1', environmentId: 'env-dev', status: 'passed', failFast: true, createdAt: now, updatedAt: now },
    { id: 'task-2', projectId: 'project-1', name: '创建用户接口自测', description: '校验创建用户的必填参数与返回结构', folderId: 'f1', environmentId: 'env-dev', status: 'failed', failFast: false, createdAt: now, updatedAt: now },
    { id: 'task-3', projectId: 'project-1', name: '订单详情冒烟', description: '订单详情接口基本连通性', folderId: null, status: 'idle', failFast: false, createdAt: now, updatedAt: now },
  ],
}
const testFolders = {
  ok: true, error: null,
  data: [
    { id: 'f1', projectId: 'project-1', name: '回归用例', sortOrder: 0, createdAt: now, updatedAt: now },
    { id: 'f2', projectId: 'project-1', name: '接口冒烟', sortOrder: 1, createdAt: now, updatedAt: now },
  ],
}

const shareLinks = {
  ok: true, error: null,
  data: [
    { id: 's1', projectId: 'project-1', title: '宠物商城 API 文档', apiMenuIds: [], expiresAt: null, createdAt: '2026-08-01T10:00:00Z', hasPassword: true, passwordPlain: '123456' },
    { id: 's2', projectId: 'project-1', title: '订单模块（临时）', apiMenuIds: ['api-orders'], expiresAt: '2026-08-15T10:00:00Z', createdAt: '2026-08-03T10:00:00Z', hasPassword: false },
  ],
}
const shareServerStatus = { ok: true, data: { running: true, port: 18432 }, error: null }
const lanIps = { ok: true, data: ['192.168.1.100', '10.0.0.8'], error: null }

const runResult = {
  ok: true, error: null,
  data: {
    url: 'http://dev.api.example.com/api/users?page=1&pageSize=20',
    method: 'GET', status: 200, statusText: 'OK', durationMs: 86,
    requestHeaders: [
      { name: 'Authorization', value: 'Bearer eyJhbGciOi...', sent: true },
      { name: 'Host', value: 'dev.api.example.com', sent: true },
      { name: 'User-Agent', value: 'apimocktle/1.7.2', sent: true },
      { name: 'Accept', value: '*/*', sent: false },
    ],
    requestQuery: [{ name: 'page', value: '1' }, { name: 'pageSize', value: '20' }],
    requestCookie: [], requestBodyParameters: [], requestBodyText: undefined,
    headers: [
      { name: 'content-type', value: 'application/json; charset=utf-8' },
      { name: 'date', value: 'Fri, 07 Aug 2026 14:00:00 GMT' },
      { name: 'server', value: 'nginx/1.24.0' },
    ],
    contentType: 'json',
    body: '{"code":0,"message":"success","data":{"total":2,"list":[{"id":1,"username":"apimocktle","email":"dev@example.com","role":"admin"},{"id":2,"username":"xiaoming","email":"ming@example.com","role":"member"}]}}',
    bodySize: 142, proxyType: 'none',
  },
}

const historyList = {
  ok: true, error: null,
  data: [
    {
      requestJson: { url: 'http://dev.api.example.com/api/users?page=1&pageSize=20', method: 'GET', headers: [{ name: 'Authorization', value: 'Bearer eyJhbGciOi...' }], body: '' },
      responseJson: { ...runResult.data, body: '{"code":0,"message":"success","data":{"total":2,"list":[]}}', bodySize: 48 },
    },
    {
      requestJson: { url: 'http://dev.api.example.com/api/users?page=2&pageSize=10', method: 'GET', headers: [], body: '' },
      responseJson: { ...runResult.data, body: '{"code":401,"message":"未登录或登录已过期"}', status: 401, statusText: 'Unauthorized', bodySize: 36 },
    },
  ],
}

const allMocks = {
  ...baseMocks,
  list_projects: listProjects,
  get_project: getProject,
  get_project_state: getProjectState,
  list_test_tasks: testTasks,
  list_test_folders: testFolders,
  get_test_task: { ok: true, data: testTasks.data[0], error: null },
  load_test_flow_graph: { ok: true, data: flowGraph, error: null },
  list_share_links: shareLinks,
  get_share_server_status: shareServerStatus,
  get_lan_ip: lanIps,
  list_all_users: { ok: true, data: [{ id: 'user-4', username: 'xiaoli' }], error: null },
  list_menu_items: { ok: true, data: { menuItems: menuRawList }, error: null },
  run_api_request: runResult,
  list_request_history: historyList,
}

// ---------- 工具 ----------
async function openPage(browser, url, preseed = true) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  await page.addInitScript((payload) => {
    const { data, preseed } = payload
    sessionStorage.setItem('session_id', 'mock-session-id')
    if (preseed) { sessionStorage.setItem('project-open-tabs', JSON.stringify([{ projectId: 'project-1', name: '宠物商城 API', icon: '🐱', role: 'owner' }])) }
    window.__E2E_MOCK_DATA__ = data
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => {
        const mocks = window.__E2E_MOCK_DATA__ || {}
        if (cmd in mocks) return mocks[cmd]
        return { ok: true, data: null }
      },
      transformCallback: () => 'mock-cb',
      unregisterCallback: () => {},
      convertFileSrc: (p) => `asset://localhost/${p}`,
      metadata: { windows: [], currentWindow: { label: 'main' }, plugins: {} },
    }
  }, { data: allMocks, preseed })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)
  return page
}

async function shot(page, name, label) {
  await page.screenshot({ path: `${OUT}/${name}.png` })
  const text = await page.locator('body').innerText().catch(() => '')
  console.log(`${name}: ${text.slice(0, 90).replace(/\n/g, ' | ')}`)
}

async function openApiDoc(page) {
  const folderNode = page.locator('.ui-menu .ant-tree-treenode', { hasText: '用户中心' }).first()
  const switcher = folderNode.locator('.ant-tree-switcher').first()
  if (await switcher.count()) { await switcher.click(); await page.waitForTimeout(800) }
  const apiNode = page.locator('.ui-menu .ant-tree-node-content-wrapper', { hasText: '获取用户列表' }).first()
  if (await apiNode.count()) { await apiNode.click(); await page.waitForTimeout(2200) }
}

const browser = await chromium.launch()

// ===== 1. 项目管理 =====
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects')
  await shot(page, '01-projects', '项目列表')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects', false)
  const createBtn = page.getByRole('button', { name: '新建项目' }).first()
  if (await createBtn.count()) {
    await createBtn.click()
    await page.waitForTimeout(1200)
    if (await page.locator('.ant-modal:visible').count() === 0) { await createBtn.click(); await page.waitForTimeout(1200) }
  }
  await shot(page, '02-project-create', '新建项目弹窗')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects', false)
  const editBtn = page.getByRole('button', { name: '编 辑' }).first()
  if (await editBtn.count()) { await editBtn.click(); await page.waitForTimeout(1200); if (await page.locator('.ant-modal:visible').count() === 0) { await editBtn.click(); await page.waitForTimeout(1200) } }
  await shot(page, '03-project-edit', '编辑项目弹窗')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/home')
  const switchBtn = page.locator('button.ant-btn', { hasText: '宠物商城 API' }).first()
  if (await switchBtn.count()) { await switchBtn.click(); await page.waitForTimeout(1000) }
  await shot(page, '04-project-tabs', '项目标签与快速切换')
  await page.close()
}

// ===== 2. 接口文档 =====
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/home')
  await openApiDoc(page)
  await shot(page, '05-api-doc', '接口文档')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/home')
  await openApiDoc(page)
  const editTab = page.locator('.ant-tabs-tab', { hasText: '修改文档' }).first()
  if (await editTab.count()) { await editTab.click(); await page.waitForTimeout(1500) }
  await shot(page, '06-api-edit', '接口编辑')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/home')
  await openApiDoc(page)
  const editTab = page.locator('.ant-tabs-tab', { hasText: '修改文档' }).first()
  if (await editTab.count()) { await editTab.click(); await page.waitForTimeout(1500) }
  await shot(page, '07-api-schema', 'JSON Schema 编辑器')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/home')
  for (let i = 0; i < 6; i++) {
    const schemaNode = page.locator('.ui-menu .ant-tree-node-content-wrapper', { hasText: '用户模型' })
    if (await schemaNode.count()) { await schemaNode.first().click(); await page.waitForTimeout(2000); break }
    const folders = page.locator('.ui-menu .ant-tree-treenode', { hasText: '数据模型' })
    let clicked = false
    for (let j = 0; j < await folders.count(); j++) {
      const sw = folders.nth(j).locator('.ant-tree-switcher').first()
      const cls = await sw.getAttribute('class').catch(() => '')
      if (cls && !cls.includes('ant-tree-switcher_open')) {
        await sw.click({ force: true }).catch(() => {})
        clicked = true
        await page.waitForTimeout(700)
        break
      }
    }
    if (!clicked) { break }
  }
  await shot(page, '08-api-model', '数据模型')
  await page.close()
}

// ===== 3. 接口运行 =====
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/home')
  await openApiDoc(page)
  const runTab = page.locator('.ant-tabs-tab', { hasText: '运行' }).first()
  if (await runTab.count()) { await runTab.click(); await page.waitForTimeout(1400) }
  await shot(page, '09-api-run', '运行参数区')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/home')
  await openApiDoc(page)
  const runTab = page.locator('.ant-tabs-tab', { hasText: '运行' }).first()
  if (await runTab.count()) { await runTab.click(); await page.waitForTimeout(1400) }
  const runBtn = page.getByRole('button', { name: '运行' }).last()
  if (await runBtn.count()) { await runBtn.click(); await page.waitForTimeout(1800) }
  await shot(page, '10-api-run-result', '运行结果')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/home')
  await openApiDoc(page)
  const runTab = page.locator('.ant-tabs-tab', { hasText: '运行' }).first()
  if (await runTab.count()) { await runTab.click(); await page.waitForTimeout(1400) }
  const runBtn = page.getByRole('button', { name: '运行' }).last()
  if (await runBtn.count()) { await runBtn.click(); await page.waitForTimeout(1800) }
  const headerTab = page.locator('.ant-tabs-tab', { hasText: /响应头|请求头/ }).first()
  if (await headerTab.count()) { await headerTab.click(); await page.waitForTimeout(900) }
  await shot(page, '11-api-headers', '响应头/请求头')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/home')
  await openApiDoc(page)
  const runTab = page.locator('.ant-tabs-tab', { hasText: '运行' }).first()
  if (await runTab.count()) { await runTab.click(); await page.waitForTimeout(1400) }
  const historyBtn = page.locator('button[title="历史记录"]').first()
  if (await historyBtn.count()) { await historyBtn.click(); await page.waitForTimeout(1200) }
  await shot(page, '12-api-history', '运行历史')
  await page.close()
}

// ===== 4. 自动化测试 =====
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/tests')
  await shot(page, '13-test-tasks', '测试任务列表')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/tests/task-1')
  await page.waitForTimeout(2500)
  await shot(page, '14-flow-canvas', '流程编辑器画布')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/tests/task-1')
  await page.waitForTimeout(2500)
  const node = page.locator('.react-flow__node', { hasText: '获取用户列表' }).first()
  if (await node.count()) {
    await node.evaluate((el) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }))
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1 }))
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await page.waitForTimeout(2200)
  }
  await shot(page, '15-flow-config', '节点配置抽屉')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/tests/task-1')
  await page.waitForTimeout(2500)
  const runBtn = page.locator('[data-testid="toolbar-run"]').first()
  if (await runBtn.count()) { await runBtn.click(); await page.waitForTimeout(1500) }
  await shot(page, '16-flow-run', '流程运行弹窗')
  await page.close()
}

// ===== 5. 环境管理 =====
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/settings?section=environments')
  await shot(page, '17-env-global', '环境空间-全局变量')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/settings?section=environments')
  const globalParams = page.locator('button', { hasText: '全局参数' }).first()
  if (await globalParams.count()) { await globalParams.click(); await page.waitForTimeout(900) }
  await shot(page, '18-env-params', '全局参数')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/settings?section=environments')
  const envItem = page.locator('button', { hasText: '开发环境' }).first()
  if (await envItem.count()) { await envItem.click(); await page.waitForTimeout(900) }
  await shot(page, '19-env-edit', '环境编辑')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/home')
  const envSelector = page.locator('button, .ant-select, [role="combobox"]', { hasText: '开发环境' }).first()
  if (await envSelector.count()) { await envSelector.click(); await page.waitForTimeout(900) }
  await shot(page, '20-env-switch', '环境切换')
  await page.close()
}

// ===== 6. 文档分享 =====
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/settings')
  const shareMenu = page.locator('.ant-menu-item', { hasText: '文档分享' }).first()
  if (await shareMenu.count()) { await shareMenu.click(); await page.waitForTimeout(1200) }
  await shot(page, '21-share-panel', '分享面板')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/settings')
  const shareMenu = page.locator('.ant-menu-item', { hasText: '文档分享' }).first()
  if (await shareMenu.count()) { await shareMenu.click(); await page.waitForTimeout(1200) }
  const newBtn = page.getByRole('button', { name: '新建分享' }).first()
  if (await newBtn.count()) { await newBtn.click(); await page.waitForTimeout(1200) }
  await shot(page, '22-share-create', '新建分享')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/settings')
  const shareMenu = page.locator('.ant-menu-item', { hasText: '文档分享' }).first()
  if (await shareMenu.count()) { await shareMenu.click(); await page.waitForTimeout(1200) }
  const newBtn = page.getByRole('button', { name: '新建分享' }).first()
  if (await newBtn.count()) { await newBtn.click(); await page.waitForTimeout(1200) }
  const allCheckbox = page.locator('.ant-modal .ant-checkbox-wrapper', { hasText: '分享项目全部内容' }).first()
  if (await allCheckbox.count()) { await allCheckbox.click(); await page.waitForTimeout(900) }
  await shot(page, '23-share-scope', '选择分享范围')
  await page.close()
}
{
  const page = await openPage(browser, 'http://localhost:1420/#/projects/project-1/settings')
  const shareMenu = page.locator('.ant-menu-item', { hasText: '文档分享' }).first()
  if (await shareMenu.count()) { await shareMenu.click(); await page.waitForTimeout(1200) }
  const editBtn = page.getByRole('button', { name: '编辑' }).first()
  if (await editBtn.count()) { await editBtn.click(); await page.waitForTimeout(1200); if (await page.locator('.ant-modal:visible').count() === 0) { await editBtn.click(); await page.waitForTimeout(1200) } }
  await shot(page, '24-share-edit', '编辑分享')
  await page.close()
}

await browser.close()
console.log('ALL DONE')








