import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AssertNode from './AssertNode'
import { FlowNodeType } from '../types/flow.types'

describe('AssertNode', () => {
  const defaultProps = {
    id: 'assert-1',
    data: {
      label: 'Assert',
      enabled: true,
      assertions: [
        { type: 'status', operator: 'equals', expected: 200 },
        { type: 'json_path', path: '$.data.status', operator: 'equals', expected: 'success' },
      ],
    },
    type: FlowNodeType.Assert,
    position: { x: 0, y: 0 },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    dragging: false,
  } as any

  it('应该正常渲染不报错', () => {
    render(<AssertNode {...defaultProps} />)
    expect(screen.getByTestId('node-assert')).toBeDefined()
  })

  it('应该显示正确的标题', () => {
    render(<AssertNode {...defaultProps} />)
    expect(screen.getByTestId('node-label').textContent).toBe('Assert')
  })

  it('应该使用 ShieldCheck 图标', () => {
    render(<AssertNode {...defaultProps} />)
    expect(screen.getByTestId('node-icon')).toBeDefined()
  })

  it('应该使用红色边框', () => {
    render(<AssertNode {...defaultProps} />)
    const border = screen.getByTestId('node-border')
    expect(border.style.backgroundColor).toBe('rgb(239, 68, 68)')
  })

  it('应该显示断言数量作为摘要', () => {
    render(<AssertNode {...defaultProps} />)
    expect(screen.getByTestId('node-summary').textContent).toBe('2 check(s)')
  })

  it('应该有输入和输出 Handle', () => {
    render(<AssertNode {...defaultProps} />)
    expect(screen.getByTestId('handle-target-in')).toBeDefined()
    expect(screen.getByTestId('handle-source-out')).toBeDefined()
  })

  it('应该显示执行状态徽章', () => {
    const props = {
      ...defaultProps,
      data: {
        label: 'Assert',
        enabled: true,
        assertions: [{ type: 'status', operator: 'equals', expected: 200 }],
        execStatus: 'failed',
      },
    }
    render(<AssertNode {...props} />)
    const badge = screen.getByTestId('node-status-badge')
    expect(badge).toBeDefined()
    expect(badge.textContent).toBe('✗')
  })
})
