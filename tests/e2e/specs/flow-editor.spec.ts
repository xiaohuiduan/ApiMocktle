import { test, expect } from '../fixtures/base'
import { flowGraphData, TEST_PROJECT_ID, TEST_TASK_ID } from '../fixtures/test-data'

test.describe('流程编辑器测试', () => {
  test.beforeEach(async ({ mockTauri }) => {
    await mockTauri({
      load_test_flow_graph: {
        ok: true, error: null,
        data: flowGraphData.simple,
      },
    })
  })

  test('编辑器加载', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 验证画布渲染且可见
    await expect(flowEditorPage.canvas).toBeVisible()
  })

  test('画布必须有有效尺寸（高度 > 0）', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 画布容器必须有非零尺寸，否则真实用户无法拖拽节点到画布
    const canvas = flowEditorPage.canvas
    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).not.toBeNull()
    expect(canvasBox!.width).toBeGreaterThan(100)
    expect(canvasBox!.height).toBeGreaterThan(100)

    // 画布内部的 flow-canvas 容器也必须有尺寸
    const flowCanvasContainer = page.locator('[data-testid="flow-canvas"]')
    const containerBox = await flowCanvasContainer.boundingBox()
    expect(containerBox).not.toBeNull()
    expect(containerBox!.width).toBeGreaterThan(100)
    expect(containerBox!.height).toBeGreaterThan(100)
  })

  test('节点面板与画布并排显示，均有有效宽度', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 节点面板宽度约 200px
    const paletteBox = await flowEditorPage.nodePalette.boundingBox()
    expect(paletteBox).not.toBeNull()
    expect(paletteBox!.width).toBeGreaterThan(100)

    // 画布宽度应大于面板（占剩余空间）
    const canvasBox = await flowEditorPage.canvas.boundingBox()
    expect(canvasBox).not.toBeNull()
    expect(canvasBox!.width).toBeGreaterThan(paletteBox!.width)
  })

  test('工具栏按钮状态', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 验证运行按钮可用
    await expect(flowEditorPage.runButton).toBeEnabled()

    // 验证保存按钮可用
    await expect(flowEditorPage.saveButton).toBeEnabled()

    // 验证导出按钮可用
    await expect(flowEditorPage.exportButton).toBeEnabled()

    // 验证清空按钮可用
    await expect(flowEditorPage.clearButton).toBeEnabled()
  })

  test('导出流程', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 设置下载事件监听
    const downloadPromise = page.waitForEvent('download')

    // 点击导出按钮
    await flowEditorPage.exportFlow()

    // 验证下载触发
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.json$/)
  })

  test('清空画布', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 获取初始节点数量
    const initialNodeCount = await flowEditorPage.getNodeCount()

    // 点击清空按钮
    await flowEditorPage.clearCanvas()

    // 验证节点已移除
    const finalNodeCount = await flowEditorPage.getNodeCount()
    expect(finalNodeCount).toBeLessThan(initialNodeCount)
  })

  test('保存流程', async ({ flowEditorPage, page, mockTauri }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 监听 invoke 调用
    let saveCalled = false
    await page.evaluate(() => {
      const origInvoke = (window as any).__TAURI_INTERNALS__.invoke
      ;(window as any).__TAURI_INTERNALS__.invoke = async (cmd: string, args: any) => {
        if (cmd === 'save_test_flow_graph') {
          ;(window as any).__SAVE_CALLED__ = true
          ;(window as any).__SAVE_ARGS__ = args
        }
        return origInvoke(cmd, args)
      }
    })

    // 先拖拽一个节点使流程变脏
    await flowEditorPage.dragNodeFromPalette('HTTP 请求')
    await page.waitForTimeout(500)

    // 点击保存按钮
    await flowEditorPage.saveButton.click()
    await page.waitForTimeout(1000)

    // 验证保存被调用
    const saveResult = await page.evaluate(() => (window as any).__SAVE_CALLED__)
    expect(saveResult).toBe(true)
  })

  test('缩放和适应视图按钮可用', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 验证缩放按钮存在且可用
    const zoomInBtn = page.locator('[data-testid="toolbar-zoom-in"]')
    const zoomOutBtn = page.locator('[data-testid="toolbar-zoom-out"]')
    const fitViewBtn = page.locator('[data-testid="toolbar-fit-view"]')

    await expect(zoomInBtn).toBeVisible()
    await expect(zoomOutBtn).toBeVisible()
    await expect(fitViewBtn).toBeVisible()
  })

  test('验证和自动布局按钮可用', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 验证验证按钮
    const validateBtn = page.locator('[data-testid="toolbar-validate"]')
    const autoLayoutBtn = page.locator('[data-testid="toolbar-auto-layout"]')

    await expect(validateBtn).toBeVisible()
    await expect(autoLayoutBtn).toBeVisible()
  })

  test('导入按钮可用', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 验证导入按钮存在
    const importBtn = page.locator('[data-testid="toolbar-import"]')
    await expect(importBtn).toBeVisible()
  })

  test('运行/中止按钮状态切换', async ({ flowEditorPage, page }) => {
    await flowEditorPage.goto(TEST_PROJECT_ID, TEST_TASK_ID)
    await page.waitForTimeout(3000)

    // 初始状态：运行可用，中止禁用
    await expect(flowEditorPage.runButton).toBeEnabled()
    await expect(flowEditorPage.abortButton).toBeDisabled()
  })
})
