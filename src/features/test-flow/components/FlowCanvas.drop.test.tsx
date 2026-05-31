import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useFlowStore } from '../store/useFlowStore'
import { FlowNodeType } from '../types/flow.types'

// ==================== Mock @xyflow/react ====================
// onDrop/onDragOver 挂在 <ReactFlow> 上，由其内部 Pane 层接收事件。
// Mock ReactFlow 捕获这些 handler，测试中直接调用来验证逻辑。

let capturedOnDrop: ((e: any) => void) | null = null
let capturedOnDragOver: ((e: any) => void) | null = null

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ onDrop, onDragOver, nodes, children }: any) => {
    capturedOnDrop = onDrop
    capturedOnDragOver = onDragOver
    return (
      <div data-testid="mock-reactflow">
        {nodes?.map((n: any) => (
          <div key={n.id} data-testid={`node-${n.id}`} data-node-type={n.type}>
            {n.data?.label}
          </div>
        ))}
        {children}
      </div>
    )
  },
  ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
  Background: () => null,
  MiniMap: () => null,
  Controls: () => null,
  useReactFlow: () => ({
    screenToFlowPosition: (pos: { x: number; y: number }) => ({
      x: pos.x - 200,
      y: pos.y - 100,
    }),
  }),
  applyNodeChanges: (changes: any[], nodes: any[]) => {
    const removeIds = new Set(changes.filter((c: any) => c.type === 'remove').map((c: any) => c.id))
    return nodes.filter((n: any) => !removeIds.has(n.id))
  },
  applyEdgeChanges: (_changes: any[], edges: any[]) => edges,
  addEdge: (connection: any, edges: any[]) => [...edges, { ...connection, id: `edge-${Date.now()}` }],
}))

vi.mock('antd', () => ({
  theme: { useToken: () => ({ token: { colorPrimary: '#1677ff', colorBgContainer: '#fff' } }) },
}))

// ==================== 导入被测组件 ====================
import FlowCanvas from './FlowCanvas'

// ==================== 辅助函数 ====================

function createDropEvent(data: Record<string, string>): DragEvent {
  return {
    preventDefault: vi.fn(),
    clientX: 400,
    clientY: 300,
    dataTransfer: {
      getData: (key: string) => data[key] || '',
      setData: vi.fn(),
      dropEffect: 'move',
      effectAllowed: 'move',
    },
  } as unknown as DragEvent
}

// ==================== 测试套件 ====================

describe('FlowCanvas 拖拽放置功能', () => {
  beforeEach(() => {
    capturedOnDrop = null
    capturedOnDragOver = null
    useFlowStore.getState().reset()
    vi.clearAllMocks()
  })

  describe('画布渲染', () => {
    it('FlowCanvas 正确渲染，包含 data-testid="flow-canvas"', () => {
      const { getByTestId } = render(<FlowCanvas />)
      expect(getByTestId('flow-canvas')).toBeTruthy()
    })
  })

  describe('onDrop 事件 — 节点创建', () => {
    it('拖拽放置 HTTP 请求节点 → store 中创建对应节点', async () => {
      render(<FlowCanvas />)
      expect(capturedOnDrop).toBeTruthy()

      expect(useFlowStore.getState().nodes).toHaveLength(0)

      await act(async () => {
        capturedOnDrop!(createDropEvent({ 'application/reactflow': FlowNodeType.HttpRequest }))
      })

      const nodes = useFlowStore.getState().nodes
      expect(nodes).toHaveLength(1)
      expect(nodes[0].type).toBe(FlowNodeType.HttpRequest)
      expect(nodes[0].data.label).toBe('HTTP Request')
      expect(nodes[0].id).toMatch(/^httpRequest-/)
    })

    it('拖拽放置开始节点 → type 为 start', async () => {
      render(<FlowCanvas />)
      await act(async () => {
        capturedOnDrop!(createDropEvent({ 'application/reactflow': FlowNodeType.Start }))
      })

      const nodes = useFlowStore.getState().nodes
      expect(nodes).toHaveLength(1)
      expect(nodes[0].type).toBe(FlowNodeType.Start)
      expect(nodes[0].data.label).toBe('Start')
    })

    it('拖拽放置条件节点 → type 为 condition', async () => {
      render(<FlowCanvas />)
      await act(async () => {
        capturedOnDrop!(createDropEvent({ 'application/reactflow': FlowNodeType.Condition }))
      })

      const nodes = useFlowStore.getState().nodes
      expect(nodes).toHaveLength(1)
      expect(nodes[0].type).toBe(FlowNodeType.Condition)
    })

    it('拖拽放置未知类型节点 → label 为 Unknown', async () => {
      render(<FlowCanvas />)
      await act(async () => {
        capturedOnDrop!(createDropEvent({ 'application/reactflow': 'unknownType' }))
      })

      const nodes = useFlowStore.getState().nodes
      expect(nodes).toHaveLength(1)
      expect(nodes[0].data.label).toBe('Unknown')
    })

    it('连续放置 3 个节点 → 3 个节点，id 唯一', async () => {
      render(<FlowCanvas />)

      for (const type of [FlowNodeType.Start, FlowNodeType.HttpRequest, FlowNodeType.End]) {
        await act(async () => {
          capturedOnDrop!(createDropEvent({ 'application/reactflow': type }))
        })
      }

      const nodes = useFlowStore.getState().nodes
      expect(nodes).toHaveLength(3)
      expect(new Set(nodes.map((n) => n.id)).size).toBe(3)
    })

    it('放置节点后 isDirty 为 true', async () => {
      render(<FlowCanvas />)
      expect(useFlowStore.getState().isDirty).toBe(false)

      await act(async () => {
        capturedOnDrop!(createDropEvent({ 'application/reactflow': FlowNodeType.HttpRequest }))
      })

      expect(useFlowStore.getState().isDirty).toBe(true)
    })
  })

  describe('onDrop 事件 — 坐标转换', () => {
    it('节点位置由 screenToFlowPosition 计算', async () => {
      render(<FlowCanvas />)
      await act(async () => {
        capturedOnDrop!(createDropEvent({ 'application/reactflow': FlowNodeType.HttpRequest }))
      })

      const node = useFlowStore.getState().nodes[0]
      expect(node.position.x).toBe(200) // 400 - 200
      expect(node.position.y).toBe(200) // 300 - 100
    })

    it('不同放置位置产生不同坐标', async () => {
      render(<FlowCanvas />)

      await act(async () => {
        capturedOnDrop!(createDropEvent({ 'application/reactflow': FlowNodeType.Start }))
      })

      const event2 = {
        ...createDropEvent({ 'application/reactflow': FlowNodeType.End }),
        clientX: 600,
        clientY: 500,
      } as unknown as DragEvent
      await act(async () => {
        capturedOnDrop!(event2)
      })

      const nodes = useFlowStore.getState().nodes
      expect(nodes[0].position).not.toEqual(nodes[1].position)
    })
  })

  describe('onDrop 事件 — 无效数据', () => {
    it('无 application/reactflow 数据 → 不创建节点', async () => {
      render(<FlowCanvas />)
      await act(async () => {
        capturedOnDrop!(createDropEvent({}))
      })
      expect(useFlowStore.getState().nodes).toHaveLength(0)
    })

    it('application/reactflow 值为空 → 不创建节点', async () => {
      render(<FlowCanvas />)
      await act(async () => {
        capturedOnDrop!(createDropEvent({ 'application/reactflow': '' }))
      })
      expect(useFlowStore.getState().nodes).toHaveLength(0)
    })

    it('错误的 key → 不创建节点', async () => {
      render(<FlowCanvas />)
      await act(async () => {
        capturedOnDrop!(createDropEvent({ 'text/plain': FlowNodeType.HttpRequest }))
      })
      expect(useFlowStore.getState().nodes).toHaveLength(0)
    })
  })

  describe('onDragOver 事件', () => {
    it('onDragOver 被正确注册', () => {
      render(<FlowCanvas />)
      expect(capturedOnDragOver).toBeTruthy()
      expect(typeof capturedOnDragOver).toBe('function')
    })

    it('onDragOver 调用 preventDefault 并设置 dropEffect', () => {
      render(<FlowCanvas />)

      const event = {
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: '' },
      }

      capturedOnDragOver!(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.dataTransfer.dropEffect).toBe('move')
    })
  })

  describe('节点数据完整性', () => {
    it('节点包含 id, type, position, data', async () => {
      render(<FlowCanvas />)
      await act(async () => {
        capturedOnDrop!(createDropEvent({ 'application/reactflow': FlowNodeType.Loop }))
      })

      const node = useFlowStore.getState().nodes[0]
      expect(node).toHaveProperty('id')
      expect(node).toHaveProperty('type')
      expect(node).toHaveProperty('position')
      expect(node).toHaveProperty('data')
      expect(typeof node.id).toBe('string')
      expect(typeof node.data.enabled).toBe('boolean')
    })

    it('每种节点类型默认 enabled: true', async () => {
      render(<FlowCanvas />)

      const types = [
        FlowNodeType.Start, FlowNodeType.End, FlowNodeType.HttpRequest,
        FlowNodeType.Condition, FlowNodeType.Loop, FlowNodeType.Parallel,
        FlowNodeType.Wait, FlowNodeType.SubFlow, FlowNodeType.SetVariable, FlowNodeType.Assert,
      ]

      for (const type of types) {
        useFlowStore.getState().reset()
        await act(async () => {
          capturedOnDrop!(createDropEvent({ 'application/reactflow': type }))
        })
        expect(useFlowStore.getState().nodes[0].data.enabled).toBe(true)
      }
    })
  })
})
