import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTestTask, useTestTaskDetail, useTestExecutions } from './useTestTask'

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

// ==================== 测试数据 ====================

const PROJECT_ID = 'project-1'

const mockTasks = [
  { id: 'task-1', projectId: PROJECT_ID, name: '任务一', description: 'desc-1', status: 'idle' as const, failFast: true, createdAt: '2025-01-01', updatedAt: '2025-01-01' },
  { id: 'task-2', projectId: PROJECT_ID, name: '任务二', description: 'desc-2', status: 'passed' as const, failFast: false, createdAt: '2025-01-02', updatedAt: '2025-01-02' },
]

const mockTaskDetail = {
  task: { ...mockTasks[0] },
  steps: [
    { id: 'step-1', taskId: 'task-1', sortOrder: 0, name: '步骤一', menuItemId: 'menu-1', enabled: true, createdAt: '2025-01-01', updatedAt: '2025-01-01' },
    { id: 'step-2', taskId: 'task-1', sortOrder: 1, name: '步骤二', menuItemId: 'menu-2', enabled: true, createdAt: '2025-01-01', updatedAt: '2025-01-01' },
  ],
}

const mockExecutions = [
  { id: 'exec-1', taskId: 'task-1', status: 'passed' as const, totalSteps: 2, passedSteps: 2, failedSteps: 0, skippedSteps: 0, totalDurationMs: 500, startedAt: '2025-01-01', finishedAt: '2025-01-01' },
  { id: 'exec-2', taskId: 'task-1', status: 'failed' as const, totalSteps: 2, passedSteps: 1, failedSteps: 1, skippedSteps: 0, totalDurationMs: 300, startedAt: '2025-01-02', finishedAt: '2025-01-02' },
]

// ==================== useTestTask ====================

describe('useTestTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchTasks', () => {
    it('成功获取任务列表', async () => {
      mockInvoke.mockResolvedValue({ ok: true, data: mockTasks })
      const { result } = renderHook(() => useTestTask(PROJECT_ID))

      await act(async () => {
        await result.current.fetchTasks()
      })

      expect(result.current.tasks).toEqual(mockTasks)
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(mockInvoke).toHaveBeenCalledWith('list_test_tasks', { projectId: PROJECT_ID })
    })

    it('fetchTasks 返回 ok=false 时设置 error', async () => {
      mockInvoke.mockResolvedValue({ ok: false, error: '权限不足' })
      const { result } = renderHook(() => useTestTask(PROJECT_ID))

      await act(async () => {
        await result.current.fetchTasks()
      })

      expect(result.current.tasks).toEqual([])
      expect(result.current.error).toBe('权限不足')
    })

    it('fetchTasks 抛异常时设置 error', async () => {
      mockInvoke.mockRejectedValue(new Error('网络错误'))
      const { result } = renderHook(() => useTestTask(PROJECT_ID))

      await act(async () => {
        await result.current.fetchTasks()
      })

      expect(result.current.error).toBe('Error: 网络错误')
    })

    it('fetchTasks 设置 loading 状态', async () => {
      let resolvePromise: (value: any) => void
      const pendingPromise = new Promise((resolve) => { resolvePromise = resolve })
      mockInvoke.mockReturnValue(pendingPromise as any)

      const { result } = renderHook(() => useTestTask(PROJECT_ID))

      // 开始加载
      act(() => {
        result.current.fetchTasks()
      })
      expect(result.current.loading).toBe(true)

      // 完成加载
      await act(async () => {
        resolvePromise!({ ok: true, data: [] })
        await pendingPromise
      })
      expect(result.current.loading).toBe(false)
    })
  })

  describe('createTask', () => {
    it('成功创建任务并插入列表头部', async () => {
      const newTask = { id: 'task-new', projectId: PROJECT_ID, name: '新任务', description: '', status: 'idle' as const, failFast: false, createdAt: '2025-01-03', updatedAt: '2025-01-03' }
      mockInvoke.mockResolvedValueOnce({ ok: true, data: mockTasks }) // fetchTasks
      mockInvoke.mockResolvedValueOnce({ ok: true, data: newTask }) // createTask

      const { result } = renderHook(() => useTestTask(PROJECT_ID))

      await act(async () => {
        await result.current.fetchTasks()
      })

      let created: any
      await act(async () => {
        created = await result.current.createTask({ projectId: PROJECT_ID, name: '新任务' })
      })

      expect(created).toEqual(newTask)
      expect(result.current.tasks[0]).toEqual(newTask)
      expect(result.current.tasks).toHaveLength(3)
    })

    it('创建失败返回 null 并设置 error', async () => {
      mockInvoke.mockResolvedValue({ ok: false, error: '名称已存在' })
      const { result } = renderHook(() => useTestTask(PROJECT_ID))

      let created: any
      await act(async () => {
        created = await result.current.createTask({ projectId: PROJECT_ID, name: '重复任务' })
      })

      expect(created).toBeNull()
      expect(result.current.error).toBe('名称已存在')
    })
  })

  describe('updateTask', () => {
    it('成功更新任务', async () => {
      const updatedTask = { ...mockTasks[0], name: '已更新' }
      mockInvoke.mockResolvedValueOnce({ ok: true, data: mockTasks }) // fetchTasks
      mockInvoke.mockResolvedValueOnce({ ok: true, data: updatedTask }) // updateTask

      const { result } = renderHook(() => useTestTask(PROJECT_ID))

      await act(async () => {
        await result.current.fetchTasks()
      })

      let updated: any
      await act(async () => {
        updated = await result.current.updateTask('task-1', { name: '已更新' })
      })

      expect(updated).toEqual(updatedTask)
      expect(result.current.tasks.find(t => t.id === 'task-1')?.name).toBe('已更新')
    })

    it('更新失败返回 null', async () => {
      mockInvoke.mockResolvedValue({ ok: false, error: '更新失败' })
      const { result } = renderHook(() => useTestTask(PROJECT_ID))

      let updated: any
      await act(async () => {
        updated = await result.current.updateTask('task-1', { name: 'xxx' })
      })

      expect(updated).toBeNull()
    })
  })

  describe('deleteTask', () => {
    it('成功删除任务', async () => {
      mockInvoke.mockResolvedValueOnce({ ok: true, data: mockTasks }) // fetchTasks
      mockInvoke.mockResolvedValueOnce({ ok: true, data: null }) // deleteTask

      const { result } = renderHook(() => useTestTask(PROJECT_ID))

      await act(async () => {
        await result.current.fetchTasks()
      })

      expect(result.current.tasks).toHaveLength(2)

      let success: any
      await act(async () => {
        success = await result.current.deleteTask('task-1')
      })

      expect(success).toBe(true)
      expect(result.current.tasks).toHaveLength(1)
      expect(result.current.tasks.find(t => t.id === 'task-1')).toBeUndefined()
    })

    it('删除失败返回 false', async () => {
      mockInvoke.mockResolvedValue({ ok: false, error: '删除失败' })
      const { result } = renderHook(() => useTestTask(PROJECT_ID))

      let success: any
      await act(async () => {
        success = await result.current.deleteTask('task-1')
      })

      expect(success).toBe(false)
    })
  })
})

// ==================== useTestTaskDetail ====================

describe('useTestTaskDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchTaskDetail', () => {
    it('taskId 为 null 时不调用 invoke', async () => {
      const { result } = renderHook(() => useTestTaskDetail(null))

      await act(async () => {
        await result.current.fetchTaskDetail()
      })

      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('成功获取任务详情', async () => {
      mockInvoke.mockResolvedValue({ ok: true, data: mockTaskDetail })
      const { result } = renderHook(() => useTestTaskDetail('task-1'))

      await act(async () => {
        await result.current.fetchTaskDetail()
      })

      expect(result.current.taskDetail).toEqual(mockTaskDetail)
      expect(mockInvoke).toHaveBeenCalledWith('get_test_task', { taskId: 'task-1' })
    })

    it('获取失败时设置 error', async () => {
      mockInvoke.mockResolvedValue({ ok: false, error: 'not found' })
      const { result } = renderHook(() => useTestTaskDetail('task-1'))

      await act(async () => {
        await result.current.fetchTaskDetail()
      })

      expect(result.current.taskDetail).toBeNull()
      expect(result.current.error).toBe('not found')
    })
  })

  describe('addStep', () => {
    it('成功添加步骤并追加到列表末尾', async () => {
      const newStep = { id: 'step-3', taskId: 'task-1', sortOrder: 2, name: '新步骤', menuItemId: 'menu-3', enabled: true, createdAt: '2025-01-03', updatedAt: '2025-01-03' }
      mockInvoke.mockResolvedValueOnce({ ok: true, data: mockTaskDetail }) // fetchTaskDetail
      mockInvoke.mockResolvedValueOnce({ ok: true, data: newStep }) // addStep

      const { result } = renderHook(() => useTestTaskDetail('task-1'))

      await act(async () => {
        await result.current.fetchTaskDetail()
      })

      let added: any
      await act(async () => {
        added = await result.current.addStep({ taskId: 'task-1', menuItemId: 'menu-3', name: '新步骤' })
      })

      expect(added).toEqual(newStep)
      expect(result.current.taskDetail?.steps).toHaveLength(3)
      expect(result.current.taskDetail?.steps[2]).toEqual(newStep)
    })
  })

  describe('updateStep', () => {
    it('成功更新步骤（不可变替换）', async () => {
      const updatedStep = { ...mockTaskDetail.steps[0], name: '已更新步骤' }
      mockInvoke.mockResolvedValueOnce({ ok: true, data: mockTaskDetail }) // fetchTaskDetail
      mockInvoke.mockResolvedValueOnce({ ok: true, data: updatedStep }) // updateStep

      const { result } = renderHook(() => useTestTaskDetail('task-1'))

      await act(async () => {
        await result.current.fetchTaskDetail()
      })

      let updated: any
      await act(async () => {
        updated = await result.current.updateStep('step-1', { name: '已更新步骤' })
      })

      expect(updated).toEqual(updatedStep)
      expect(result.current.taskDetail?.steps[0].name).toBe('已更新步骤')
      // 第二个步骤不受影响
      expect(result.current.taskDetail?.steps[1].name).toBe('步骤二')
    })
  })

  describe('deleteStep', () => {
    it('成功删除步骤', async () => {
      mockInvoke.mockResolvedValueOnce({ ok: true, data: mockTaskDetail }) // fetchTaskDetail
      mockInvoke.mockResolvedValueOnce({ ok: true, data: null }) // deleteStep

      const { result } = renderHook(() => useTestTaskDetail('task-1'))

      await act(async () => {
        await result.current.fetchTaskDetail()
      })

      let success: any
      await act(async () => {
        success = await result.current.deleteStep('step-1')
      })

      expect(success).toBe(true)
      expect(result.current.taskDetail?.steps).toHaveLength(1)
      expect(result.current.taskDetail?.steps.find(s => s.id === 'step-1')).toBeUndefined()
    })
  })

  describe('reorderSteps', () => {
    it('成功重排序步骤', async () => {
      mockInvoke.mockResolvedValueOnce({ ok: true, data: mockTaskDetail }) // fetchTaskDetail
      mockInvoke.mockResolvedValueOnce({ ok: true, data: null }) // reorderSteps

      const { result } = renderHook(() => useTestTaskDetail('task-1'))

      await act(async () => {
        await result.current.fetchTaskDetail()
      })

      // 反转顺序
      let success: any
      await act(async () => {
        success = await result.current.reorderSteps(['step-2', 'step-1'])
      })

      expect(success).toBe(true)
      expect(result.current.taskDetail?.steps[0].id).toBe('step-2')
      expect(result.current.taskDetail?.steps[1].id).toBe('step-1')
    })

    it('taskId 为 null 时返回 false', async () => {
      const { result } = renderHook(() => useTestTaskDetail(null))

      let success: any
      await act(async () => {
        success = await result.current.reorderSteps(['step-1'])
      })

      expect(success).toBe(false)
      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })
})

// ==================== useTestExecutions ====================

describe('useTestExecutions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchExecutions', () => {
    it('taskId 为 null 时不调用 invoke', async () => {
      const { result } = renderHook(() => useTestExecutions(null))

      await act(async () => {
        await result.current.fetchExecutions()
      })

      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('成功获取执行记录', async () => {
      mockInvoke.mockResolvedValue({ ok: true, data: mockExecutions })
      const { result } = renderHook(() => useTestExecutions('task-1'))

      await act(async () => {
        await result.current.fetchExecutions()
      })

      expect(result.current.executions).toEqual(mockExecutions)
      expect(mockInvoke).toHaveBeenCalledWith('list_test_executions', { taskId: 'task-1', limit: 20 })
    })

    it('传递自定义 limit 参数', async () => {
      mockInvoke.mockResolvedValue({ ok: true, data: [] })
      const { result } = renderHook(() => useTestExecutions('task-1'))

      await act(async () => {
        await result.current.fetchExecutions(50)
      })

      expect(mockInvoke).toHaveBeenCalledWith('list_test_executions', { taskId: 'task-1', limit: 50 })
    })
  })

  describe('getExecutionDetail', () => {
    it('成功获取执行详情', async () => {
      const detail = { execution: mockExecutions[0], stepResults: [] }
      mockInvoke.mockResolvedValue({ ok: true, data: detail })
      const { result } = renderHook(() => useTestExecutions('task-1'))

      let detailResult: any
      await act(async () => {
        detailResult = await result.current.getExecutionDetail('exec-1')
      })

      expect(detailResult).toEqual(detail)
      expect(mockInvoke).toHaveBeenCalledWith('get_test_execution_detail', { executionId: 'exec-1' })
    })

    it('获取失败返回 null', async () => {
      mockInvoke.mockResolvedValue({ ok: false, error: 'not found' })
      const { result } = renderHook(() => useTestExecutions('task-1'))

      let detailResult: any
      await act(async () => {
        detailResult = await result.current.getExecutionDetail('exec-999')
      })

      expect(detailResult).toBeNull()
    })
  })

  describe('deleteExecution', () => {
    it('成功删除执行记录', async () => {
      mockInvoke.mockResolvedValueOnce({ ok: true, data: mockExecutions }) // fetchExecutions
      mockInvoke.mockResolvedValueOnce({ ok: true, data: null }) // deleteExecution

      const { result } = renderHook(() => useTestExecutions('task-1'))

      await act(async () => {
        await result.current.fetchExecutions()
      })

      expect(result.current.executions).toHaveLength(2)

      let success: any
      await act(async () => {
        success = await result.current.deleteExecution('exec-1')
      })

      expect(success).toBe(true)
      expect(result.current.executions).toHaveLength(1)
      expect(result.current.executions.find(e => e.id === 'exec-1')).toBeUndefined()
    })

    it('删除失败返回 false', async () => {
      mockInvoke.mockResolvedValue({ ok: false, error: '删除失败' })
      const { result } = renderHook(() => useTestExecutions('task-1'))

      let success: any
      await act(async () => {
        success = await result.current.deleteExecution('exec-1')
      })

      expect(success).toBe(false)
    })
  })
})
