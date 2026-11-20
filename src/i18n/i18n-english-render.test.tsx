import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { i18n } from '@/i18n'

import { ApiDetailView } from '@/share/views/ApiDetailView'
import { MethodBadge } from '@/share/views/MethodBadge'

/**
 * 英文界面真实渲染验证。
 *
 * 取词断言只能证明「资源存在」，不能证明「组件真的用了 t() 而不是写死中文」。
 * 这里把语言切到英文后真实渲染分享页视图——它是最适合做端到端语言验证的
 * 独立组件（无 Provider 依赖、无 IPC、纯展示）。
 *
 * 中文界面下的同类断言由既有的 share-views.test.tsx 覆盖，两者合起来
 * 构成「切语言后界面真的变了」的闭环。
 */
afterEach(() => {
  void i18n.changeLanguage('zh-CN')
})

const sampleData = {
  id: 'api-1',
  name: 'Create order',
  method: 'POST' as const,
  path: '/orders',
  status: 'developing' as const,
  parameters: {
    query: [{ id: 'q1', name: 'page', type: 'integer', required: false, description: 'Page number' }],
    header: [],
    path: [],
    cookie: [],
  },
  requestBody: {
    type: 'json',
    jsonSchema: {
      type: 'object',
      properties: [{ name: 'sku', type: 'string', required: true, description: 'Product SKU' }],
    },
  },
  responses: [
    {
      id: 'r1',
      code: 200,
      name: 'Success',
      contentType: 'json',
      jsonSchema: { type: 'object', properties: [] },
    },
  ],
}

describe('分享页在英文界面下的渲染', () => {
  it('英文界面渲染出英文标签，不是中文', () => {
    void i18n.changeLanguage('en-US')

    const { container } = render(<ApiDetailView data={sampleData as never} />)
    const text = container.textContent ?? ''

    // 应出现英文的通用表格/分区标签
    expect(text).toMatch(/Query|Parameter|Response|Field|Description|Example/i)
    // 不应出现迁移前的常见中文界面词
    expect(text).not.toMatch(/查询参数|响应|字段|说明|示例/)
  })

  it('中文界面渲染出中文标签（对照）', () => {
    void i18n.changeLanguage('zh-CN')

    const { container } = render(<ApiDetailView data={sampleData as never} />)
    const text = container.textContent ?? ''

    expect(text).toMatch(/查询参数|响应|字段|说明|示例/)
  })

  it('接口路径等用户数据在两种语言下保持不变', () => {
    const pathZh = render(<ApiDetailView data={sampleData as never} />).container.textContent

    void i18n.changeLanguage('en-US')
    const pathEn = render(<ApiDetailView data={sampleData as never} />).container.textContent

    // 路径与技术字段属于用户数据/协议值，不因切语言而变化
    expect(pathZh).toContain('/orders')
    expect(pathEn).toContain('/orders')
  })

  it('HTTP 方法徽标在两种语言下都是协议缩写', () => {
    void i18n.changeLanguage('en-US')
    const { container } = render(<MethodBadge method={'POST' as never} />)

    // POST 是协议常量，不翻译
    expect(container.textContent).toContain('POST')
  })
})
