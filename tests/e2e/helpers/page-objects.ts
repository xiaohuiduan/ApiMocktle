import type { Page, Locator } from '@playwright/test'

const BASE_URL = 'http://localhost:1420'

/**
 * 登录页面对象（仅在需要测试登录流程时使用）
 */
export class LoginPage {
  readonly page: Page
  readonly usernameInput: Locator
  readonly passwordInput: Locator
  readonly loginButton: Locator

  constructor(page: Page) {
    this.page = page
    this.usernameInput = page.getByPlaceholder('请输入用户名')
    this.passwordInput = page.getByPlaceholder('请输入密码')
    this.loginButton = page.getByRole('button', { name: /登\s*录/ })
  }

  async goto() {
    await this.page.goto(`${BASE_URL}/#/login`)
    await this.page.waitForLoadState('networkidle')
  }

  async login(username = 'admin', password = 'admin123') {
    await this.goto()
    await this.usernameInput.fill(username)
    await this.passwordInput.fill(password)
    await this.loginButton.click()
    await this.page.waitForTimeout(3000)
  }
}

/**
 * 任务列表页面对象
 *
 * 导航策略：应用的 ProjectTabs 管理器会在打开项目时重定向到 /home，
 * 所以需要先打开项目，再通过侧边栏"自动化测试"链接导航到测试页面。
 */
export class TaskListPage {
  readonly page: Page
  readonly createButton: Locator
  readonly taskTable: Locator
  readonly taskNameInput: Locator
  readonly taskDescriptionInput: Locator
  readonly submitButton: Locator
  readonly cancelButton: Locator
  readonly deleteConfirmButton: Locator

  constructor(page: Page) {
    this.page = page
    this.createButton = page.getByRole('button', { name: /创建测试任务/ })
    this.taskTable = page.locator('.ant-table')
    this.taskNameInput = page.getByLabel('任务名称')
    this.taskDescriptionInput = page.locator('textarea[placeholder*="任务描述"]')
    // antd Modal 按钮文字中间有空格："创 建"、"取 消"
    this.submitButton = page.locator('.ant-modal-footer button').filter({ hasText: /创\s*建/ })
    this.cancelButton = page.locator('.ant-modal-footer button').filter({ hasText: /取\s*消/ })
    // antd Popconfirm 按钮文字："确 定"
    this.deleteConfirmButton = page.locator('.ant-popover button').filter({ hasText: /确\s*定/ })
  }

  async goto(projectId = 'project-1') {
    // 先导航到项目（会自动重定向到 /home）
    await this.page.goto(`${BASE_URL}/#/projects/${projectId}`)
    await this.page.waitForLoadState('networkidle')
    await this.page.waitForTimeout(2000)

    // 通过侧边栏导航到"自动化测试"
    const testsLink = this.page.locator('a[href*="/tests"]').first()
    await testsLink.click()
    await this.page.waitForLoadState('networkidle')
    await this.page.waitForTimeout(1000)
  }

  async createTask(name: string, description?: string) {
    await this.createButton.click()
    await this.page.waitForTimeout(500)
    await this.taskNameInput.fill(name)
    if (description) {
      await this.taskDescriptionInput.fill(description)
    }
    await this.submitButton.click()
    await this.page.waitForTimeout(1000)
  }

  async deleteTask(name: string) {
    const row = this.page.getByRole('row', { name: new RegExp(name) })
    await row.getByRole('button', { name: /删除/ }).click()
    await this.page.waitForTimeout(500)
    await this.page.locator('.ant-popover button').filter({ hasText: /确\s*定/ }).click()
    await this.page.waitForTimeout(1000)
  }

  async getTaskRow(name: string) {
    return this.page.getByRole('row', { name: new RegExp(name) })
  }

  async clickTask(name: string) {
    const link = this.page.locator('a').filter({ hasText: name })
    await link.click()
    await this.page.waitForLoadState('networkidle')
  }

  async getTaskCount() {
    const rows = this.page.locator('tbody tr')
    return rows.count()
  }
}

/**
 * 流程编辑器页面对象
 */
export class FlowEditorPage {
  readonly page: Page
  readonly canvas: Locator
  readonly toolbar: Locator
  readonly nodePalette: Locator
  readonly undoButton: Locator
  readonly redoButton: Locator
  readonly runButton: Locator
  readonly abortButton: Locator
  readonly saveButton: Locator
  readonly exportButton: Locator
  readonly clearButton: Locator

  constructor(page: Page) {
    this.page = page
    this.canvas = page.locator('.react-flow')
    this.toolbar = page.locator('[data-testid="flow-toolbar"]')
    this.nodePalette = page.locator('[data-testid="node-palette"]')
    this.undoButton = page.getByRole('button', { name: /撤销/ })
    this.redoButton = page.getByRole('button', { name: /重做/ })
    this.runButton = page.getByRole('button', { name: /运行/ })
    this.abortButton = page.getByRole('button', { name: /中止/ })
    this.saveButton = page.getByRole('button', { name: /保存/ })
    this.exportButton = page.getByRole('button', { name: /导出/ })
    this.clearButton = page.getByRole('button', { name: /清空/ })
  }

  async goto(projectId = 'project-1', taskId = 'task-1') {
    // 先导航到项目（会自动重定向到 /home）
    await this.page.goto(`${BASE_URL}/#/projects/${projectId}`)
    await this.page.waitForLoadState('networkidle')
    await this.page.waitForTimeout(2000)

    // 导航到任务详情（通过 Link 点击或直接导航）
    await this.page.goto(`${BASE_URL}/#/projects/${projectId}/tests/${taskId}`)
    await this.page.waitForLoadState('networkidle')
    await this.page.waitForTimeout(1000)
  }

  async dragNodeFromPalette(nodeType: string) {
    const nodeItem = this.nodePalette.getByText(nodeType)
    const canvas = this.canvas
    await nodeItem.dragTo(canvas)
    await this.page.waitForTimeout(500)
  }

  async clickNode(nodeId: string) {
    const node = this.page.locator(`[data-id="${nodeId}"]`)
    await node.click()
  }

  async configureNode(config: Record<string, unknown>) {
    const drawer = this.page.locator('.ant-drawer')
    await drawer.waitFor({ state: 'visible' })

    if (config.label) {
      await this.page.getByLabel(/标签|名称/).fill(config.label as string)
    }
    if (config.method) {
      await this.page.getByLabel(/方法|method/).click()
      await this.page.getByText(config.method as string).click()
    }
    if (config.url) {
      await this.page.getByLabel(/URL|地址/).fill(config.url as string)
    }
  }

  async undo() {
    await this.undoButton.click()
    await this.page.waitForTimeout(300)
  }

  async redo() {
    await this.redoButton.click()
    await this.page.waitForTimeout(300)
  }

  async runFlow() {
    await this.runButton.click()
    await this.page.waitForLoadState('networkidle')
  }

  async saveFlow() {
    await this.saveButton.click()
    await this.page.waitForLoadState('networkidle')
  }

  async exportFlow() {
    await this.exportButton.click()
  }

  async clearCanvas() {
    await this.clearButton.click()
    await this.page.getByRole('button', { name: /确定|确认/ }).click()
    await this.page.waitForTimeout(500)
  }

  async getNodeCount() {
    return this.page.locator('.react-flow__node').count()
  }

  async getEdgeCount() {
    return this.page.locator('.react-flow__edge').count()
  }

  async isUndoEnabled() {
    return !(await this.undoButton.isDisabled())
  }

  async isRedoEnabled() {
    return !(await this.redoButton.isDisabled())
  }

  // ---- 节点配置抽屉 ----

  async clickNodeById(nodeId: string) {
    const node = this.page.locator(`[data-id="${nodeId}"]`)
    await node.click()
    await this.page.waitForTimeout(500)
  }

  async getNodeConfigDrawer() {
    return this.page.locator('[data-testid="node-config-drawer"]')
  }

  async getNodeLabelInput() {
    return this.page.locator('[data-testid="node-label-input"] input')
  }

  async getNodeEnabledSwitch() {
    return this.page.locator('[data-testid="node-enabled-switch"]')
  }

  async getNodeTypeTag() {
    const drawer = this.getNodeConfigDrawer()
    return drawer.locator('.ant-tag')
  }

  async editNodeLabel(newLabel: string) {
    const input = this.getNodeLabelInput()
    await input.clear()
    await input.fill(newLabel)
    await this.page.waitForTimeout(300)
  }

  async closeDrawer() {
    const drawer = this.getNodeConfigDrawer()
    await drawer.locator('.ant-drawer-close').click()
    await this.page.waitForTimeout(300)
  }

  // ---- 节点操作 ----

  async deleteSelectedNode() {
    await this.page.keyboard.press('Delete')
    await this.page.waitForTimeout(500)
  }

  async getNodeById(nodeId: string) {
    return this.page.locator(`[data-id="${nodeId}"]`)
  }

  async getNodeLabel(nodeId: string) {
    const node = this.getNodeById(nodeId)
    return node.locator('.react-flow__node-label, [class*="label"]').first().textContent()
  }
}

/**
 * 测试执行页面对象
 */
export class TestExecutionPage {
  readonly page: Page
  readonly executionTable: Locator
  readonly executionStatus: Locator
  readonly abortButton: Locator
  readonly progressBar: Locator

  constructor(page: Page) {
    this.page = page
    this.executionTable = page.locator('.ant-table')
    this.executionStatus = page.locator('[data-testid="execution-status"]')
    this.abortButton = page.getByRole('button', { name: /中止|停止|abort/ })
    this.progressBar = page.locator('.ant-progress')
  }

  async goto(projectId = 'project-1', taskId = 'task-1') {
    // 先导航到项目
    await this.page.goto(`${BASE_URL}/#/projects/${projectId}`)
    await this.page.waitForLoadState('networkidle')
    await this.page.waitForTimeout(2000)

    // 导航到任务详情
    await this.page.goto(`${BASE_URL}/#/projects/${projectId}/tests/${taskId}`)
    await this.page.waitForLoadState('networkidle')
    await this.page.waitForTimeout(1000)
  }

  async getExecutionCount() {
    const rows = this.page.getByRole('row')
    return rows.count()
  }

  async getLatestExecutionStatus() {
    const firstRow = this.page.getByRole('row').nth(1)
    return firstRow.getByTestId('status-badge').textContent()
  }

  async abortExecution() {
    await this.abortButton.click()
    await this.page.waitForLoadState('networkidle')
  }
}
