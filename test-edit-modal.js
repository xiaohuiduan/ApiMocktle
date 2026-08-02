const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  // 监听控制台输出
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('Console Error:', msg.text())
    }
  })

  // 监听网络请求
  const requests = []
  page.on('request', (request) => {
    if (request.url().includes('ipc.localhost') || request.url().includes('invoke')) {
      requests.push({
        url: request.url(),
        method: request.method(),
      })
    }
  })

  try {
    // 1. 导航到测试任务页面
    console.log('1. 导航到测试任务页面...')
    await page.goto('http://localhost:1420', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // 截图当前页面
    await page.screenshot({ path: 'test-screenshot-1-home.png' })
    console.log('截图已保存: test-screenshot-1-home.png')

    // 2. 查找并点击测试任务
    console.log('2. 查找测试任务...')

    // 尝试点击"全功能测试用例"任务
    const taskLink = await page.locator('text=全功能测试用例').first()

    if (await taskLink.isVisible()) {
      await taskLink.click()
      await page.waitForTimeout(1000)
      await page.screenshot({ path: 'test-screenshot-2-task-detail.png' })
      console.log('截图已保存: test-screenshot-2-task-detail.png')
    }
    else {
      console.log('未找到测试任务，尝试查找项目...')
      // 点击项目
      const projectLink = await page.locator('text=测试apifox导入').first()

      if (await projectLink.isVisible()) {
        await projectLink.click()
        await page.waitForTimeout(1000)
        await page.screenshot({ path: 'test-screenshot-2-project.png' })
      }
    }

    // 3. 查找编辑按钮并点击
    console.log('3. 查找编辑按钮...')
    await page.waitForTimeout(1000)

    // 查找第一个编辑按钮
    const editButton = await page.locator('button:has-text("编辑"), button[aria-label="edit"]').first()

    if (await editButton.isVisible()) {
      console.log('找到编辑按钮，点击...')
      await editButton.click()
      await page.waitForTimeout(1500)

      // 截图编辑弹窗
      await page.screenshot({ path: 'test-screenshot-3-edit-modal.png' })
      console.log('截图已保存: test-screenshot-3-edit-modal.png')

      // 检查弹窗内容
      const modal = await page.locator('.ant-modal').first()

      if (await modal.isVisible()) {
        console.log('编辑弹窗已打开')

        // 检查接口信息
        const apiInfo = await page.locator('text=接口信息').first()

        if (await apiInfo.isVisible()) {
          console.log('接口信息区域可见')
          const apiText = await apiInfo.locator('..').textContent()
          console.log('接口信息内容:', apiText)
        }

        // 检查步骤名称输入框
        const nameInput = await page.locator('input[id*="name"]').first()

        if (await nameInput.isVisible()) {
          const nameValue = await nameInput.inputValue()
          console.log('步骤名称:', nameValue)
        }

        // 检查提取器
        const extractorSection = await page.locator('text=数据提取器').first()

        if (await extractorSection.isVisible()) {
          console.log('数据提取器区域可见')
        }

        // 检查断言
        const assertionSection = await page.locator('text=结构化断言').first()

        if (await assertionSection.isVisible()) {
          console.log('结构化断言区域可见')
        }

        // 检查脚本
        const scriptSection = await page.locator('text=脚本').first()

        if (await scriptSection.isVisible()) {
          console.log('脚本区域可见')
        }
      }
      else {
        console.log('编辑弹窗未打开')
      }
    }
    else {
      console.log('未找到编辑按钮')
      // 列出所有按钮
      const buttons = await page.locator('button').all()
      console.log('页面上的按钮数量:', buttons.length)

      for (let i = 0; i < Math.min(buttons.length, 10); i++) {
        const text = await buttons[i].textContent()
        console.log(`按钮 ${i}: ${text}`)
      }
    }

    // 4. 打印网络请求
    console.log('\n4. 网络请求记录:')
    requests.forEach((req, i) => {
      console.log(`请求 ${i + 1}: ${req.method} ${req.url}`)
    })
  }
  catch (error) {
    console.error('测试错误:', error)
    await page.screenshot({ path: 'test-screenshot-error.png' })
  }
  finally {
    await browser.close()
  }
})()
