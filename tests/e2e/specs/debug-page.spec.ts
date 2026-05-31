import { test } from '@playwright/test'
import { mockTauriInvoke, createDefaultMocks } from '../helpers/mock-tauri'

test('检查流程编辑器页面', async ({ page }) => {
  await mockTauriInvoke(page, createDefaultMocks())

  await page.goto('http://localhost:1420/#/projects/project-1')
  await page.waitForTimeout(3000)
  await page.goto('http://localhost:1420/#/projects/project-1/tests/task-1')
  await page.waitForTimeout(5000)

  console.log('URL:', page.url())
  const body = await page.locator('body').innerText()
  console.log('Body (500):', body.substring(0, 500))

  const rf = page.locator('.react-flow')
  console.log('ReactFlow:', await rf.count())

  const btns = await page.locator('button').allTextContents()
  console.log('Buttons:', JSON.stringify(btns))

  const undoBtn = page.getByRole('button', { name: /撤销/ })
  console.log('Undo:', await undoBtn.count())

  await page.screenshot({ path: 'test-results/flow-editor.png', fullPage: true })
})
