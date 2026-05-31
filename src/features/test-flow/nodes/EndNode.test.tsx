import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EndNode from './EndNode'
import { FlowNodeType } from '../types/flow.types'

describe('EndNode', () => {
  const defaultProps = {
    id: 'end-1',
    data: { label: 'End', enabled: true },
    type: FlowNodeType.End,
    position: { x: 0, y: 0 },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    dragging: false,
  } as any

  it('应该正常渲染不报错', () => {
    render(<EndNode {...defaultProps} />)
    expect(screen.getByTestId('node-end')).toBeDefined()
  })

  it('应该显示正确的标题', () => {
    render(<EndNode {...defaultProps} />)
    expect(screen.getByTestId('node-label').textContent).toBe('End')
  })

  it('应该使用 CircleStop 图标', () => {
    render(<EndNode {...defaultProps} />)
    expect(screen.getByTestId('node-icon')).toBeDefined()
  })

  it('应该使用灰色边框', () => {
    render(<EndNode {...defaultProps} />)
    const border = screen.getByTestId('node-border')
    expect(border.style.backgroundColor).toBe('rgb(107, 114, 128)')
  })

  it('应该有输入 Handle', () => {
    render(<EndNode {...defaultProps} />)
    expect(screen.getByTestId('handle-target-in')).toBeDefined()
  })

  it('不应该有输出 Handle', () => {
    render(<EndNode {...defaultProps} />)
    expect(screen.queryByTestId('handle-source-out')).toBeNull()
  })

  it('应该显示执行状态徽章', () => {
    const props = {
      ...defaultProps,
      data: { label: 'End', enabled: true, execStatus: 'passed' },
    }
    render(<EndNode {...props} />)
    expect(screen.getByTestId('node-status-badge')).toBeDefined()
  })
})
