import { test, expect } from '../fixtures/base'
import { testTaskData, TEST_PROJECT_ID } from '../fixtures/test-data'

test.describe('任务 CRUD 测试', () => {
  test.beforeEach(async ({ mockTauri }) => {
    await mockTauri()
  })

  test('创建测试任务', async ({ taskListPage, page }) => {
    await taskListPage.goto(TEST_PROJECT_ID)
    await page.waitForTimeout(2000)

    // 点击创建按钮
    await taskListPage.createButton.click()

    // 填写表单
    await taskListPage.taskNameInput.fill(testTaskData.valid.name)
    await taskListPage.taskDescriptionInput.fill(testTaskData.valid.description)

    // 提交表单
    await taskListPage.submitButton.click()

    // 验证任务已创建（表格中显示）
    await expect(taskListPage.taskTable).toBeVisible()
  })

  test('创建任务验证失败', async ({ taskListPage, page }) => {
    await taskListPage.goto(TEST_PROJECT_ID)
    await page.waitForTimeout(2000)

    // 点击创建按钮
    await taskListPage.createButton.click()

    // 不填写名称，直接提交
    await taskListPage.submitButton.click()

    // 验证错误提示
    await expect(taskListPage.page.getByText(/请输入|必填|名称不能为空/)).toBeVisible()
  })

  test('查看任务列表', async ({ taskListPage, page }) => {
    await taskListPage.goto(TEST_PROJECT_ID)
    await page.waitForTimeout(2000)

    // 验证列表加载
    await expect(taskListPage.taskTable).toBeVisible()

    // 验证状态标签显示
    await expect(taskListPage.page.getByText(/通过|失败|待执行/).first()).toBeVisible()
  })

  test('删除任务', async ({ taskListPage, page }) => {
    await taskListPage.goto(TEST_PROJECT_ID)
    await page.waitForTimeout(2000)

    // 获取任务数量
    const initialCount = await taskListPage.getTaskCount()

    // 点击删除按钮
    await taskListPage.deleteTask('测试任务 1')

    // 验证任务已移除
    const finalCount = await taskListPage.getTaskCount()
    expect(finalCount).toBeLessThan(initialCount)
  })

  test('导航到任务详情', async ({ taskListPage, page }) => {
    await taskListPage.goto(TEST_PROJECT_ID)
    await page.waitForTimeout(2000)

    // 点击任务名称
    await taskListPage.clickTask('测试任务 1')

    // 验证跳转到编辑器
    await expect(taskListPage.page).toHaveURL(/\/tests\/task-1/)
  })
})
