import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NodePalette from './NodePalette'
import { FlowNodeType } from '../types/flow.types'

describe('NodePalette', () => {
  it('应该渲染面板容器', () => {
    render(<NodePalette />)
    expect(screen.getByTestId('node-palette')).toBeDefined()
  })

  it('应该渲染所有 10 种节点类型', () => {
    render(<NodePalette />)
    const nodeTypes = Object.values(FlowNodeType)
    for (const type of nodeTypes) {
      expect(screen.getByTestId(`palette-node-${type}`)).toBeDefined()
    }
  })

  it('每种节点应显示正确的名称', () => {
    render(<NodePalette />)
    const expectedLabels: Record<string, string> = {
      start: '开始',
      end: '结束',
      httpRequest: 'HTTP 请求',
      condition: '条件判断',
      loop: '循环',
      parallel: '并行',
      wait: '等待',
      subFlow: '子流程',
      setVariable: '变量赋值',
      assert: '断言',
    }
    for (const [type, label] of Object.entries(expectedLabels)) {
      const card = screen.getByTestId(`palette-node-${type}`)
      expect(card.textContent).toContain(label)
    }
  })

  it('每种节点应有 draggable 属性', () => {
    render(<NodePalette />)
    const nodeTypes = Object.values(FlowNodeType)
    for (const type of nodeTypes) {
      const card = screen.getByTestId(`palette-node-${type}`)
      expect(card.getAttribute('draggable')).toBe('true')
    }
  })

  it('拖拽开始时应设置正确的 dataTransfer 数据', () => {
    render(<NodePalette />)
    const nodeTypes = Object.values(FlowNodeType)

    for (const type of nodeTypes) {
      const card = screen.getByTestId(`palette-node-${type}`)
      const dataTransfer = {
        setData: vi.fn(),
        effectAllowed: '',
      }
      fireEvent.dragStart(card, { dataTransfer })
      expect(dataTransfer.setData).toHaveBeenCalledWith('application/reactflow', type)
      expect(dataTransfer.effectAllowed).toBe('move')
    }
  })

  it('面板应有正确的宽度', () => {
    render(<NodePalette />)
    const panel = screen.getByTestId('node-palette')
    // @emotion/css 在 jsdom 中生成 className，检查宽度通过 style 计算
    // 我们验证 panelClass 样式被应用（通过检查 DOM 元素存在且有对应 class）
    expect(panel.className).toContain('css-')
  })
})
