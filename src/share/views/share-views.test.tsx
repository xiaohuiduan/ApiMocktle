import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiDetailView } from './ApiDetailView'
import { DocView } from './DocView'
import { SchemaView } from './SchemaView'

// antd Table 的响应式监听依赖 matchMedia，jsdom 缺失需要 stub
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

const apiDetailData = {
  method: 'GET',
  path: '/pet/{petId}',
  name: '查询宠物详情',
  description: '根据 ID 查询宠物信息',
  tags: ['宠物', '查询'],
  parameters: {
    path: [{ id: 'p1', name: 'petId', type: 'integer', required: true, description: '宠物 ID', example: '1' }],
    query: [{ id: 'q1', name: 'verbose', type: 'boolean', required: false, description: '是否返回详细信息', example: 'true' }],
    header: [{ id: 'h1', name: 'X-Trace-Id', type: 'string', required: false, description: '链路追踪 ID', example: 'abc-123' }],
  },
  requestBody: { type: 'none' },
  responses: [
    {
      code: 200,
      name: '成功',
      contentType: 'json',
      jsonSchema: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: '宠物 ID' },
          name: { type: 'string', description: '宠物名称' },
          status: { type: 'string', enum: ['available', 'pending', 'sold'] },
        },
      },
    },
  ],
}

describe('share 只读视图渲染', () => {
  it('ApiDetailView 渲染完整详情不抛错', () => {
    render(<ApiDetailView data={apiDetailData} />)
    expect(screen.getByText('GET')).toBeTruthy()
    expect(screen.getByText('/pet/{petId}')).toBeTruthy()
    expect(screen.getByText('petId')).toBeTruthy()
    expect(screen.getByText('X-Trace-Id')).toBeTruthy()
    expect(screen.getByText('查询宠物详情')).toBeTruthy()
    expect(screen.getByText('响应')).toBeTruthy()
  })

  it('DocView 渲染 markdown 内容', () => {
    render(<DocView data={{ content: '# 标题\n\n正文段落' }} />)
    expect(screen.getByText('标题')).toBeTruthy()
    expect(screen.getByText('正文段落')).toBeTruthy()
  })

  it('SchemaView 渲染模型', () => {
    render(<SchemaView data={{ name: 'Pet', jsonSchema: { type: 'object', properties: { id: { type: 'integer' } } } }} />)
    expect(screen.getByText('Pet')).toBeTruthy()
    expect(screen.getByText('id')).toBeTruthy()
  })

  it('ApiDetailView 空数据不抛错', () => {
    render(<ApiDetailView data={undefined} />)
    expect(screen.getByText('未命名接口')).toBeTruthy()
  })

  it('ApiDetailView 渲染项目内部格式（properties 数组 + ref/any）', () => {
    render(
      <ApiDetailView
        data={{
          method: 'POST',
          path: '/pet',
          name: '新增宠物',
          requestBody: {
            type: 'application/json',
            jsonSchema: {
              type: 'object',
              properties: [
                { name: 'name', type: 'string', description: '宠物名称' },
                { name: 'tag', type: 'string', description: '标签' },
                { name: 'data', type: 'object', properties: [{ name: 'id', type: 'integer' }] },
              ],
            },
          },
          responses: [
            {
              code: 200,
              name: '成功',
              contentType: 'json',
              jsonSchema: {
                type: 'object',
                properties: [
                  { name: 'code', type: 'integer', description: '状态码' },
                  { name: 'data', type: 'ref', $ref: '.1.2', description: '宠物信息' },
                ],
              },
            },
          ],
        }}
      />,
    )
    // 表格字段
    expect(screen.getByText('name')).toBeTruthy()
    expect(screen.getByText('tag')).toBeTruthy()
    // 嵌套字段树形展开（子行短名；data 在请求体与响应各出现一次）
    expect(screen.getAllByText('data').length).toBeGreaterThan(0)
    expect(screen.getByText('id')).toBeTruthy()
    // 示例 JSON 含字段值而非空对象
    expect(screen.getByText(/"name": "string"/)).toBeTruthy()
    expect(screen.getByText(/"code": 0/)).toBeTruthy()
    expect(screen.getByText(/"\$ref": "\.1\.2"/)).toBeTruthy()
    // ref 类型行
    expect(screen.getByText('ref')).toBeTruthy()
  })
})
