import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestFlowEditor } from './TestFlowEditor'
import { useFlowStore } from '../store/useFlowStore'

// Mock useFlowPersistence
vi.mock('../hooks/useFlowPersistence', () => ({
  useFlowPersistence: () => ({
    loadFlow: vi.fn(),
    forceSave: vi.fn(),
    isSaving: false,
  }),
}))

// Mock FlowToolbar
vi.mock('./FlowToolbar', () => ({
  default: (props: Record<string, unknown>) => {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'flow-toolbar' })
  },
}))

// Mock NodePalette
vi.mock('./NodePalette', () => ({
  default: () => {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'node-palette' })
  },
}))

// Mock FlowCanvas
vi.mock('./FlowCanvas', () => ({
  default: () => {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'flow-canvas' })
  },
}))

// Mock NodeConfigDrawer
vi.mock('./NodeConfigDrawer', () => ({
  default: () => {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'node-config-drawer' })
  },
}))

describe('TestFlowEditor', () => {
  const defaultProps = {
    taskId: 'task-1',
    projectId: 'project-1',
  }

  beforeEach(() => {
    // 重置 store
    useFlowStore.getState().reset()
  })

  it('应该正常渲染不报错', () => {
    render(<TestFlowEditor {...defaultProps} />)
    expect(screen.getByTestId('test-flow-editor')).toBeDefined()
  })

  it('应该包含 NodePalette', () => {
    render(<TestFlowEditor {...defaultProps} />)
    expect(screen.getByTestId('node-palette')).toBeDefined()
  })

  it('应该包含 FlowToolbar', () => {
    render(<TestFlowEditor {...defaultProps} />)
    expect(screen.getByTestId('flow-toolbar')).toBeDefined()
  })

  it('应该包含 FlowCanvas', () => {
    render(<TestFlowEditor {...defaultProps} />)
    expect(screen.getByTestId('flow-canvas')).toBeDefined()
  })
})
