import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFlowPersistence } from './useFlowPersistence'
import { useFlowStore } from '../store/useFlowStore'
import { FlowNodeType } from '../types/flow.types'

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

// ==================== 测试数据 ====================

const mockGraph = {
  nodes: [{ id: 'node-1', type: FlowNodeType.Start, position: { x: 0, y: 0 }, data: { label: 'Start', enabled: true } }],
  edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2', sourceHandle: null, targetHandle: null }],
}

const TASK_ID = 'task-001'

// ==================== 测试套件 ====================

describe('useFlowPersistence', () => {
  beforeEach(() => {
    useFlowStore.getState().reset()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ==================== 加载测试 ====================

  describe('loadFlow', () => {
    it('初始挂载时应从后端加载流程图', async () => {
      vi.useRealTimers()
      mockInvoke.mockResolvedValue({ ok: true, data: mockGraph })

      const { result } = renderHook(() => useFlowPersistence(TASK_ID))

      // 等待异步 loadFlow 完成
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(mockInvoke).toHaveBeenCalledWith('load_test_flow_graph', { taskId: TASK_ID })
      expect(result.current.loadFlow).toBeInstanceOf(Function)
    })

    it('加载成功后应调用 store.loadGraph', async () => {
      vi.useRealTimers()
      mockInvoke.mockResolvedValue({ ok: true, data: mockGraph })

      renderHook(() => useFlowPersistence(TASK_ID))

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      const { nodes, edges } = useFlowStore.getState()
      expect(nodes).toEqual(mockGraph.nodes)
      expect(edges).toEqual(mockGraph.edges)
    })

    it('加载返回 ok=false 时不调用 loadGraph', async () => {
      vi.useRealTimers()
      mockInvoke.mockResolvedValue({ ok: false, error: 'not found' })

      renderHook(() => useFlowPersistence(TASK_ID))

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      // store 应保持初始空状态
      expect(useFlowStore.getState().nodes).toEqual([])
      expect(useFlowStore.getState().edges).toEqual([])
    })

    it('加载失败时应 console.error', async () => {
      vi.useRealTimers()
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke.mockRejectedValue(new Error('network error'))

      renderHook(() => useFlowPersistence(TASK_ID))

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(consoleSpy).toHaveBeenCalledWith(
        '[useFlowPersistence] 加载流程图失败:',
        expect.any(Error),
      )
      consoleSpy.mockRestore()
    })

    it('手动调用 loadFlow 应重新加载', async () => {
      vi.useRealTimers()
      mockInvoke.mockResolvedValue({ ok: true, data: mockGraph })

      const { result } = renderHook(() => useFlowPersistence(TASK_ID))

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      // 手动再次加载
      mockInvoke.mockClear()
      await act(async () => {
        await result.current.loadFlow()
      })

      expect(mockInvoke).toHaveBeenCalledWith('load_test_flow_graph', { taskId: TASK_ID })
    })
  })

  // ==================== 保存测试 ====================

  describe('saveFlow（通过 forceSave）', () => {
    it('保存时应调用 invoke 和 markSaved', async () => {
      vi.useRealTimers()
      mockInvoke.mockResolvedValue({ ok: true, data: mockGraph })

      const { result } = renderHook(() => useFlowPersistence(TASK_ID))

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      mockInvoke.mockClear()
      mockInvoke.mockResolvedValue({ ok: true })

      // 设置脏状态
      act(() => {
        useFlowStore.getState().addNode({
          id: 'new-node',
          type: FlowNodeType.End,
          position: { x: 100, y: 100 },
          data: { label: 'End', enabled: true },
        })
      })

      expect(useFlowStore.getState().isDirty).toBe(true)

      // 强制保存
      await act(async () => {
        await result.current.forceSave()
      })

      expect(mockInvoke).toHaveBeenCalledWith('save_test_flow_graph', {
        taskId: TASK_ID,
        graphJson: expect.objectContaining({ nodes: expect.any(Array), edges: expect.any(Array) }),
      })
      expect(useFlowStore.getState().isDirty).toBe(false)
    })

    it('保存失败时应 console.error 且不调用 markSaved', async () => {
      vi.useRealTimers()
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke.mockResolvedValue({ ok: true, data: mockGraph })

      const { result } = renderHook(() => useFlowPersistence(TASK_ID))

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      // 设置脏状态
      act(() => {
        useFlowStore.getState().addNode({
          id: 'new-node',
          type: FlowNodeType.End,
          position: { x: 100, y: 100 },
          data: { label: 'End', enabled: true },
        })
      })

      // 保存将失败
      mockInvoke.mockRejectedValue(new Error('save error'))

      await act(async () => {
        await result.current.forceSave()
      })

      expect(consoleSpy).toHaveBeenCalledWith(
        '[useFlowPersistence] 保存流程图失败:',
        expect.any(Error),
      )
      // isDirty 仍为 true，因为 markSaved 未被调用
      expect(useFlowStore.getState().isDirty).toBe(true)
      consoleSpy.mockRestore()
    })
  })

  // ==================== 自动保存防抖测试 ====================

  describe('自动保存防抖', () => {
    it('isDirty 变为 true 后应在 2 秒后触发保存', async () => {
      vi.useFakeTimers()
      mockInvoke.mockResolvedValueOnce({ ok: true, data: mockGraph }) // loadFlow
      mockInvoke.mockResolvedValueOnce({ ok: true }) // saveFlow

      renderHook(() => useFlowPersistence(TASK_ID))

      // 推进初始 loadFlow 完成
      await vi.advanceTimersByTimeAsync(0)

      // 设置脏状态（触发自动保存的 useEffect）
      act(() => {
        useFlowStore.getState().addNode({
          id: 'new-node',
          type: FlowNodeType.End,
          position: { x: 100, y: 100 },
          data: { label: 'End', enabled: true },
        })
      })

      // 2 秒内不应保存
      await vi.advanceTimersByTimeAsync(1999)
      expect(mockInvoke).toHaveBeenCalledTimes(1) // 只有 loadFlow

      // 推进到 2 秒，应触发保存
      await vi.advanceTimersByTimeAsync(1)
      expect(mockInvoke).toHaveBeenCalledTimes(2)
      expect(mockInvoke).toHaveBeenLastCalledWith('save_test_flow_graph', {
        taskId: TASK_ID,
        graphJson: expect.any(Object),
      })
    })

    it('多次快速修改应重置防抖，只保存一次', async () => {
      vi.useFakeTimers()
      mockInvoke.mockResolvedValueOnce({ ok: true, data: mockGraph }) // loadFlow
      mockInvoke.mockResolvedValue({ ok: true }) // saveFlow（可能多次）

      renderHook(() => useFlowPersistence(TASK_ID))
      await vi.advanceTimersByTimeAsync(0)

      // 连续修改三次，每次间隔 500ms
      act(() => {
        useFlowStore.getState().addNode({
          id: 'node-a',
          type: FlowNodeType.Start,
          position: { x: 0, y: 0 },
          data: { label: 'A', enabled: true },
        })
      })

      await vi.advanceTimersByTimeAsync(500)
      // isDirty 仍是 true，不需要重新设置
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(500)

      // 1.5 秒内不应保存
      expect(mockInvoke).toHaveBeenCalledTimes(1) // 只有 loadFlow

      // 从最后一次修改推 2 秒
      await vi.advanceTimersByTimeAsync(500) // 共 2 秒

      expect(mockInvoke).toHaveBeenCalledTimes(2) // loadFlow + 1 次 saveFlow
    })

    it('forceSave 应取消待执行的自动保存定时器', async () => {
      vi.useFakeTimers()
      mockInvoke.mockResolvedValueOnce({ ok: true, data: mockGraph }) // loadFlow
      mockInvoke.mockResolvedValue({ ok: true }) // saveFlow

      const { result } = renderHook(() => useFlowPersistence(TASK_ID))
      await vi.advanceTimersByTimeAsync(0)

      // 设置脏状态
      act(() => {
        useFlowStore.getState().addNode({
          id: 'new-node',
          type: FlowNodeType.End,
          position: { x: 100, y: 100 },
          data: { label: 'End', enabled: true },
        })
      })

      // 1 秒后强制保存（取消自动保存定时器）
      await vi.advanceTimersByTimeAsync(1000)
      await act(async () => {
        await result.current.forceSave()
      })

      // 此时已保存
      expect(mockInvoke).toHaveBeenCalledTimes(2) // loadFlow + forceSave

      // isDirty 已被 markSaved 置为 false，不会再触发自动保存
      await vi.advanceTimersByTimeAsync(3000)
      expect(mockInvoke).toHaveBeenCalledTimes(2) // 没有额外保存
    })

    it('isDirty 为 false 时不触发自动保存', async () => {
      vi.useFakeTimers()
      mockInvoke.mockResolvedValue({ ok: true, data: mockGraph })

      renderHook(() => useFlowPersistence(TASK_ID))
      await vi.advanceTimersByTimeAsync(0)

      // 推进足够时间，不应有保存调用
      await vi.advanceTimersByTimeAsync(5000)
      expect(mockInvoke).toHaveBeenCalledTimes(1) // 只有 loadFlow
    })
  })

  // ==================== taskId 变更测试 ====================

  describe('taskId 变更', () => {
    it('taskId 变更时应加载新的流程图', async () => {
      vi.useRealTimers()
      mockInvoke.mockResolvedValue({ ok: true, data: mockGraph })

      const { rerender, result } = renderHook(
        ({ taskId }) => useFlowPersistence(taskId),
        { initialProps: { taskId: TASK_ID } },
      )

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(mockInvoke).toHaveBeenCalledWith('load_test_flow_graph', { taskId: TASK_ID })
      expect(result.current.loadFlow).toBeInstanceOf(Function)

      // 更换 taskId
      const newGraph = {
        nodes: [{ id: 'other', type: FlowNodeType.End, position: { x: 0, y: 0 }, data: { label: 'Other', enabled: true } }],
        edges: [],
      }
      mockInvoke.mockResolvedValue({ ok: true, data: newGraph })

      rerender({ taskId: 'task-002' })

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(mockInvoke).toHaveBeenCalledWith('load_test_flow_graph', { taskId: 'task-002' })
    })
  })
})
