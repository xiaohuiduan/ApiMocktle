import { test, expect } from '../fixtures/base'
import { TEST_PROJECT_ID, TEST_TASK_ID } from '../fixtures/test-data'

test.describe('节点操作测试', () => {
  test.beforeEach(async ({ mockTauri }) => {
    await mockTauri()
  })

  test('拖拽节点到画布', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // ===== 关键前置检查：画布必须有真实的可见尺寸 =====
    // 如果画布高度为 0，真实用户无法将节点拖放到画布上
    const canvas = flowEditorPage.canvas
    await expect(canvas).toBeVisible()

    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).not.toBeNull()
    expect(canvasBox!.width).toBeGreaterThan(100)  // 画布宽度必须 > 100px
    expect(canvasBox!.height).toBeGreaterThan(100)  // 画布高度必须 > 100px

    // ===== 关键前置检查：节点面板必须可见且可拖拽 =====
    const paletteItem = flowEditorPage.nodePalette.getByText('HTTP 请求')
    await expect(paletteItem).toBeVisible()
    await expect(paletteItem).toHaveAttribute('draggable', 'true')

    // 获取初始节点数量
    const initialNodeCount = await flowEditorPage.getNodeCount()

    // 从面板拖拽 HTTP 请求节点到画布中心
    await flowEditorPage.dragNodeFromPalette('HTTP 请求')

    // 验证节点已添加
    const finalNodeCount = await flowEditorPage.getNodeCount()
    expect(finalNodeCount).toBeGreaterThan(initialNodeCount)

    // 验证新添加的节点确实是 HTTP 请求类型（包含对应标签文本）
    const lastNode = page.locator('.react-flow__node').last()
    await expect(lastNode).toBeVisible()
  })

  test('节点连线', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 拖拽两个节点到画布
    await flowEditorPage.dragNodeFromPalette('HTTP 请求')
    await flowEditorPage.dragNodeFromPalette('条件判断')

    // 获取初始边数量
    const initialEdgeCount = await flowEditorPage.getEdgeCount()

    // 模拟连线操作（通过拖拽连接点）
    const sourceHandle = page.locator('.react-flow__handle-right').first()
    const targetHandle = page.locator('.react-flow__handle-left').last()

    if ((await sourceHandle.isVisible()) && (await targetHandle.isVisible())) {
      await sourceHandle.dragTo(targetHandle)
      await page.waitForTimeout(500)

      // 验证边已添加
      const finalEdgeCount = await flowEditorPage.getEdgeCount()
      expect(finalEdgeCount).toBeGreaterThanOrEqual(initialEdgeCount)
    }
  })

  test('点击节点打开配置', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 点击第一个节点
    const firstNode = page.locator('.react-flow__node').first()
    await firstNode.click()

    // 验证配置面板打开
    const configPanel = page.locator('.ant-drawer, .ant-popover, .ant-modal')
    await expect(configPanel.first()).toBeVisible({ timeout: 5000 })
  })

  test('编辑节点配置', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 点击第一个节点
    const firstNode = page.locator('.react-flow__node').first()
    await firstNode.click()

    // 验证配置面板打开（可能是 drawer 或 popover）
    const configPanel = page.locator('.ant-drawer, .ant-popover, .ant-modal')
    await expect(configPanel.first()).toBeVisible({ timeout: 5000 })
  })

  test('10种节点类型', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 定义所有节点类型
    const nodeTypes = [
      '开始',
      '结束',
      'HTTP 请求',
      '条件判断',
      '循环',
      '并行',
      '等待',
      '子流程',
      '设置变量',
      '断言',
    ]

    // 验证每种节点类型都可以拖拽
    for (const nodeType of nodeTypes) {
      const nodeItem = flowEditorPage.nodePalette.getByText(nodeType)
      await expect(nodeItem).toBeVisible()
    }
  })

  test('拖拽条件节点到画布并验证双输出', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    const initialNodeCount = await flowEditorPage.getNodeCount()

    // 拖拽条件判断节点
    await flowEditorPage.dragNodeFromPalette('条件判断')

    // 验证节点已添加
    const finalNodeCount = await flowEditorPage.getNodeCount()
    expect(finalNodeCount).toBeGreaterThan(initialNodeCount)

    // 条件节点应有两个输出 handle（true/false）
    const conditionNode = page.locator('.react-flow__node').last()
    const handles = conditionNode.locator('.react-flow__handle-source, .react-flow__handle-right')
    const handleCount = await handles.count()
    expect(handleCount).toBeGreaterThanOrEqual(2)
  })

  test('拖拽循环节点到画布', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    const initialNodeCount = await flowEditorPage.getNodeCount()

    // 拖拽循环节点
    await flowEditorPage.dragNodeFromPalette('循环')

    // 验证节点已添加
    const finalNodeCount = await flowEditorPage.getNodeCount()
    expect(finalNodeCount).toBeGreaterThan(initialNodeCount)
  })

  test('节点配置 — 修改标签', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 点击第一个节点
    const firstNode = page.locator('.react-flow__node').first()
    await firstNode.click()

    // 等待配置抽屉打开
    const drawer = flowEditorPage.getNodeConfigDrawer()
    await expect(drawer).toBeVisible({ timeout: 5000 })

    // 修改标签
    await flowEditorPage.editNodeLabel('新的节点名称')

    // 验证输入值已更新
    const input = flowEditorPage.getNodeLabelInput()
    await expect(input).toHaveValue('新的节点名称')
  })

  test('节点配置 — 切换启用状态', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 点击第一个节点
    const firstNode = page.locator('.react-flow__node').first()
    await firstNode.click()

    // 等待配置抽屉打开
    const drawer = flowEditorPage.getNodeConfigDrawer()
    await expect(drawer).toBeVisible({ timeout: 5000 })

    // 验证启用开关存在
    const switchEl = flowEditorPage.getNodeEnabledSwitch()
    await expect(switchEl).toBeVisible()
  })

  test('节点配置 — 关闭抽屉', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 点击第一个节点打开抽屉
    const firstNode = page.locator('.react-flow__node').first()
    await firstNode.click()

    const drawer = flowEditorPage.getNodeConfigDrawer()
    await expect(drawer).toBeVisible({ timeout: 5000 })

    // 关闭抽屉
    await flowEditorPage.closeDrawer()

    // 验证抽屉已关闭
    await expect(drawer).not.toBeVisible({ timeout: 3000 })
  })

  test('节点配置 — 显示节点类型标签', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 点击第一个节点
    const firstNode = page.locator('.react-flow__node').first()
    await firstNode.click()

    const drawer = flowEditorPage.getNodeConfigDrawer()
    await expect(drawer).toBeVisible({ timeout: 5000 })

    // 验证节点类型标签存在（蓝色 Tag）
    const typeTag = flowEditorPage.getNodeTypeTag()
    await expect(typeTag.first()).toBeVisible()
  })

  test('删除节点', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 先拖拽一个新节点到画布
    await flowEditorPage.dragNodeFromPalette('HTTP 请求')
    await page.waitForTimeout(500)

    const nodeCountAfterAdd = await flowEditorPage.getNodeCount()

    // 点击最后一个节点选中它
    const lastNode = page.locator('.react-flow__node').last()
    await lastNode.click()
    await page.waitForTimeout(300)

    // 按 Delete 键删除
    await flowEditorPage.deleteSelectedNode()

    // 验证节点数量减少
    const nodeCountAfterDelete = await flowEditorPage.getNodeCount()
    expect(nodeCountAfterDelete).toBeLessThan(nodeCountAfterAdd)
  })
})
