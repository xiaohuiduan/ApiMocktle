import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StartNode from './StartNode'
import { FlowNodeType } from '../types/flow.types'

describe('StartNode', () => {
  const defaultProps = {
    id: 'start-1',
    data: { label: 'Start', enabled: true },
    type: FlowNodeType.Start,
    position: { x: 0, y: 0 },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    dragging: false,
  } as any

  it('应该正常渲染不报错', () => {
    render(<StartNode {...defaultProps} />)
    expect(screen.getByTestId('node-start')).toBeDefined()
  })

  it('应该显示正确的标题', () => {
    render(<StartNode {...defaultProps} />)
    expect(screen.getByTestId('node-label').textContent).toBe('Start')
  })

  it('应该使用 Play 图标', () => {
    render(<StartNode {...defaultProps} />)
    expect(screen.getByTestId('node-icon')).toBeDefined()
  })

  it('应该使用灰色边框', () => {
    render(<StartNode {...defaultProps} />)
    const border = screen.getByTestId('node-border')
    expect(border.style.backgroundColor).toBe('rgb(107, 114, 128)')
  })

  it('应该有输出 Handle', () => {
    render(<StartNode {...defaultProps} />)
    expect(screen.getByTestId('handle-source-out')).toBeDefined()
  })

  it('不应该有输入 Handle', () => {
    render(<StartNode {...defaultProps} />)
    expect(screen.queryByTestId('handle-target-in')).toBeNull()
  })

  it('应该显示执行状态徽章', () => {
    const props = {
      ...defaultProps,
      data: { label: 'Start', enabled: true, execStatus: 'passed' },
    }
    render(<StartNode {...props} />)
    expect(screen.getByTestId('node-status-badge')).toBeDefined()
  })
})
