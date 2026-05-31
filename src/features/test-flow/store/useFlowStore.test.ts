import { describe, it, expect, beforeEach } from 'vitest'
import { useFlowStore } from './useFlowStore'
import { FlowNodeType } from '../types/flow.types'
import type { FlowNode } from '../types/flow.types'

describe('useFlowStore', () => {
  beforeEach(() => {
    // 每个测试前重置 store
    useFlowStore.getState().reset()
  })

  describe('初始状态', () => {
    it('应该有空的节点和边', () => {
      const { nodes, edges } = useFlowStore.getState()
      expect(nodes).toEqual([])
      expect(edges).toEqual([])
    })

    it('应该没有选中的节点', () => {
      const { selectedNodeId } = useFlowStore.getState()
      expect(selectedNodeId).toBeNull()
    })

    it('应该关闭抽屉', () => {
      const { drawerOpen } = useFlowStore.getState()
      expect(drawerOpen).toBe(false)
    })

    it('应该不是脏状态', () => {
      const { isDirty } = useFlowStore.getState()
      expect(isDirty).toBe(false)
    })

    it('应该有空的历史记录', () => {
      const { history, historyIndex } = useFlowStore.getState()
      expect(history).toEqual([])
      expect(historyIndex).toBe(-1)
    })
  })

  describe('添加节点', () => {
    it('应该添加节点', () => {
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }

      useFlowStore.getState().addNode(node)
      const { nodes } = useFlowStore.getState()

      expect(nodes).toHaveLength(1)
      expect(nodes[0].id).toBe('node-1')
    })

    it('应该标记为脏状态', () => {
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }

      useFlowStore.getState().addNode(node)
      const { isDirty } = useFlowStore.getState()

      expect(isDirty).toBe(true)
    })

    it('应该推送历史记录', () => {
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }

      useFlowStore.getState().addNode(node)
      const { history, historyIndex } = useFlowStore.getState()

      expect(history).toHaveLength(1)
      expect(historyIndex).toBe(0)
    })
  })

  describe('删除节点', () => {
    it('应该删除指定节点', () => {
      const node1: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }
      const node2: FlowNode = {
        id: 'node-2',
        type: FlowNodeType.End,
        position: { x: 100, y: 0 },
        data: { label: 'End', enabled: true },
      }

      useFlowStore.getState().addNode(node1)
      useFlowStore.getState().addNode(node2)
      useFlowStore.getState().deleteNodes(['node-1'])

      const { nodes } = useFlowStore.getState()
      expect(nodes).toHaveLength(1)
      expect(nodes[0].id).toBe('node-2')
    })

    it('应该删除关联的边', () => {
      const node1: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }
      const node2: FlowNode = {
        id: 'node-2',
        type: FlowNodeType.End,
        position: { x: 100, y: 0 },
        data: { label: 'End', enabled: true },
      }

      useFlowStore.getState().addNode(node1)
      useFlowStore.getState().addNode(node2)
      useFlowStore.getState().onConnect({
        source: 'node-1',
        target: 'node-2',
        sourceHandle: null,
        targetHandle: null,
      })

      useFlowStore.getState().deleteNodes(['node-1'])

      const { edges } = useFlowStore.getState()
      expect(edges).toHaveLength(0)
    })

    it('应该清除选中的节点', () => {
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }

      useFlowStore.getState().addNode(node)
      useFlowStore.getState().selectNode('node-1')
      useFlowStore.getState().deleteNodes(['node-1'])

      const { selectedNodeId } = useFlowStore.getState()
      expect(selectedNodeId).toBeNull()
    })
  })

  describe('更新节点数据', () => {
    it('应该更新节点数据', () => {
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.HttpRequest,
        position: { x: 0, y: 0 },
        data: { label: 'Old Label', enabled: true, menuItemId: 'api-1' },
      }

      useFlowStore.getState().addNode(node)
      useFlowStore.getState().updateNodeData('node-1', {
        label: 'New Label',
      })

      const { nodes } = useFlowStore.getState()
      expect(nodes[0].data.label).toBe('New Label')
    })

    it('应该保留其他数据', () => {
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.HttpRequest,
        position: { x: 0, y: 0 },
        data: { label: 'Old Label', enabled: true, menuItemId: 'api-1' },
      }

      useFlowStore.getState().addNode(node)
      useFlowStore.getState().updateNodeData('node-1', {
        label: 'New Label',
      })

      const { nodes } = useFlowStore.getState()
      expect(nodes[0].data.menuItemId).toBe('api-1')
      expect(nodes[0].data.enabled).toBe(true)
    })
  })

  describe('选择节点', () => {
    it('应该设置选中的节点', () => {
      useFlowStore.getState().selectNode('node-1')

      const { selectedNodeId } = useFlowStore.getState()
      expect(selectedNodeId).toBe('node-1')
    })

    it('应该打开抽屉', () => {
      useFlowStore.getState().selectNode('node-1')

      const { drawerOpen } = useFlowStore.getState()
      expect(drawerOpen).toBe(true)
    })

    it('应该清除选中的节点', () => {
      useFlowStore.getState().selectNode('node-1')
      useFlowStore.getState().selectNode(null)

      const { selectedNodeId, drawerOpen } = useFlowStore.getState()
      expect(selectedNodeId).toBeNull()
      expect(drawerOpen).toBe(false)
    })
  })

  describe('设置抽屉状态', () => {
    it('应该打开抽屉', () => {
      useFlowStore.getState().setDrawerOpen(true)

      const { drawerOpen } = useFlowStore.getState()
      expect(drawerOpen).toBe(true)
    })

    it('应该关闭抽屉并清除选中', () => {
      useFlowStore.getState().selectNode('node-1')
      useFlowStore.getState().setDrawerOpen(false)

      const { drawerOpen, selectedNodeId } = useFlowStore.getState()
      expect(drawerOpen).toBe(false)
      expect(selectedNodeId).toBeNull()
    })
  })

  describe('连接边', () => {
    it('应该添加边', () => {
      const node1: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }
      const node2: FlowNode = {
        id: 'node-2',
        type: FlowNodeType.End,
        position: { x: 100, y: 0 },
        data: { label: 'End', enabled: true },
      }

      useFlowStore.getState().addNode(node1)
      useFlowStore.getState().addNode(node2)
      useFlowStore.getState().onConnect({
        source: 'node-1',
        target: 'node-2',
        sourceHandle: null,
        targetHandle: null,
      })

      const { edges } = useFlowStore.getState()
      expect(edges).toHaveLength(1)
      expect(edges[0].source).toBe('node-1')
      expect(edges[0].target).toBe('node-2')
    })
  })

  describe('加载图', () => {
    it('应该加载图', () => {
      const graph = {
        nodes: [
          {
            id: 'node-1',
            type: FlowNodeType.Start,
            position: { x: 0, y: 0 },
            data: { label: 'Start', enabled: true },
          },
        ],
        edges: [],
      }

      useFlowStore.getState().loadGraph(graph)

      const { nodes, edges, isDirty } = useFlowStore.getState()
      expect(nodes).toHaveLength(1)
      expect(edges).toHaveLength(0)
      expect(isDirty).toBe(false)
    })

    it('应该清除历史记录', () => {
      // 先添加一些历史
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }
      useFlowStore.getState().addNode(node)

      const graph = {
        nodes: [
          {
            id: 'node-2',
            type: FlowNodeType.End,
            position: { x: 0, y: 0 },
            data: { label: 'End', enabled: true },
          },
        ],
        edges: [],
      }

      useFlowStore.getState().loadGraph(graph)

      const { history, historyIndex } = useFlowStore.getState()
      expect(history).toEqual([])
      expect(historyIndex).toBe(-1)
    })
  })

  describe('获取图', () => {
    it('应该返回可序列化的图', () => {
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }

      useFlowStore.getState().addNode(node)

      const graph = useFlowStore.getState().getGraph()

      expect(graph.nodes).toHaveLength(1)
      expect(graph.nodes[0].id).toBe('node-1')
      expect(graph.edges).toHaveLength(0)
    })

    it('应该只包含可序列化的属性', () => {
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }

      useFlowStore.getState().addNode(node)

      const graph = useFlowStore.getState().getGraph()
      const serializedNode = graph.nodes[0]

      expect(serializedNode.id).toBeDefined()
      expect(serializedNode.type).toBeDefined()
      expect(serializedNode.position).toBeDefined()
      expect(serializedNode.data).toBeDefined()
    })
  })

  describe('标记为已保存', () => {
    it('应该清除脏状态', () => {
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }

      useFlowStore.getState().addNode(node)
      expect(useFlowStore.getState().isDirty).toBe(true)

      useFlowStore.getState().markSaved()
      expect(useFlowStore.getState().isDirty).toBe(false)
    })

    it('应该更新 lastSavedGraph', () => {
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }

      useFlowStore.getState().addNode(node)
      useFlowStore.getState().markSaved()

      const { lastSavedGraph } = useFlowStore.getState()
      expect(lastSavedGraph).not.toBeNull()
      expect(lastSavedGraph?.nodes).toHaveLength(1)
    })
  })

  describe('撤销/重做', () => {
    it('应该撤销操作', () => {
      const node1: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }
      const node2: FlowNode = {
        id: 'node-2',
        type: FlowNodeType.End,
        position: { x: 100, y: 0 },
        data: { label: 'End', enabled: true },
      }

      useFlowStore.getState().addNode(node1)
      useFlowStore.getState().addNode(node2)

      const stateBeforeUndo = useFlowStore.getState()
      expect(stateBeforeUndo.nodes).toHaveLength(2)
      expect(stateBeforeUndo.history).toHaveLength(2)
      expect(stateBeforeUndo.historyIndex).toBe(1)

      useFlowStore.getState().undo()

      const stateAfterUndo = useFlowStore.getState()
      expect(stateAfterUndo.historyIndex).toBe(0)
      expect(stateAfterUndo.nodes).toHaveLength(1)
      expect(stateAfterUndo.nodes[0].id).toBe('node-1')
    })

    it('应该重做操作', () => {
      const node1: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }
      const node2: FlowNode = {
        id: 'node-2',
        type: FlowNodeType.End,
        position: { x: 100, y: 0 },
        data: { label: 'End', enabled: true },
      }

      useFlowStore.getState().addNode(node1)
      useFlowStore.getState().addNode(node2)
      useFlowStore.getState().undo()

      const stateBeforeRedo = useFlowStore.getState()
      expect(stateBeforeRedo.historyIndex).toBe(0)
      expect(stateBeforeRedo.nodes).toHaveLength(1)

      useFlowStore.getState().redo()

      const stateAfterRedo = useFlowStore.getState()
      // 重做应该恢复到添加第二个节点之前的状态
      expect(stateAfterRedo.historyIndex).toBe(1)
      expect(stateAfterRedo.nodes).toHaveLength(1)
      expect(stateAfterRedo.nodes[0].id).toBe('node-1')
    })

    it('应该限制历史记录长度', () => {
      // 添加超过 MAX_HISTORY 个节点
      for (let i = 0; i < 60; i++) {
        const node: FlowNode = {
          id: `node-${i}`,
          type: FlowNodeType.Start,
          position: { x: i * 100, y: 0 },
          data: { label: `Node ${i}`, enabled: true },
        }
        useFlowStore.getState().addNode(node)
      }

      const { history } = useFlowStore.getState()
      expect(history.length).toBeLessThanOrEqual(50)
    })

    it('应该在开头无法撤销', () => {
      useFlowStore.getState().undo()

      const { historyIndex } = useFlowStore.getState()
      expect(historyIndex).toBe(-1)
    })

    it('应该在结尾无法重做', () => {
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }

      useFlowStore.getState().addNode(node)
      useFlowStore.getState().redo()

      const { historyIndex, history } = useFlowStore.getState()
      expect(historyIndex).toBe(history.length - 1)
    })
  })

  describe('清空历史', () => {
    it('应该清空历史记录', () => {
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }

      useFlowStore.getState().addNode(node)
      useFlowStore.getState().clearHistory()

      const { history, historyIndex } = useFlowStore.getState()
      expect(history).toEqual([])
      expect(historyIndex).toBe(-1)
    })
  })

  describe('重置', () => {
    it('应该重置所有状态', () => {
      const node: FlowNode = {
        id: 'node-1',
        type: FlowNodeType.Start,
        position: { x: 0, y: 0 },
        data: { label: 'Start', enabled: true },
      }

      useFlowStore.getState().addNode(node)
      useFlowStore.getState().selectNode('node-1')
      useFlowStore.getState().reset()

      const state = useFlowStore.getState()
      expect(state.nodes).toEqual([])
      expect(state.edges).toEqual([])
      expect(state.selectedNodeId).toBeNull()
      expect(state.drawerOpen).toBe(false)
      expect(state.isDirty).toBe(false)
      expect(state.lastSavedGraph).toBeNull()
      expect(state.history).toEqual([])
      expect(state.historyIndex).toBe(-1)
    })
  })
})
