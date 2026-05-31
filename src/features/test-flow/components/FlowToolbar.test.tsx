import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FlowToolbar from './FlowToolbar'
import type { FlowToolbarProps } from './FlowToolbar'

// Mock antd 以确保组件在 jsdom 中正常渲染
vi.mock('antd', () => ({
  theme: {
    useToken: () => ({
      token: { colorPrimary: '#1677ff' },
    }),
  },
  Button: ({ children, onClick, disabled, ['data-testid']: testId, ...rest }: Record<string, unknown>) => {
    const React = require('react')
    return React.createElement('button', {
      onClick: onClick as () => void,
      disabled: disabled as boolean,
      'data-testid': testId,
    }, children)
  },
  Tooltip: ({ children, title: _title }: Record<string, unknown>) => {
    const React = require('react')
    return React.createElement('span', { 'data-tooltip': _title }, children)
  },
  Space: ({ children }: Record<string, unknown>) => {
    const React = require('react')
    return React.createElement('div', null, children)
  },
}))

describe('FlowToolbar', () => {
  const defaultProps: FlowToolbarProps = {
    onRun: vi.fn(),
    onAbort: vi.fn(),
    onValidate: vi.fn(),
    onAutoLayout: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onFitView: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    onClear: vi.fn(),
    canUndo: true,
    canRedo: true,
    isRunning: false,
  }

  it('应该渲染工具栏容器', () => {
    render(<FlowToolbar {...defaultProps} />)
    expect(screen.getByTestId('flow-toolbar')).toBeDefined()
  })

  it('应该渲染所有按钮', () => {
    render(<FlowToolbar {...defaultProps} />)
    expect(screen.getByTestId('toolbar-run')).toBeDefined()
    expect(screen.getByTestId('toolbar-abort')).toBeDefined()
    expect(screen.getByTestId('toolbar-validate')).toBeDefined()
    expect(screen.getByTestId('toolbar-auto-layout')).toBeDefined()
    expect(screen.getByTestId('toolbar-undo')).toBeDefined()
    expect(screen.getByTestId('toolbar-redo')).toBeDefined()
    expect(screen.getByTestId('toolbar-zoom-in')).toBeDefined()
    expect(screen.getByTestId('toolbar-zoom-out')).toBeDefined()
    expect(screen.getByTestId('toolbar-fit-view')).toBeDefined()
    expect(screen.getByTestId('toolbar-export')).toBeDefined()
    expect(screen.getByTestId('toolbar-import')).toBeDefined()
    expect(screen.getByTestId('toolbar-clear')).toBeDefined()
  })

  it('运行按钮点击应触发 onRun', () => {
    const onRun = vi.fn()
    render(<FlowToolbar {...defaultProps} onRun={onRun} />)
    fireEvent.click(screen.getByTestId('toolbar-run'))
    expect(onRun).toHaveBeenCalledTimes(1)
  })

  it('中止按钮在运行中时可用', () => {
    render(<FlowToolbar {...defaultProps} isRunning={true} />)
    const abortBtn = screen.getByTestId('toolbar-abort') as HTMLButtonElement
    expect(abortBtn.disabled).toBe(false)
  })

  it('中止按钮在未运行时禁用', () => {
    render(<FlowToolbar {...defaultProps} isRunning={false} />)
    const abortBtn = screen.getByTestId('toolbar-abort') as HTMLButtonElement
    expect(abortBtn.disabled).toBe(true)
  })

  it('撤销按钮在 canUndo=false 时禁用', () => {
    render(<FlowToolbar {...defaultProps} canUndo={false} />)
    const undoBtn = screen.getByTestId('toolbar-undo') as HTMLButtonElement
    expect(undoBtn.disabled).toBe(true)
  })

  it('撤销按钮在 canUndo=true 时可用', () => {
    render(<FlowToolbar {...defaultProps} canUndo={true} />)
    const undoBtn = screen.getByTestId('toolbar-undo') as HTMLButtonElement
    expect(undoBtn.disabled).toBe(false)
  })

  it('重做按钮在 canRedo=false 时禁用', () => {
    render(<FlowToolbar {...defaultProps} canRedo={false} />)
    const redoBtn = screen.getByTestId('toolbar-redo') as HTMLButtonElement
    expect(redoBtn.disabled).toBe(true)
  })

  it('重做按钮在 canRedo=true 时可用', () => {
    render(<FlowToolbar {...defaultProps} canRedo={true} />)
    const redoBtn = screen.getByTestId('toolbar-redo') as HTMLButtonElement
    expect(redoBtn.disabled).toBe(false)
  })

  it('验证按钮点击应触发 onValidate', () => {
    const onValidate = vi.fn()
    render(<FlowToolbar {...defaultProps} onValidate={onValidate} />)
    fireEvent.click(screen.getByTestId('toolbar-validate'))
    expect(onValidate).toHaveBeenCalledTimes(1)
  })

  it('清空按钮点击应触发 onClear', () => {
    const onClear = vi.fn()
    render(<FlowToolbar {...defaultProps} onClear={onClear} />)
    fireEvent.click(screen.getByTestId('toolbar-clear'))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
