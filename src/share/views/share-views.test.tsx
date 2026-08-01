import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiDetailView } from './ApiDetailView'
import { DocView } from './DocView'
import { SchemaView } from './SchemaView'

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
})
