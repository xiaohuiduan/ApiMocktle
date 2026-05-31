import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import FlowCanvas from './FlowCanvas'
import { useFlowStore } from '../store/useFlowStore'

// Mock @xyflow/react - jsdom 不支持 SVG 测量，需要 mock 所有组件
vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: Record<string, unknown>) => {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'react-flow', ...props })
  },
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'react-flow-provider' }, children)
  },
  Background: () => {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'background' })
  },
  MiniMap: () => {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'minimap' })
  },
  Controls: () => {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'controls' })
  },
  useReactFlow: () => ({
    screenToFlowPosition: vi.fn(({ x, y }: { x: number; y: number }) => ({ x, y })),
  }),
}))

// Mock nodeRegistry
vi.mock('../nodes/nodeRegistry', () => ({
  getNodeTypes: () => ({
    start: () => null,
    end: () => null,
  }),
  getDefaultNodeData: () => ({ label: 'Test', enabled: true }),
}))

describe('FlowCanvas', () => {
  beforeEach(() => {
    // 重置 store 状态
    useFlowStore.getState().reset()
  })

  it('应该正常渲染不报错', () => {
    render(<FlowCanvas />)
    expect(screen.getByTestId('flow-canvas')).toBeDefined()
  })

  it('应该包含 ReactFlow 组件', () => {
    render(<FlowCanvas />)
    expect(screen.getByTestId('react-flow')).toBeDefined()
  })

  it('应该包含 Background 组件', () => {
    render(<FlowCanvas />)
    expect(screen.getByTestId('background')).toBeDefined()
  })

  it('应该包含 MiniMap 组件', () => {
    render(<FlowCanvas />)
    expect(screen.getByTestId('minimap')).toBeDefined()
  })

  it('应该包含 Controls 组件', () => {
    render(<FlowCanvas />)
    expect(screen.getByTestId('controls')).toBeDefined()
  })
})
