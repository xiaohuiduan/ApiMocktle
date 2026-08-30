import { test, expect } from '@playwright/test'
import { mockTauriInvoke, createDefaultMocks } from '../helpers/mock-tauri'

/**
 * 目录树拖拽排序端到端测试。
 *
 * 背景:用户报告按住把手拖动出现「禁止符号」且无法落点。本测试在真实浏览器
 * (Chromium)中模拟 HTML5 拖拽,观察 rc-tree 的 drag 指示类与 move_menu_items
 * 调用,定位禁止符号来自哪一层(dragstart 未触发 / dragover 全拒 / onDrop)。
 */

function menuMocks() {
  const menuRawList = [
    { id: 'f1', parentId: null, name: '目录A', type: 'apiDetailFolder', sortOrder: 0 },
    { id: 'a1', parentId: null, name: '接口A', type: 'apiDetail', sortOrder: 1, data: { method: 'GET', path: '/a', name: '接口A' } },
    { id: 'a2', parentId: null, name: '接口B', type: 'apiDetail', sortOrder: 2, data: { method: 'POST', path: '/b', name: '接口B' } },
  ]

  return {
    ...createDefaultMocks(),
    get_project_state: {
      ok: true,
      error: null,
      data: {
        menuRawList,
        recyleRawData: { recycleItems: [] },
        projectEnvironments: [],
        projectEnvironmentConfig: { activeEnvironmentId: '', environments: [] },
      },
    },
  }
}

async function setup(page: import('@playwright/test').Page) {
  await mockTauriInvoke(page, menuMocks())
  // 深链不触发项目状态加载,需从项目列表点卡片进入(与真实用户路径一致)
  await page.goto('http://localhost:1420/#/projects')
  await page.locator('.ant-card', { hasText: '测试项目' }).first().click()
  await expect(page.locator('.ant-tree-treenode', { hasText: '接口A' })).toBeVisible({ timeout: 20000 })
}

async function dragByHandle(
  page: import('@playwright/test').Page,
  fromNode: ReturnType<typeof page.locator>,
  toNode: ReturnType<typeof page.locator>,
  toYRatio: number,
) {
  const handle = fromNode.locator('.drag-handle')
  await expect(handle).toHaveCount(1)

  const hb = await handle.boundingBox()
  const tb = await toNode.boundingBox()
  expect(hb).toBeTruthy()
  expect(tb).toBeTruthy()

  const startX = hb!.x + hb!.width / 2
  const startY = hb!.y + hb!.height / 2
  const endX = tb!.x + 200
  const endY = tb!.y + tb!.height * toYRatio

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // 分步移动:先小距离触发 dragstart,再移到目标
  await page.mouse.move(startX + 10, startY + 10, { steps: 4 })
  await page.mouse.move(endX, endY, { steps: 12 })

  // 观察拖拽中的 rc-tree 状态类(可放指示 / 全局禁止)
  const state = await page.evaluate(() => {
    const node = document.querySelector('.drag-over, .drag-over-gap-top, .drag-over-gap-bottom')
    return {
      indicator: node ? Array.from(node.classList).join(' ') : null,
    }
  })

  await page.mouse.up()

  return { indicator: state.indicator, startX, startY, endX, endY }
}

test('按住把手拖到同级接口下方 → 触发 move_menu_items(dropPosition=1)', async ({ page }) => {
  await setup(page)

  const a1 = page.locator('.ant-tree-treenode', { hasText: '接口A' }).first()
  const a2 = page.locator('.ant-tree-treenode', { hasText: '接口B' }).first()

  const { indicator } = await dragByHandle(page, a1, a2, 0.8)
  console.log('[DRAG] indicator:', indicator)

  const invoked = await page.evaluate(() => (window as any).__E2E_INVOKED__ ?? [])
  const moves = invoked.filter((c: { cmd: string }) => c.cmd === 'move_menu_items')
  console.log('[DRAG] move_menu_items calls:', JSON.stringify(moves))

  expect(moves.length).toBeGreaterThan(0)
  const payload = (moves.at(-1) as { args: { payload: { dragKey: string, dropKey: string, dropPosition: number } } }).args.payload
  expect(payload.dragKey).toBe('a1')
  expect(payload.dropKey).toBe('a2')
})

test('按住把手拖接口到目录上 → 触发 move_menu_items(dropPosition=0)', async ({ page }) => {
  await setup(page)

  const a1 = page.locator('.ant-tree-treenode', { hasText: '接口A' }).first()
  const folder = page.locator('.ant-tree-treenode', { hasText: '目录A' }).first()

  const { indicator } = await dragByHandle(page, a1, folder, 0.5)
  console.log('[DRAG-INTO] indicator:', indicator)

  const invoked = await page.evaluate(() => (window as any).__E2E_INVOKED__ ?? [])
  const moves = invoked.filter((c: { cmd: string }) => c.cmd === 'move_menu_items')
  console.log('[DRAG-INTO] move_menu_items calls:', JSON.stringify(moves))

  expect(moves.length).toBeGreaterThan(0)
  const payload = (moves.at(-1) as { args: { payload: { dragKey: string, dropKey: string, dropPosition: number } } }).args.payload
  expect(payload.dragKey).toBe('a1')
  expect(payload.dropKey).toBe('f1')
})

test('非把手区域按下不触发拖拽', async ({ page }) => {
  await setup(page)

  const a1 = page.locator('.ant-tree-treenode', { hasText: '接口A' }).first()
  const a2 = page.locator('.ant-tree-treenode', { hasText: '接口B' }).first()

  const nameEl = a1.locator('span', { hasText: '接口A' }).first()
  const nb = await nameEl.boundingBox()
  const tb = await a2.boundingBox()
  expect(nb).toBeTruthy()

  await page.mouse.move(nb!.x + 10, nb!.y + nb!.height / 2)
  await page.mouse.down()
  await page.mouse.move(tb!.x + 200, tb!.y + 10, { steps: 10 })
  await page.mouse.up()

  const invoked = await page.evaluate(() => (window as any).__E2E_INVOKED__ ?? [])
  expect(invoked.filter((c: { cmd: string }) => c.cmd === 'move_menu_items')).toHaveLength(0)
})
