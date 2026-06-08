import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type {
  TestTask,
  TestTaskDetail,
  TestStep,
  TestFolder,
  CreateTestTaskPayload,
  UpdateTestTaskPayload,
  CreateTestFolderPayload,
  UpdateTestFolderPayload,
  CreateTestStepPayload,
  UpdateTestStepPayload,
  TestExecution,
  TestExecutionDetail,
} from '@/types'

interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export function useTestTask(projectId: string) {
  const [tasks, setTasks] = useState<TestTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await invoke<ApiResult<TestTask[]>>('list_test_tasks', {
        projectId,
      })
      if (result.ok && result.data) {
        setTasks(result.data)
      } else {
        setError(result.error || 'Failed to fetch tasks')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const createTask = useCallback(async (payload: CreateTestTaskPayload): Promise<TestTask | null> => {
    try {
      const result = await invoke<ApiResult<TestTask>>('create_test_task', {
        payload: { ...payload, projectId },
      })
      if (result.ok && result.data) {
        setTasks((prev) => [result.data!, ...prev])
        return result.data
      } else {
        setError(result.error || 'Failed to create task')
        return null
      }
    } catch (err) {
      setError(String(err))
      return null
    }
  }, [projectId])

  const updateTask = useCallback(async (taskId: string, payload: UpdateTestTaskPayload): Promise<TestTask | null> => {
    try {
      const result = await invoke<ApiResult<TestTask>>('update_test_task', {
        taskId,
        payload,
      })
      if (result.ok && result.data) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? result.data! : t)))
        return result.data
      } else {
        setError(result.error || 'Failed to update task')
        return null
      }
    } catch (err) {
      setError(String(err))
      return null
    }
  }, [])

  const deleteTask = useCallback(async (taskId: string): Promise<boolean> => {
    try {
      const result = await invoke<ApiResult<null>>('delete_test_task', {
        taskId,
      })
      if (result.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId))
        return true
      } else {
        setError(result.error || 'Failed to delete task')
        return false
      }
    } catch (err) {
      setError(String(err))
      return false
    }
  }, [])

  const moveTaskToFolder = useCallback(async (taskId: string, folderId: string | null): Promise<TestTask | null> => {
    try {
      const result = await invoke<ApiResult<TestTask>>('move_test_task_to_folder', {
        taskId,
        folderId,
      })
      if (result.ok && result.data) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? result.data! : t)))
        return result.data
      } else {
        setError(result.error || 'Failed to move task')
        return null
      }
    } catch (err) {
      setError(String(err))
      return null
    }
  }, [])

  return {
    tasks,
    loading,
    error,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    moveTaskToFolder,
    setTasks,
  }
}

export function useTestFolders(projectId: string) {
  const [folders, setFolders] = useState<TestFolder[]>([])
  const [loading, setLoading] = useState(false)

  const fetchFolders = useCallback(async () => {
    setLoading(true)
    try {
      const result = await invoke<ApiResult<TestFolder[]>>('list_test_folders', {
        projectId,
      })
      if (result.ok && result.data) {
        setFolders(result.data)
      }
    } catch (err) {
      console.error('Failed to fetch folders:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const createFolder = useCallback(async (name: string): Promise<TestFolder | null> => {
    try {
      const result = await invoke<ApiResult<TestFolder>>('create_test_folder', {
        payload: { projectId, name },
      })
      if (result.ok && result.data) {
        setFolders((prev) => [...prev, result.data!])
        return result.data
      }
      return null
    } catch (err) {
      console.error('Failed to create folder:', err)
      return null
    }
  }, [projectId])

  const renameFolder = useCallback(async (folderId: string, name: string): Promise<TestFolder | null> => {
    try {
      const result = await invoke<ApiResult<TestFolder>>('update_test_folder', {
        folderId,
        payload: { name },
      })
      if (result.ok && result.data) {
        setFolders((prev) => prev.map((f) => (f.id === folderId ? result.data! : f)))
        return result.data
      }
      return null
    } catch (err) {
      console.error('Failed to rename folder:', err)
      return null
    }
  }, [])

  const deleteFolder = useCallback(async (folderId: string): Promise<boolean> => {
    try {
      const result = await invoke<ApiResult<null>>('delete_test_folder', {
        folderId,
      })
      if (result.ok) {
        setFolders((prev) => prev.filter((f) => f.id !== folderId))
        return true
      }
      return false
    } catch (err) {
      console.error('Failed to delete folder:', err)
      return false
    }
  }, [])

  return {
    folders,
    loading,
    fetchFolders,
    createFolder,
    renameFolder,
    deleteFolder,
  }
}

export function useTestTaskDetail(taskId: string | null) {
  const [taskDetail, setTaskDetail] = useState<TestTaskDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTaskDetail = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    setError(null)
    try {
      const result = await invoke<ApiResult<TestTaskDetail>>('get_test_task', {
        taskId,
      })
      if (result.ok && result.data) {
        setTaskDetail(result.data)
      } else {
        setError(result.error || 'Failed to fetch task detail')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [taskId])

  const addStep = useCallback(async (payload: CreateTestStepPayload): Promise<TestStep | null> => {
    try {
      const result = await invoke<ApiResult<TestStep>>('create_test_step', {
        payload: { ...payload, taskId },
      })
      if (result.ok && result.data) {
        setTaskDetail((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            steps: [...prev.steps, result.data!],
          }
        })
        return result.data
      } else {
        setError(result.error || 'Failed to add step')
        return null
      }
    } catch (err) {
      setError(String(err))
      return null
    }
  }, [taskId])

  const updateStep = useCallback(async (stepId: string, payload: UpdateTestStepPayload): Promise<TestStep | null> => {
    try {
      const result = await invoke<ApiResult<TestStep>>('update_test_step', {
        stepId,
        payload,
      })
      if (result.ok && result.data) {
        setTaskDetail((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            steps: prev.steps.map((s) => (s.id === stepId ? result.data! : s)),
          }
        })
        return result.data
      } else {
        setError(result.error || 'Failed to update step')
        return null
      }
    } catch (err) {
      setError(String(err))
      return null
    }
  }, [])

  const deleteStep = useCallback(async (stepId: string): Promise<boolean> => {
    try {
      const result = await invoke<ApiResult<null>>('delete_test_step', {
        stepId,
      })
      if (result.ok) {
        setTaskDetail((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            steps: prev.steps.filter((s) => s.id !== stepId),
          }
        })
        return true
      } else {
        setError(result.error || 'Failed to delete step')
        return false
      }
    } catch (err) {
      setError(String(err))
      return false
    }
  }, [])

  const reorderSteps = useCallback(async (stepIds: string[]): Promise<boolean> => {
    if (!taskId) return false
    try {
      const result = await invoke<ApiResult<null>>('reorder_test_steps', {
        taskId,
        payload: { stepIds },
      })
      if (result.ok) {
        setTaskDetail((prev) => {
          if (!prev) return prev
          const stepMap = new Map(prev.steps.map((s) => [s.id, s]))
          const reordered = stepIds
            .map((id) => stepMap.get(id))
            .filter(Boolean) as TestStep[]
          return { ...prev, steps: reordered }
        })
        return true
      } else {
        setError(result.error || 'Failed to reorder steps')
        return false
      }
    } catch (err) {
      setError(String(err))
      return false
    }
  }, [taskId])

  return {
    taskDetail,
    loading,
    error,
    fetchTaskDetail,
    addStep,
    updateStep,
    deleteStep,
    reorderSteps,
  }
}

export function useTestExecutions(taskId: string | null) {
  const [executions, setExecutions] = useState<TestExecution[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchExecutions = useCallback(async (limit: number = 20) => {
    if (!taskId) return
    setLoading(true)
    setError(null)
    try {
      const result = await invoke<ApiResult<TestExecution[]>>('list_test_executions', {
        taskId,
        limit,
      })
      if (result.ok && result.data) {
        setExecutions(result.data)
      } else {
        setError(result.error || 'Failed to fetch executions')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [taskId])

  const getExecutionDetail = useCallback(async (executionId: string): Promise<TestExecutionDetail | null> => {
    try {
      const result = await invoke<ApiResult<TestExecutionDetail>>('get_test_execution_detail', {
        executionId,
      })
      if (result.ok && result.data) {
        return result.data
      } else {
        setError(result.error || 'Failed to fetch execution detail')
        return null
      }
    } catch (err) {
      setError(String(err))
      return null
    }
  }, [])

  const deleteExecution = useCallback(async (executionId: string): Promise<boolean> => {
    try {
      const result = await invoke<ApiResult<null>>('delete_test_execution', {
        executionId,
      })
      if (result.ok) {
        setExecutions((prev) => prev.filter((e) => e.id !== executionId))
        return true
      } else {
        setError(result.error || 'Failed to delete execution')
        return false
      }
    } catch (err) {
      setError(String(err))
      return false
    }
  }, [])

  return {
    executions,
    loading,
    error,
    fetchExecutions,
    getExecutionDetail,
    deleteExecution,
  }
}
