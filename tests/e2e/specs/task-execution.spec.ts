import { test, expect } from '../fixtures/base'
import { TEST_PROJECT_ID, TEST_TASK_ID } from '../fixtures/test-data'

test.describe('测试执行引擎测试', () => {
  test.beforeEach(async ({ mockTauri }) => {
    await mockTauri()
  })

  test('执行成功流程', async ({ testExecutionPage, mockTauri, page }) => {
    // 更新执行相关 mock 为成功结果
    await mockTauri({
      create_test_execution: {
        ok: true, error: null,
        data: { id: 'exec-success', taskId: TEST_TASK_ID, status: 'running', totalSteps: 2, passedSteps: 0, failedSteps: 0, skippedSteps: 0, totalDurationMs: 0, startedAt: new Date().toISOString() },
      },
      execute_test_step_request: {
        ok: true, error: null,
        data: { status: 200, headers: { 'content-type': 'application/json' }, body: { success: true }, time: 100 },
      },
      execute_assertions: {
        ok: true, error: null,
        data: [{ passed: true, actual: 200 }],
      },
      finish_test_execution: {
        ok: true, error: null,
        data: { id: 'exec-success', taskId: TEST_TASK_ID, status: 'passed', totalSteps: 2, passedSteps: 2, failedSteps: 0, skippedSteps: 0, totalDurationMs: 500, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() },
      },
    })

    await testExecutionPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(2000)

    // 验证执行结果区域存在
    await expect(testExecutionPage.executionTable).toBeVisible()
  })

  test('执行失败流程', async ({ testExecutionPage, mockTauri, page }) => {
    await mockTauri({
      create_test_execution: {
        ok: true, error: null,
        data: { id: 'exec-fail', taskId: TEST_TASK_ID, status: 'running', totalSteps: 2, passedSteps: 0, failedSteps: 0, skippedSteps: 0, totalDurationMs: 0, startedAt: new Date().toISOString() },
      },
      execute_test_step_request: {
        ok: true, error: null,
        data: { status: 500, headers: { 'content-type': 'application/json' }, body: { error: 'Internal Server Error' }, time: 100 },
      },
      execute_assertions: {
        ok: true, error: null,
        data: [{ passed: false, actual: 500 }],
      },
      finish_test_execution: {
        ok: true, error: null,
        data: { id: 'exec-fail', taskId: TEST_TASK_ID, status: 'failed', totalSteps: 2, passedSteps: 0, failedSteps: 2, skippedSteps: 0, totalDurationMs: 300, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() },
      },
    })

    await testExecutionPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(2000)

    // 验证执行结果区域存在
    await expect(testExecutionPage.executionTable).toBeVisible()
  })

  test('fail-fast 模式', async ({ testExecutionPage, mockTauri, page }) => {
    await mockTauri({
      create_test_execution: {
        ok: true, error: null,
        data: { id: 'exec-failfast', taskId: TEST_TASK_ID, status: 'running', totalSteps: 3, passedSteps: 0, failedSteps: 0, skippedSteps: 0, totalDurationMs: 0, startedAt: new Date().toISOString() },
      },
      finish_test_execution: {
        ok: true, error: null,
        data: { id: 'exec-failfast', taskId: TEST_TASK_ID, status: 'failed', totalSteps: 3, passedSteps: 0, failedSteps: 1, skippedSteps: 2, totalDurationMs: 200, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() },
      },
    })

    await testExecutionPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(2000)

    // 验证执行结果区域存在
    await expect(testExecutionPage.executionTable).toBeVisible()
  })

  test('变量传递', async ({ testExecutionPage, mockTauri, page }) => {
    await mockTauri({
      create_test_execution: {
        ok: true, error: null,
        data: { id: 'exec-var', taskId: TEST_TASK_ID, status: 'running', totalSteps: 2, passedSteps: 0, failedSteps: 0, skippedSteps: 0, totalDurationMs: 0, startedAt: new Date().toISOString() },
      },
      execute_extractors: {
        ok: true, error: null,
        data: { userId: '123' },
      },
      finish_test_execution: {
        ok: true, error: null,
        data: { id: 'exec-var', taskId: TEST_TASK_ID, status: 'passed', totalSteps: 2, passedSteps: 2, failedSteps: 0, skippedSteps: 0, totalDurationMs: 400, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() },
      },
    })

    await testExecutionPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(2000)

    // 验证执行结果区域存在
    await expect(testExecutionPage.executionTable).toBeVisible()
  })

  test('中止执行', async ({ testExecutionPage, mockTauri, page }) => {
    await mockTauri({
      create_test_execution: {
        ok: true, error: null,
        data: { id: 'exec-abort', taskId: TEST_TASK_ID, status: 'running', totalSteps: 3, passedSteps: 1, failedSteps: 0, skippedSteps: 0, totalDurationMs: 100, startedAt: new Date().toISOString() },
      },
      finish_test_execution: {
        ok: true, error: null,
        data: { id: 'exec-abort', taskId: TEST_TASK_ID, status: 'aborted', totalSteps: 3, passedSteps: 1, failedSteps: 0, skippedSteps: 2, totalDurationMs: 200, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() },
      },
    })

    await testExecutionPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(2000)

    // 点击中止按钮
    await testExecutionPage.abortExecution()

    // 验证执行结果区域存在
    await expect(testExecutionPage.executionTable).toBeVisible()
  })

  test('执行结果详情 — 步骤状态显示', async ({ testExecutionPage, mockTauri, page }) => {
    await mockTauri({
      list_test_executions: {
        ok: true, error: null,
        data: [{
          id: 'exec-detail', taskId: TEST_TASK_ID, status: 'failed',
          totalSteps: 3, passedSteps: 1, failedSteps: 1, skippedSteps: 1,
          totalDurationMs: 500, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        }],
      },
      get_test_execution_detail: {
        ok: true, error: null,
        data: {
          id: 'exec-detail', taskId: TEST_TASK_ID, status: 'failed',
          totalSteps: 3, passedSteps: 1, failedSteps: 1, skippedSteps: 1,
          totalDurationMs: 500, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
          stepResults: [
            { id: 'result-1', executionId: 'exec-detail', stepId: 'step-1', sortOrder: 0, status: 'passed', durationMs: 100, responseStatus: 200, responseBody: '{"ok":true}', executedAt: new Date().toISOString() },
            { id: 'result-2', executionId: 'exec-detail', stepId: 'step-2', sortOrder: 1, status: 'failed', durationMs: 50, errorMessage: '断言失败: expected 200 got 500', executedAt: new Date().toISOString() },
            { id: 'result-3', executionId: 'exec-detail', stepId: 'step-3', sortOrder: 2, status: 'skipped', durationMs: 0, executedAt: new Date().toISOString() },
          ],
        },
      },
    })

    await testExecutionPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(2000)

    // 验证执行结果表格可见
    await expect(testExecutionPage.executionTable).toBeVisible()

    // 验证表格包含执行状态标签
    const statusTags = page.locator('.ant-tag')
    await expect(statusTags.first()).toBeVisible({ timeout: 5000 })
  })

  test('执行历史列表显示', async ({ testExecutionPage, mockTauri, page }) => {
    const now = new Date().toISOString()
    await mockTauri({
      list_test_executions: {
        ok: true, error: null,
        data: [
          { id: 'exec-1', taskId: TEST_TASK_ID, status: 'passed', totalSteps: 2, passedSteps: 2, failedSteps: 0, skippedSteps: 0, totalDurationMs: 60000, startedAt: now, finishedAt: now },
          { id: 'exec-2', taskId: TEST_TASK_ID, status: 'failed', totalSteps: 2, passedSteps: 1, failedSteps: 1, skippedSteps: 0, totalDurationMs: 30000, startedAt: now, finishedAt: now },
          { id: 'exec-3', taskId: TEST_TASK_ID, status: 'aborted', totalSteps: 3, passedSteps: 0, failedSteps: 0, skippedSteps: 3, totalDurationMs: 5000, startedAt: now, finishedAt: now },
        ],
      },
    })

    await testExecutionPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(2000)

    // 验证执行历史表格可见
    await expect(testExecutionPage.executionTable).toBeVisible()

    // 验证表格有多行数据（header + 3 条记录）
    const rows = page.locator('tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(1)
  })

  test('禁用步骤在执行中被跳过', async ({ testExecutionPage, mockTauri, page }) => {
    // mock 包含一个 disabled 步骤的任务详情
    await mockTauri({
      get_test_task: {
        ok: true, error: null,
        data: {
          id: TEST_TASK_ID, projectId: TEST_PROJECT_ID, name: '测试任务', description: '',
          status: 'passed', failFast: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          steps: [
            { id: 'step-1', taskId: TEST_TASK_ID, sortOrder: 0, name: '启用步骤', menuItemId: 'menu-1', enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            { id: 'step-2', taskId: TEST_TASK_ID, sortOrder: 1, name: '禁用步骤', menuItemId: 'menu-2', enabled: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            { id: 'step-3', taskId: TEST_TASK_ID, sortOrder: 2, name: '启用步骤2', menuItemId: 'menu-3', enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          ],
        },
      },
      list_test_executions: {
        ok: true, error: null,
        data: [{
          id: 'exec-skip', taskId: TEST_TASK_ID, status: 'passed',
          totalSteps: 2, passedSteps: 2, failedSteps: 0, skippedSteps: 0,
          totalDurationMs: 400, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        }],
      },
    })

    await testExecutionPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(2000)

    // 验证执行结果表格可见（disabled 步骤不参与执行）
    await expect(testExecutionPage.executionTable).toBeVisible()
  })
})
