import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoopNode from './LoopNode'
import { FlowNodeType } from '../types/flow.types'

describe('LoopNode', () => {
  const defaultProps = {
    id: 'loop-1',
    data: { label: 'Loop', enabled: true, loopType: 'count' },
    type: FlowNodeType.Loop,
    position: { x: 0, y: 0 },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    dragging: false,
  } as any

  it('应该正常渲染不报错', () => {
    render(<LoopNode {...defaultProps} />)
    expect(screen.getByTestId('node-loop')).toBeDefined()
  })

  it('应该显示正确的标题', () => {
    render(<LoopNode {...defaultProps} />)
    expect(screen.getByTestId('node-label').textContent).toBe('Loop')
  })

  it('应该使用 Repeat 图标', () => {
    render(<LoopNode {...defaultProps} />)
    expect(screen.getByTestId('node-icon')).toBeDefined()
  })

  it('应该使用紫色边框', () => {
    render(<LoopNode {...defaultProps} />)
    const border = screen.getByTestId('node-border')
    expect(border.style.backgroundColor).toBe('rgb(168, 85, 247)')
  })

  it('应该显示 loopType 作为摘要', () => {
    render(<LoopNode {...defaultProps} />)
    expect(screen.getByTestId('node-summary').textContent).toBe('count')
  })

  it('应该有输入和两个输出 Handle（out/loop）', () => {
    render(<LoopNode {...defaultProps} />)
    expect(screen.getByTestId('handle-target-in')).toBeDefined()
    expect(screen.getByTestId('handle-source-out')).toBeDefined()
    expect(screen.getByTestId('handle-source-loop')).toBeDefined()
  })

  it('应该显示执行状态徽章', () => {
    const props = {
      ...defaultProps,
      data: { label: 'Loop', enabled: true, loopType: 'count', execStatus: 'running' },
    }
    render(<LoopNode {...props} />)
    expect(screen.getByTestId('node-status-badge')).toBeDefined()
  })
})
