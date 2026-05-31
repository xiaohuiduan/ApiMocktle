import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BaseNode from './BaseNode'
import { FlowNodeType } from '../types/flow.types'

describe('BaseNode', () => {
  const defaultProps = {
    id: 'node-1',
    data: { label: 'Test Node', enabled: true },
    type: FlowNodeType.HttpRequest,
    inputHandles: ['in'],
    outputHandles: ['out'],
  }

  it('应该正常渲染不报错', () => {
    render(<BaseNode {...defaultProps} />)
    expect(screen.getByTestId('node-httpRequest')).toBeDefined()
  })

  it('应该显示标题', () => {
    render(<BaseNode {...defaultProps} />)
    expect(screen.getByTestId('node-label').textContent).toBe('Test Node')
  })

  it('应该显示图标', () => {
    render(<BaseNode {...defaultProps} />)
    expect(screen.getByTestId('node-icon')).toBeDefined()
  })

  it('应该渲染左侧彩色边框', () => {
    render(<BaseNode {...defaultProps} />)
    const border = screen.getByTestId('node-border')
    expect(border).toBeDefined()
    // jsdom 将 hex 转为 rgb
    expect(border.style.backgroundColor).toBe('rgb(59, 130, 246)')
  })

  it('应该渲染输入 Handle', () => {
    render(<BaseNode {...defaultProps} />)
    expect(screen.getByTestId('handle-target-in')).toBeDefined()
  })

  it('应该渲染输出 Handle', () => {
    render(<BaseNode {...defaultProps} />)
    expect(screen.getByTestId('handle-source-out')).toBeDefined()
  })

  it('应该显示执行状态徽章（passed）', () => {
    const props = {
      ...defaultProps,
      data: { label: 'Test', enabled: true, execStatus: 'passed' },
    }
    render(<BaseNode {...props} />)
    const badge = screen.getByTestId('node-status-badge')
    expect(badge).toBeDefined()
    expect(badge.textContent).toBe('✓')
  })

  it('应该显示执行状态徽章（failed）', () => {
    const props = {
      ...defaultProps,
      data: { label: 'Test', enabled: true, execStatus: 'failed' },
    }
    render(<BaseNode {...props} />)
    const badge = screen.getByTestId('node-status-badge')
    expect(badge.textContent).toBe('✗')
  })

  it('应该不显示 idle 状态徽章', () => {
    const props = {
      ...defaultProps,
      data: { label: 'Test', enabled: true, execStatus: 'idle' },
    }
    render(<BaseNode {...props} />)
    expect(screen.queryByTestId('node-status-badge')).toBeNull()
  })

  it('应该显示摘要描述', () => {
    render(<BaseNode {...defaultProps} summary="api-123" />)
    expect(screen.getByTestId('node-summary').textContent).toBe('api-123')
  })

  it('应该不显示摘要描述（当没有 summary 时）', () => {
    render(<BaseNode {...defaultProps} />)
    expect(screen.queryByTestId('node-summary')).toBeNull()
  })

  it('应该为不同类型节点使用不同颜色', () => {
    const { rerender } = render(<BaseNode {...defaultProps} type={FlowNodeType.Start} />)
    expect(screen.getByTestId('node-border').style.backgroundColor).toBe('rgb(107, 114, 128)')

    rerender(<BaseNode {...defaultProps} type={FlowNodeType.Condition} />)
    expect(screen.getByTestId('node-border').style.backgroundColor).toBe('rgb(249, 115, 22)')

    rerender(<BaseNode {...defaultProps} type={FlowNodeType.Assert} />)
    expect(screen.getByTestId('node-border').style.backgroundColor).toBe('rgb(239, 68, 68)')
  })

  it('应该支持多个输出 Handle', () => {
    render(
      <BaseNode
        {...defaultProps}
        inputHandles={['in']}
        outputHandles={['true', 'false']}
      />
    )
    expect(screen.getByTestId('handle-source-true')).toBeDefined()
    expect(screen.getByTestId('handle-source-false')).toBeDefined()
  })

  it('应该支持无 Handle', () => {
    render(<BaseNode {...defaultProps} inputHandles={[]} outputHandles={[]} />)
    expect(screen.queryByTestId('handle-target-in')).toBeNull()
    expect(screen.queryByTestId('handle-source-out')).toBeNull()
  })

  it('应该使用 Top/Bottom position 作为 Handle 位置', () => {
    render(<BaseNode {...defaultProps} />)
    const inputHandle = screen.getByTestId('handle-target-in')
    expect(inputHandle.getAttribute('data-handle-position')).toBe('top')
    const outputHandle = screen.getByTestId('handle-source-out')
    expect(outputHandle.getAttribute('data-handle-position')).toBe('bottom')
  })

  it('应该为多个输出 Handle 使用水平分布', () => {
    render(
      <BaseNode
        {...defaultProps}
        inputHandles={['in']}
        outputHandles={['branch-0', 'branch-1', 'branch-2']}
      />
    )
    // 验证所有 handles 都存在
    expect(screen.getByTestId('handle-source-branch-0')).toBeDefined()
    expect(screen.getByTestId('handle-source-branch-1')).toBeDefined()
    expect(screen.getByTestId('handle-source-branch-2')).toBeDefined()
  })
})
