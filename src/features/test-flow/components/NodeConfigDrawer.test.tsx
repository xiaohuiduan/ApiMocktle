import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import NodeConfigDrawer from './NodeConfigDrawer'
import { useFlowStore } from '../store/useFlowStore'
import { FlowNodeType } from '../types/flow.types'

// Mock antd 组件
vi.mock('antd', () => ({
  Drawer: ({ children, open, title, ['data-testid']: testId }: Record<string, unknown>) => {
    const React = require('react')
    if (!open) return null
    return React.createElement('div', { 'data-testid': testId },
      React.createElement('div', null, title),
      children,
    )
  },
  Input: Object.assign(
    ({ defaultValue, onBlur, ['data-testid']: testId, placeholder }: Record<string, unknown>) => {
      const React = require('react')
      return React.createElement('input', {
        'data-testid': testId,
        defaultValue,
        onBlur,
        placeholder,
      })
    },
    {
      TextArea: ({ defaultValue, onBlur, ['data-testid']: testId, placeholder, rows }: Record<string, unknown>) => {
        const React = require('react')
        return React.createElement('textarea', {
          'data-testid': testId,
          defaultValue,
          onBlur,
          placeholder,
          rows,
        })
      },
    }
  ),
  InputNumber: ({ value, onChange, ['data-testid']: testId }: Record<string, unknown>) => {
    const React = require('react')
    return React.createElement('input', {
      type: 'number',
      'data-testid': testId,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => (onChange as (v: number | null) => void)?.(Number(e.target.value)),
    })
  },
  Switch: ({ checked, onChange, ['data-testid']: testId }: Record<string, unknown>) => {
    const React = require('react')
    return React.createElement('input', {
      type: 'checkbox',
      'data-testid': testId,
      checked,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => (onChange as (v: boolean) => void)?.(e.target.checked),
    })
  },
  Select: ({ value, onChange, ['data-testid']: testId, options }: Record<string, unknown>) => {
    const React = require('react')
    return React.createElement('select', {
      'data-testid': testId,
      value,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => (onChange as (v: string) => void)?.(e.target.value),
    },
      (options as any[])?.map((opt: any) =>
        React.createElement('option', { key: opt.value, value: opt.value }, opt.label)
      )
    )
  },
  Radio: {
    Group: ({ children, value, onChange, ['data-testid']: testId }: Record<string, unknown>) => {
      const React = require('react')
      return React.createElement('div', { 'data-testid': testId, 'data-value': value }, children)
    },
    Button: ({ children, value }: Record<string, unknown>) => {
      const React = require('react')
      return React.createElement('button', { 'data-value': value }, children)
    },
  },
  Space: ({ children, compact }: Record<string, unknown>) => {
    const React = require('react')
    return React.createElement('div', { 'data-compact': compact }, children)
  },
  Typography: {
    Text: ({ children, code, type, className }: Record<string, unknown>) => {
      const React = require('react')
      const tag = code ? 'code' : 'span'
      return React.createElement(tag, { className, 'data-type': type }, children)
    },
  },
  Tag: ({ children, color, icon }: Record<string, unknown>) => {
    const React = require('react')
    return React.createElement('span', { 'data-color': color }, icon, children)
  },
  Divider: () => {
    const React = require('react')
    return React.createElement('hr')
  },
  Collapse: ({ items }: Record<string, unknown>) => {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'collapse' },
      (items as any[])?.map((item: any) =>
        React.createElement('div', { key: item.key }, item.label)
      )
    )
  },
  Button: ({ children, onClick, icon }: Record<string, unknown>) => {
    const React = require('react')
    return React.createElement('button', { onClick }, icon, children)
  },
}))

// Mock FlowEditorContext
const mockContextValue = {
  projectId: 'test-project',
  taskId: 'test-task',
}

vi.mock('../contexts/FlowEditorContext', () => ({
  FlowEditorContext: {
    Provider: ({ children, value }: any) => children,
    Consumer: ({ children }: any) => children(mockContextValue),
  },
  useFlowEditorContext: () => mockContextValue,
}))

// Mock MonacoEditor
vi.mock('@/components/MonacoEditor/MonacoEditor', () => ({
  MonacoEditor: ({ value, onChange }: any) => {
    const React = require('react')
    return React.createElement('textarea', {
      'data-testid': 'monaco-editor',
      value,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(e.target.value),
    })
  },
}))

describe('NodeConfigDrawer', () => {
  beforeEach(() => {
    // 重置 store
    useFlowStore.getState().reset()
  })

  it('应该正常渲染不报错', () => {
    render(<NodeConfigDrawer />)
    // 没有选中节点时，抽屉不应显示
    expect(screen.queryByTestId('node-config-drawer')).toBeNull()
  })

  it('选中节点时应显示抽屉', () => {
    // 先添加一个节点到 store
    useFlowStore.getState().addNode({
      id: 'test-node-1',
      type: FlowNodeType.HttpRequest,
      position: { x: 0, y: 0 },
      data: { label: 'Test HTTP', enabled: true, menuItemId: '' },
    })

    // 选中该节点
    useFlowStore.getState().selectNode('test-node-1')

    render(<NodeConfigDrawer />)
    expect(screen.getByTestId('node-config-drawer')).toBeDefined()
  })

  it('未选中节点时不显示抽屉', () => {
    render(<NodeConfigDrawer />)
    expect(screen.queryByTestId('node-config-drawer')).toBeNull()
  })

  it('选中节点时应显示基础字段', () => {
    useFlowStore.getState().addNode({
      id: 'test-node-2',
      type: FlowNodeType.HttpRequest,
      position: { x: 0, y: 0 },
      data: { label: 'My Request', enabled: true, menuItemId: '' },
    })
    useFlowStore.getState().selectNode('test-node-2')

    render(<NodeConfigDrawer />)

    // 应该显示基础字段
    expect(screen.getByTestId('node-label-input')).toBeDefined()
    expect(screen.getByTestId('node-enabled-switch')).toBeDefined()
  })

  it('选中条件节点时应显示条件配置面板', () => {
    useFlowStore.getState().addNode({
      id: 'condition-node-1',
      type: FlowNodeType.Condition,
      position: { x: 0, y: 0 },
      data: {
        label: 'Condition',
        enabled: true,
        conditionType: 'expression',
      },
    })
    useFlowStore.getState().selectNode('condition-node-1')

    render(<NodeConfigDrawer />)

    // 应该显示条件类型选择器
    expect(screen.getByTestId('condition-type')).toBeDefined()
  })

  it('选中循环节点时应显示循环配置面板', () => {
    useFlowStore.getState().addNode({
      id: 'loop-node-1',
      type: FlowNodeType.Loop,
      position: { x: 0, y: 0 },
      data: {
        label: 'Loop',
        enabled: true,
        loopType: 'count',
        maxIterations: 100,
      },
    })
    useFlowStore.getState().selectNode('loop-node-1')

    render(<NodeConfigDrawer />)

    // 应该显示循环类型选择器
    expect(screen.getByTestId('loop-type')).toBeDefined()
    expect(screen.getByTestId('loop-max-iterations')).toBeDefined()
  })

  it('选中等待节点时应显示等待配置面板', () => {
    useFlowStore.getState().addNode({
      id: 'wait-node-1',
      type: FlowNodeType.Wait,
      position: { x: 0, y: 0 },
      data: {
        label: 'Wait',
        enabled: true,
        waitType: 'fixed',
      },
    })
    useFlowStore.getState().selectNode('wait-node-1')

    render(<NodeConfigDrawer />)

    // 应该显示等待类型选择器
    expect(screen.getByTestId('wait-type')).toBeDefined()
  })

  it('选中并行节点时应显示并行配置面板', () => {
    useFlowStore.getState().addNode({
      id: 'parallel-node-1',
      type: FlowNodeType.Parallel,
      position: { x: 0, y: 0 },
      data: {
        label: 'Parallel',
        enabled: true,
        branchCount: 2,
        waitAll: true,
      },
    })
    useFlowStore.getState().selectNode('parallel-node-1')

    render(<NodeConfigDrawer />)

    // 应该显示并行分支数输入框
    expect(screen.getByTestId('parallel-branch-count')).toBeDefined()
    expect(screen.getByTestId('parallel-wait-mode')).toBeDefined()
  })

  it('选中开始节点时只显示基础字段', () => {
    useFlowStore.getState().addNode({
      id: 'start-node-1',
      type: FlowNodeType.Start,
      position: { x: 0, y: 0 },
      data: {
        label: 'Start',
        enabled: true,
      },
    })
    useFlowStore.getState().selectNode('start-node-1')

    render(<NodeConfigDrawer />)

    // 应该只显示基础字段，没有特有配置面板
    expect(screen.getByTestId('node-label-input')).toBeDefined()
    expect(screen.getByTestId('node-enabled-switch')).toBeDefined()
    // 不应该有特有配置面板的 testid
    expect(screen.queryByTestId('condition-type')).toBeNull()
    expect(screen.queryByTestId('loop-type')).toBeNull()
  })
})
