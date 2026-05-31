import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SetVariableNode from './SetVariableNode'
import { FlowNodeType } from '../types/flow.types'

describe('SetVariableNode', () => {
  const defaultProps = {
    id: 'var-1',
    data: {
      label: 'Set Variable',
      enabled: true,
      assignments: [
        { variable: 'token', operator: '=', value: 'abc' },
        { variable: 'counter', operator: '+=', value: '1' },
      ],
    },
    type: FlowNodeType.SetVariable,
    position: { x: 0, y: 0 },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    dragging: false,
  } as any

  it('应该正常渲染不报错', () => {
    render(<SetVariableNode {...defaultProps} />)
    expect(screen.getByTestId('node-setVariable')).toBeDefined()
  })

  it('应该显示正确的标题', () => {
    render(<SetVariableNode {...defaultProps} />)
    expect(screen.getByTestId('node-label').textContent).toBe('Set Variable')
  })

  it('应该使用 Variable 图标', () => {
    render(<SetVariableNode {...defaultProps} />)
    expect(screen.getByTestId('node-icon')).toBeDefined()
  })

  it('应该使用绿色边框', () => {
    render(<SetVariableNode {...defaultProps} />)
    const border = screen.getByTestId('node-border')
    expect(border.style.backgroundColor).toBe('rgb(34, 197, 94)')
  })

  it('应该显示赋值数量作为摘要', () => {
    render(<SetVariableNode {...defaultProps} />)
    expect(screen.getByTestId('node-summary').textContent).toBe('2 var(s)')
  })

  it('应该有输入和输出 Handle', () => {
    render(<SetVariableNode {...defaultProps} />)
    expect(screen.getByTestId('handle-target-in')).toBeDefined()
    expect(screen.getByTestId('handle-source-out')).toBeDefined()
  })

  it('应该显示执行状态徽章', () => {
    const props = {
      ...defaultProps,
      data: {
        label: 'Set Variable',
        enabled: true,
        assignments: [{ variable: 'x', operator: '=', value: '1' }],
        execStatus: 'passed',
      },
    }
    render(<SetVariableNode {...props} />)
    expect(screen.getByTestId('node-status-badge')).toBeDefined()
  })
})
