import { render } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { describe, expect, it } from 'vitest'

/**
 * antd `<App>` 默认渲染 `<div class="ant-app">`，插入这层会打断项目根节点的
 * `h-full` 高度链（主布局依赖 h-full 撑满视口）。`component={false}` 让它
 * 退化为 Fragment：仍提供 message/Modal/notification 上下文，但不产生 DOM。
 *
 * 这个测试锁定该行为，避免将来有人「顺手」去掉 component={false} 造成布局回归。
 */
describe('antd App 包裹层', () => {
  it('component={false} 时不产生额外 DOM 包裹', () => {
    const { container } = render(
      <ConfigProvider>
        <AntdApp component={false}>
          <span data-testid="child">x</span>
        </AntdApp>
      </ConfigProvider>,
    )

    // 子元素应直接挂在容器下，中间没有 .ant-app 包裹层
    expect(container.querySelector('.ant-app')).toBeNull()
    expect(container.querySelector('[data-testid="child"]')).not.toBeNull()
  })

  it('默认渲染时会产生 .ant-app 包裹层（说明为何必须显式关闭）', () => {
    const { container } = render(
      <ConfigProvider>
        <AntdApp>
          <span>x</span>
        </AntdApp>
      </ConfigProvider>,
    )

    expect(container.querySelector('.ant-app')).not.toBeNull()
  })
})
