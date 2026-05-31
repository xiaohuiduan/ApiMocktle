import { test as base, type Page } from '@playwright/test'
import {
  mockTauriInvoke,
  updateMockData,
  createDefaultMocks,
  type MockResponseData,
} from '../helpers/mock-tauri'
import { TaskListPage, FlowEditorPage, TestExecutionPage } from '../helpers/page-objects'

type TestFixtures = {
  taskListPage: TaskListPage
  flowEditorPage: FlowEditorPage
  testExecutionPage: TestExecutionPage
  mockTauri: (overrides?: MockResponseData) => Promise<void>
}

export const test = base.extend<TestFixtures>({
  taskListPage: async ({ page }, use) => {
    await use(new TaskListPage(page))
  },

  flowEditorPage: async ({ page }, use) => {
    await use(new FlowEditorPage(page))
  },

  testExecutionPage: async ({ page }, use) => {
    await use(new TestExecutionPage(page))
  },

  // mockTauri fixture: 首次调用注入完整 mock，后续调用只更新差异
  mockTauri: async ({ page }, use) => {
    let initialized = false
    const mockFn = async (overrides?: MockResponseData) => {
      if (!initialized) {
        const merged = overrides
          ? { ...createDefaultMocks(), ...overrides }
          : createDefaultMocks()
        await mockTauriInvoke(page, merged)
        initialized = true
      } else if (overrides) {
        await updateMockData(page, overrides)
      }
    }
    await use(mockFn)
  },
})

export { expect } from '@playwright/test'

export async function setupPageWithMocks(page: Page, overrides?: MockResponseData) {
  const merged = overrides
    ? { ...createDefaultMocks(), ...overrides }
    : createDefaultMocks()
  await mockTauriInvoke(page, merged)
}

export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
}
