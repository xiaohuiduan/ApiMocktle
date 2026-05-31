import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SubFlowNode from './SubFlowNode'
import { FlowNodeType } from '../types/flow.types'

describe('SubFlowNode', () => {
  const defaultProps = {
    id: 'sub-1',
    data: { label: 'Sub Flow', enabled: true, targetTaskId: 'task-456' },
    type: FlowNodeType.SubFlow,
    position: { x: 0, y: 0 },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    dragging: false,
  } as any

  it('应该正常渲染不报错', () => {
    render(<SubFlowNode {...defaultProps} />)
    expect(screen.getByTestId('node-subFlow')).toBeDefined()
  })

  it('应该显示正确的标题', () => {
    render(<SubFlowNode {...defaultProps} />)
    expect(screen.getByTestId('node-label').textContent).toBe('Sub Flow')
  })

  it('应该使用 Workflow 图标', () => {
    render(<SubFlowNode {...defaultProps} />)
    expect(screen.getByTestId('node-icon')).toBeDefined()
  })

  it('应该使用靛蓝色边框', () => {
    render(<SubFlowNode {...defaultProps} />)
    const border = screen.getByTestId('node-border')
    expect(border.style.backgroundColor).toBe('rgb(99, 102, 241)')
  })

  it('应该显示 targetTaskId 作为摘要', () => {
    render(<SubFlowNode {...defaultProps} />)
    expect(screen.getByTestId('node-summary').textContent).toBe('task-456')
  })

  it('应该有输入和输出 Handle', () => {
    render(<SubFlowNode {...defaultProps} />)
    expect(screen.getByTestId('handle-target-in')).toBeDefined()
    expect(screen.getByTestId('handle-source-out')).toBeDefined()
  })

  it('应该显示执行状态徽章', () => {
    const props = {
      ...defaultProps,
      data: { label: 'Sub Flow', enabled: true, targetTaskId: 'task-456', execStatus: 'passed' },
    }
    render(<SubFlowNode {...props} />)
    expect(screen.getByTestId('node-status-badge')).toBeDefined()
  })
})
