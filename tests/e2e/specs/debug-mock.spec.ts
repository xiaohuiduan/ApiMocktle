import { test, expect } from '@playwright/test'
import { mockTauriInvoke, createDefaultMocks } from '../helpers/mock-tauri'

test('验证 mock 注入和项目页面加载', async ({ page }) => {
  const mockData = createDefaultMocks()
  await mockTauriInvoke(page, mockData)

  const unmockedCmds: string[] = []
  page.on('console', (msg) => {
    if (msg.text().includes('Unmocked')) unmockedCmds.push(msg.text())
  })

  await page.goto('http://localhost:1420/#/projects/project-1/tests')
  await page.waitForTimeout(5000)

  const bodyText = await page.locator('body').innerText()
  console.log('Body snippet:', bodyText.substring(0, 300))

  // 验证项目页面正确加载
  expect(bodyText).toContain('测试项目')
  expect(bodyText).toContain('自动化测试')
  expect(bodyText).not.toContain('Cannot read properties')
})
