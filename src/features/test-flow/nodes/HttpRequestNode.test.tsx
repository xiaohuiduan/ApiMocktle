import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import HttpRequestNode from './HttpRequestNode'
import { FlowNodeType } from '../types/flow.types'

describe('HttpRequestNode', () => {
  const defaultProps = {
    id: 'http-1',
    data: { label: 'HTTP Request', enabled: true, menuItemId: 'api-123' },
    type: FlowNodeType.HttpRequest,
    position: { x: 0, y: 0 },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    dragging: false,
  } as any

  it('应该正常渲染不报错', () => {
    render(<HttpRequestNode {...defaultProps} />)
    expect(screen.getByTestId('node-httpRequest')).toBeDefined()
  })

  it('应该显示正确的标题', () => {
    render(<HttpRequestNode {...defaultProps} />)
    expect(screen.getByTestId('node-label').textContent).toBe('HTTP Request')
  })

  it('应该使用 Globe 图标', () => {
    render(<HttpRequestNode {...defaultProps} />)
    expect(screen.getByTestId('node-icon')).toBeDefined()
  })

  it('应该使用蓝色边框', () => {
    render(<HttpRequestNode {...defaultProps} />)
    const border = screen.getByTestId('node-border')
    expect(border.style.backgroundColor).toBe('rgb(59, 130, 246)')
  })

  it('应该显示 menuItemId 作为摘要', () => {
    render(<HttpRequestNode {...defaultProps} />)
    expect(screen.getByTestId('node-summary').textContent).toBe('api-123')
  })

  it('应该有输入和输出 Handle', () => {
    render(<HttpRequestNode {...defaultProps} />)
    expect(screen.getByTestId('handle-target-in')).toBeDefined()
    expect(screen.getByTestId('handle-source-out')).toBeDefined()
  })

  it('应该显示执行状态徽章', () => {
    const props = {
      ...defaultProps,
      data: { label: 'HTTP Request', enabled: true, menuItemId: 'api-123', execStatus: 'running' },
    }
    render(<HttpRequestNode {...props} />)
    const badge = screen.getByTestId('node-status-badge')
    expect(badge).toBeDefined()
    expect(badge.textContent).toBe('...')
  })
})
