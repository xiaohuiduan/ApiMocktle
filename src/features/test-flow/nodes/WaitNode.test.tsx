import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WaitNode from './WaitNode'
import { FlowNodeType } from '../types/flow.types'

describe('WaitNode', () => {
  const defaultProps = {
    id: 'wait-1',
    data: { label: 'Wait', enabled: true, waitType: 'fixed' },
    type: FlowNodeType.Wait,
    position: { x: 0, y: 0 },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    dragging: false,
  } as any

  it('应该正常渲染不报错', () => {
    render(<WaitNode {...defaultProps} />)
    expect(screen.getByTestId('node-wait')).toBeDefined()
  })

  it('应该显示正确的标题', () => {
    render(<WaitNode {...defaultProps} />)
    expect(screen.getByTestId('node-label').textContent).toBe('Wait')
  })

  it('应该使用 Timer 图标', () => {
    render(<WaitNode {...defaultProps} />)
    expect(screen.getByTestId('node-icon')).toBeDefined()
  })

  it('应该使用黄色边框', () => {
    render(<WaitNode {...defaultProps} />)
    const border = screen.getByTestId('node-border')
    expect(border.style.backgroundColor).toBe('rgb(234, 179, 8)')
  })

  it('应该显示 waitType 作为摘要', () => {
    render(<WaitNode {...defaultProps} />)
    expect(screen.getByTestId('node-summary').textContent).toBe('fixed')
  })

  it('应该有输入和输出 Handle', () => {
    render(<WaitNode {...defaultProps} />)
    expect(screen.getByTestId('handle-target-in')).toBeDefined()
    expect(screen.getByTestId('handle-source-out')).toBeDefined()
  })

  it('应该显示执行状态徽章', () => {
    const props = {
      ...defaultProps,
      data: { label: 'Wait', enabled: true, waitType: 'fixed', execStatus: 'running' },
    }
    render(<WaitNode {...props} />)
    expect(screen.getByTestId('node-status-badge')).toBeDefined()
  })
})
