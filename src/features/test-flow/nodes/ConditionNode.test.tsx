import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ConditionNode from './ConditionNode'
import { FlowNodeType } from '../types/flow.types'

describe('ConditionNode', () => {
  const defaultProps = {
    id: 'cond-1',
    data: { label: 'Condition', enabled: true, conditionType: 'expression' },
    type: FlowNodeType.Condition,
    position: { x: 0, y: 0 },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    dragging: false,
  } as any

  it('应该正常渲染不报错', () => {
    render(<ConditionNode {...defaultProps} />)
    expect(screen.getByTestId('node-condition')).toBeDefined()
  })

  it('应该显示正确的标题', () => {
    render(<ConditionNode {...defaultProps} />)
    expect(screen.getByTestId('node-label').textContent).toBe('Condition')
  })

  it('应该使用 GitBranch 图标', () => {
    render(<ConditionNode {...defaultProps} />)
    expect(screen.getByTestId('node-icon')).toBeDefined()
  })

  it('应该使用橙色边框', () => {
    render(<ConditionNode {...defaultProps} />)
    const border = screen.getByTestId('node-border')
    expect(border.style.backgroundColor).toBe('rgb(249, 115, 22)')
  })

  it('应该显示 conditionType 作为摘要', () => {
    render(<ConditionNode {...defaultProps} />)
    expect(screen.getByTestId('node-summary').textContent).toBe('expression')
  })

  it('应该有输入和两个输出 Handle（true/false）', () => {
    render(<ConditionNode {...defaultProps} />)
    expect(screen.getByTestId('handle-target-in')).toBeDefined()
    expect(screen.getByTestId('handle-source-true')).toBeDefined()
    expect(screen.getByTestId('handle-source-false')).toBeDefined()
  })

  it('应该显示执行状态徽章', () => {
    const props = {
      ...defaultProps,
      data: { label: 'Condition', enabled: true, conditionType: 'expression', execStatus: 'passed' },
    }
    render(<ConditionNode {...props} />)
    expect(screen.getByTestId('node-status-badge')).toBeDefined()
  })
})
