import { test, expect } from '../fixtures/base'
import { TEST_PROJECT_ID, TEST_TASK_ID } from '../fixtures/test-data'

test.describe('撤销/重做测试', () => {
  test.beforeEach(async ({ mockTauri }) => {
    await mockTauri()
  })

  test('添加节点后撤销', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 获取初始节点数量
    const initialNodeCount = await flowEditorPage.getNodeCount()

    // 添加一个节点
    await flowEditorPage.dragNodeFromPalette('HTTP 请求')

    // 验证节点已添加
    const afterAddCount = await flowEditorPage.getNodeCount()
    expect(afterAddCount).toBeGreaterThan(initialNodeCount)

    // 点击撤销按钮
    await flowEditorPage.undo()

    // 验证节点已移除
    const afterUndoCount = await flowEditorPage.getNodeCount()
    expect(afterUndoCount).toBe(initialNodeCount)
  })

  test('撤销后重做', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 获取初始节点数量
    const initialNodeCount = await flowEditorPage.getNodeCount()

    // 添加一个节点
    await flowEditorPage.dragNodeFromPalette('HTTP 请求')

    // 验证节点已添加
    const afterAddCount = await flowEditorPage.getNodeCount()
    expect(afterAddCount).toBeGreaterThan(initialNodeCount)

    // 点击撤销按钮
    await flowEditorPage.undo()

    // 验证节点已移除
    const afterUndoCount = await flowEditorPage.getNodeCount()
    expect(afterUndoCount).toBe(initialNodeCount)

    // 点击重做按钮
    await flowEditorPage.redo()

    // 验证节点已恢复
    const afterRedoCount = await flowEditorPage.getNodeCount()
    expect(afterRedoCount).toBe(afterAddCount)
  })

  test('连续撤销', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 获取初始节点数量
    const initialNodeCount = await flowEditorPage.getNodeCount()

    // 添加多个节点
    await flowEditorPage.dragNodeFromPalette('HTTP 请求')
    await flowEditorPage.dragNodeFromPalette('条件判断')
    await flowEditorPage.dragNodeFromPalette('等待')

    // 验证节点已添加
    const afterAddCount = await flowEditorPage.getNodeCount()
    expect(afterAddCount).toBe(initialNodeCount + 3)

    // 连续撤销 3 次
    await flowEditorPage.undo()
    await flowEditorPage.undo()
    await flowEditorPage.undo()

    // 验证所有节点已移除
    const afterUndoCount = await flowEditorPage.getNodeCount()
    expect(afterUndoCount).toBe(initialNodeCount)
  })

  test('撤销按钮禁用状态', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 验证初始状态下撤销按钮禁用
    const isUndoEnabledInitially = await flowEditorPage.isUndoEnabled()
    expect(isUndoEnabledInitially).toBe(false)

    // 验证初始状态下重做按钮禁用
    const isRedoEnabledInitially = await flowEditorPage.isRedoEnabled()
    expect(isRedoEnabledInitially).toBe(false)

    // 添加一个节点
    await flowEditorPage.dragNodeFromPalette('HTTP 请求')

    // 验证撤销按钮启用
    const isUndoEnabledAfterAdd = await flowEditorPage.isUndoEnabled()
    expect(isUndoEnabledAfterAdd).toBe(true)

    // 点击撤销
    await flowEditorPage.undo()

    // 验证重做按钮启用
    const isRedoEnabledAfterUndo = await flowEditorPage.isRedoEnabled()
    expect(isRedoEnabledAfterUndo).toBe(true)

    // 验证撤销按钮禁用（已撤销所有操作）
    const isUndoEnabledAfterUndo = await flowEditorPage.isUndoEnabled()
    expect(isUndoEnabledAfterUndo).toBe(false)
  })
})
