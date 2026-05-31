import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ParallelNode from './ParallelNode'
import { FlowNodeType } from '../types/flow.types'

describe('ParallelNode', () => {
  const defaultProps = {
    id: 'par-1',
    data: { label: 'Parallel', enabled: true, branchCount: 3, waitAll: true },
    type: FlowNodeType.Parallel,
    position: { x: 0, y: 0 },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    dragging: false,
  } as any

  it('应该正常渲染不报错', () => {
    render(<ParallelNode {...defaultProps} />)
    expect(screen.getByTestId('node-parallel')).toBeDefined()
  })

  it('应该显示正确的标题', () => {
    render(<ParallelNode {...defaultProps} />)
    expect(screen.getByTestId('node-label').textContent).toBe('Parallel')
  })

  it('应该使用 Split 图标', () => {
    render(<ParallelNode {...defaultProps} />)
    expect(screen.getByTestId('node-icon')).toBeDefined()
  })

  it('应该使用青色边框', () => {
    render(<ParallelNode {...defaultProps} />)
    const border = screen.getByTestId('node-border')
    expect(border.style.backgroundColor).toBe('rgb(20, 184, 166)')
  })

  it('应该显示分支数量作为摘要', () => {
    render(<ParallelNode {...defaultProps} />)
    expect(screen.getByTestId('node-summary').textContent).toBe('3 并行分支')
  })

  it('应该有输入和输出 Handle', () => {
    render(<ParallelNode {...defaultProps} />)
    expect(screen.getByTestId('handle-target-in')).toBeDefined()
    // 默认 3 个分支，应该有 3 个输出 handles
    expect(screen.getByTestId('handle-source-branch-0')).toBeDefined()
    expect(screen.getByTestId('handle-source-branch-1')).toBeDefined()
    expect(screen.getByTestId('handle-source-branch-2')).toBeDefined()
  })

  it('应该显示 handle 标签', () => {
    render(<ParallelNode {...defaultProps} />)
    expect(screen.getByTestId('handle-label-out-branch-0')).toBeDefined()
    expect(screen.getByTestId('handle-label-out-branch-0').textContent).toBe('#1')
    expect(screen.getByTestId('handle-label-out-branch-1').textContent).toBe('#2')
    expect(screen.getByTestId('handle-label-out-branch-2').textContent).toBe('#3')
  })

  it('应该显示执行状态徽章', () => {
    const props = {
      ...defaultProps,
      data: { label: 'Parallel', enabled: true, branchCount: 2, waitAll: true, execStatus: 'passed' },
    }
    render(<ParallelNode {...props} />)
    expect(screen.getByTestId('node-status-badge')).toBeDefined()
  })
})
