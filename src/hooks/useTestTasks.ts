import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { TestTask } from '@/types'

// ==================== Hook 返回类型 ====================

interface UseTestTasksReturn {
  tasks: TestTask[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

// ==================== Hook ====================

export function useTestTasks(projectId: string): UseTestTasksReturn {
  const [tasks, setTasks] = useState<TestTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 获取测试任务列表
  const fetchTasks = useCallback(async () => {
    if (!projectId) return

    setLoading(true)
    setError(null)

    try {
      const result = await invoke<{ ok: boolean; data?: TestTask[]; error?: string }>(
        'list_test_tasks',
        { projectId },
      )

      if (result.ok && result.data) {
        setTasks(result.data)
      } else {
        setError(result.error || '获取测试任务列表失败')
      }
    } catch (err) {
      console.error('[useTestTasks] Error:', err)
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // 初始加载
  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  return {
    tasks,
    loading,
    error,
    refresh: fetchTasks,
  }
}
