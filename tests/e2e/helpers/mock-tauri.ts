import type { Page } from '@playwright/test'

/**
 * Tauri API Mock 工具
 *
 * 核心原理：
 * - @tauri-apps/api/core 的 invoke() 调用 window.__TAURI_INTERNALS__.invoke(cmd, args)
 * - 通过 page.addInitScript 在页面加载前注入 __TAURI_INTERNALS__
 * - mock 数据存储在 window.__E2E_MOCK_DATA__（可变），invoke handler 动态读取
 * - 测试可通过 updateMockData() 在运行时更新 mock 数据
 */

export type MockResponseData = Record<string, unknown>

/**
 * 注入 Tauri API mock（必须在页面导航前调用）
 */
export async function mockTauriInvoke(page: Page, mockData: MockResponseData) {
  await page.addInitScript((data) => {
    sessionStorage.setItem('session_id', 'mock-session-id')
    // 存储在可变的 window 对象上，后续可通过 evaluate 更新
    ;(window as any).__E2E_MOCK_DATA__ = data

    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: Record<string, unknown>, _options?: unknown) => {
        // 记录每次 invoke 调用,供测试断言(如 move_menu_items 是否被触发)
        ;(window as any).__E2E_INVOKED__ = ((window as any).__E2E_INVOKED__ || [])
        ;(window as any).__E2E_INVOKED__.push({ cmd, args })

        const mocks = (window as any).__E2E_MOCK_DATA__ as Record<string, unknown>
        if (cmd in mocks) {
          return mocks[cmd]
        }
        console.warn(`[E2E-MOCK] Unmocked: ${cmd}`)
        return { ok: true, data: null }
      },
      transformCallback: () => 'mock-cb',
      unregisterCallback: () => {},
      convertFileSrc: (p: string) => `asset://localhost/${p}`,
      metadata: { windows: [], currentWindow: { label: 'main' }, plugins: {} },
    }
  }, mockData)
}

/**
 * 在已加载的页面上更新 mock 数据（无需重新导航）
 */
export async function updateMockData(page: Page, overrides: MockResponseData) {
  await page.evaluate((data) => {
    const current = ((window as any).__E2E_MOCK_DATA__ || {}) as Record<string, unknown>
    ;(window as any).__E2E_MOCK_DATA__ = { ...current, ...data }
  }, overrides)
}

/**
 * 创建完整的默认 mock 数据（纯 JSON）
 */
export function createDefaultMocks(projectId = 'project-1'): MockResponseData {
  const now = new Date().toISOString()

  return {
    // ===== 认证 =====
    get_current_user: { ok: true, data: { id: 'user-1', username: 'testuser' }, error: null },
    login: { ok: true, data: { user: { id: 'user-1', username: 'testuser' }, session_id: 'mock-session-id' }, error: null },
    register: { ok: true, data: { user: { id: 'user-1', username: 'testuser' }, session_id: 'mock-session-id' }, error: null },
    logout: { ok: true, data: null, error: null },
    change_password: { ok: true, data: null, error: null },

    // ===== 应用配置 =====
    get_app_config: { ok: true, data: null, error: null },

    // ===== 项目 =====
    list_projects: {
      ok: true, error: null,
      data: {
        projects: [{
          id: projectId, name: '测试项目', role: 'owner', ownerId: 'user-1',
          createdAt: now, icon: '', apiCount: 5, schemaCount: 2, requestCount: 10,
        }],
      },
    },
    get_project: {
      ok: true, error: null,
      data: {
        project: {
          id: projectId, name: '测试项目', role: 'owner', ownerId: 'user-1',
          createdAt: now, icon: '', apiCount: 5, schemaCount: 2, requestCount: 10,
        },
      },
    },
    create_project: {
      ok: true, error: null,
      data: {
        project: {
          id: 'new-project', name: '新项目', role: 'owner', ownerId: 'user-1',
          createdAt: now, icon: '', apiCount: 0, schemaCount: 0, requestCount: 0,
        },
      },
    },

    // ===== 项目状态 =====
    get_project_state: {
      ok: true, error: null,
      data: {
        menuRawList: [],
        recyleRawData: { recycleItems: [] },
        projectEnvironments: [],
        projectEnvironmentConfig: { activeEnvironmentId: '', environments: {} },
      },
    },

    // ===== 测试任务 =====
    list_test_tasks: {
      ok: true, error: null,
      data: [
        { id: 'task-1', projectId, name: '测试任务 1', description: '这是第一个测试任务', status: 'passed', failFast: false, createdAt: now, updatedAt: now },
        { id: 'task-2', projectId, name: '测试任务 2', description: '这是第二个测试任务', status: 'failed', failFast: true, createdAt: now, updatedAt: now },
        { id: 'task-3', projectId, name: '测试任务 3', description: '这是第三个测试任务', status: 'idle', failFast: false, createdAt: now, updatedAt: now },
      ],
    },
    get_test_task: {
      ok: true, error: null,
      data: {
        id: 'task-1', projectId, name: '测试任务 1', description: '这是第一个测试任务',
        status: 'passed', failFast: false, createdAt: now, updatedAt: now,
        steps: [
          { id: 'step-1', taskId: 'task-1', sortOrder: 0, name: '获取用户列表', menuItemId: 'menu-item-1', enabled: true, createdAt: now, updatedAt: now },
          { id: 'step-2', taskId: 'task-1', sortOrder: 1, name: '创建用户', menuItemId: 'menu-item-2', enabled: true, createdAt: now, updatedAt: now },
        ],
      },
    },
    create_test_task: {
      ok: true, error: null,
      data: { id: 'new-task', projectId, name: '新创建的任务', description: '', status: 'idle', failFast: false, createdAt: now, updatedAt: now },
    },
    update_test_task: {
      ok: true, error: null,
      data: { id: 'task-1', projectId, name: '已更新的任务', description: '已更新', status: 'passed', failFast: false, createdAt: now, updatedAt: now },
    },
    delete_test_task: { ok: true, data: null, error: null },

    // ===== 测试步骤 =====
    list_test_steps: {
      ok: true, error: null,
      data: [
        { id: 'step-1', taskId: 'task-1', sortOrder: 0, name: '获取用户列表', menuItemId: 'menu-item-1', enabled: true, createdAt: now, updatedAt: now },
        { id: 'step-2', taskId: 'task-1', sortOrder: 1, name: '创建用户', menuItemId: 'menu-item-2', enabled: true, createdAt: now, updatedAt: now },
      ],
    },
    create_test_step: {
      ok: true, error: null,
      data: { id: 'new-step', taskId: 'task-1', sortOrder: 2, name: '新步骤', menuItemId: 'menu-item-3', enabled: true, createdAt: now, updatedAt: now },
    },
    update_test_step: {
      ok: true, error: null,
      data: { id: 'step-1', taskId: 'task-1', sortOrder: 0, name: '已更新步骤', menuItemId: 'menu-item-1', enabled: true, createdAt: now, updatedAt: now },
    },
    delete_test_step: { ok: true, data: null, error: null },
    reorder_test_steps: { ok: true, data: null, error: null },

    // ===== 测试执行 =====
    list_test_executions: {
      ok: true, error: null,
      data: [{
        id: 'exec-1', taskId: 'task-1', status: 'passed',
        totalSteps: 2, passedSteps: 2, failedSteps: 0, skippedSteps: 0,
        totalDurationMs: 60000, startedAt: now, finishedAt: now,
      }],
    },
    get_test_execution_detail: {
      ok: true, error: null,
      data: {
        id: 'exec-1', taskId: 'task-1', status: 'passed',
        totalSteps: 2, passedSteps: 2, failedSteps: 0, skippedSteps: 0,
        totalDurationMs: 60000, startedAt: now, finishedAt: now,
        stepResults: [
          { id: 'result-1', executionId: 'exec-1', stepId: 'step-1', status: 'passed', durationMs: 100, responseStatus: 200, responseBody: '{"ok":true}' },
          { id: 'result-2', executionId: 'exec-1', stepId: 'step-2', status: 'passed', durationMs: 200, responseStatus: 201, responseBody: '{"id":1}' },
        ],
      },
    },
    delete_test_execution: { ok: true, data: null, error: null },
    create_test_execution: {
      ok: true, error: null,
      data: { id: 'new-exec', taskId: 'task-1', status: 'running', totalSteps: 2, passedSteps: 0, failedSteps: 0, skippedSteps: 0, totalDurationMs: 0, startedAt: now },
    },
    finish_test_execution: {
      ok: true, error: null,
      data: { id: 'new-exec', taskId: 'task-1', status: 'passed', totalSteps: 2, passedSteps: 2, failedSteps: 0, skippedSteps: 0, totalDurationMs: 500, startedAt: now, finishedAt: now },
    },
    execute_test_step_request: {
      ok: true, error: null,
      data: { status: 200, headers: { 'content-type': 'application/json' }, body: { success: true }, time: 100 },
    },
    create_test_step_result: {
      ok: true, error: null,
      data: { id: 'result-new', stepId: 'step-1', executionId: 'new-exec', status: 'passed' },
    },
    execute_extractors: { ok: true, data: { userId: '123' }, error: null },
    execute_assertions: { ok: true, data: [{ passed: true, actual: 200 }], error: null },

    // ===== 流程图 =====
    save_test_flow_graph: { ok: true, data: null, error: null },
    load_test_flow_graph: {
      ok: true, error: null,
      data: {
        nodes: [
          { id: 'start-1', type: 'start', position: { x: 100, y: 100 }, data: { label: '开始' } },
          { id: 'http-1', type: 'httpRequest', position: { x: 300, y: 100 }, data: { label: '获取用户', method: 'GET', url: '/api/users' } },
          { id: 'end-1', type: 'end', position: { x: 500, y: 100 }, data: { label: '结束' } },
        ],
        edges: [
          { id: 'edge-1', source: 'start-1', target: 'http-1' },
          { id: 'edge-2', source: 'http-1', target: 'end-1' },
        ],
      },
    },
    delete_test_flow_graph: { ok: true, data: null, error: null },

    // ===== 其他 =====
    list_environments: { ok: true, data: [], error: null },
    test_proxy_connection: { ok: true, data: { ok: true, statusCode: 200, durationMs: 100 }, error: null },
    list_personal_tokens: { ok: true, data: [], error: null },
    list_request_history: { ok: true, data: [], error: null },
  }
}

/**
 * 合并自定义 mock 覆盖
 */
export function mergeMocks(base: MockResponseData, overrides: MockResponseData): MockResponseData {
  return { ...base, ...overrides }
}
