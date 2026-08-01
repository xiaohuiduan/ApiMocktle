import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFlowStore } from '../store/useFlowStore'
import type { FlowGraph } from '../types/flow.types'

const DEBOUNCE_MS = 2000

/**
 * 自动保存和加载流程图的 Hook
 * - 监听 isDirty 变化，2 秒防抖后自动保存
 * - 提供 forceSave() 立即保存（返回是否成功）
 * - 提供 loadFlow() 从后端加载流程图
 * - 组件卸载时：若有未保存修改，立即 flush 一次
 * - 页面关闭/刷新前：若存在未保存修改，触发浏览器拦截提示
 */
export function useFlowPersistence(taskId: string) {
  const { loadGraph, getGraph, markSaved, reset, isDirty } = useFlowStore()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // 加载流程图
  const loadFlow = useCallback(async () => {
    if (!taskId) return
    // 先清空画布，防止显示上一个任务的内容
    reset()
    try {
      const result = await invoke<{ ok: boolean; data?: FlowGraph; error?: string }>(
        'load_test_flow_graph',
        { taskId },
      )
      if (result.ok && result.data) {
        loadGraph(result.data)
      }
    } catch (err) {
      console.error('[useFlowPersistence] 加载流程图失败:', err)
    }
  }, [taskId, loadGraph, reset])

  // 保存流程图（返回是否成功）
  const saveFlow = useCallback(async (): Promise<boolean> => {
    if (!taskId) return false
    setIsSaving(true)
    try {
      const graph = getGraph()
      const result = await invoke<{ ok: boolean; error?: string }>('save_test_flow_graph', {
        taskId,
        graphJson: graph,
      })
      if (!result?.ok) {
        console.error('[useFlowPersistence] 保存流程图失败:', result?.error)
        return false
      }
      markSaved()
      return true
    } catch (err) {
      console.error('[useFlowPersistence] 保存流程图失败:', err)
      return false
    } finally {
      setIsSaving(false)
    }
  }, [taskId, getGraph, markSaved])

  // 最新 saveFlow 引用（供卸载 flush 使用，避免闭包过期）
  const saveFlowRef = useRef(saveFlow)
  useEffect(() => {
    saveFlowRef.current = saveFlow
  }, [saveFlow])

  // 强制保存（立即执行，取消防抖）
  const forceSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    return saveFlow()
  }, [saveFlow])

  // 自动保存副作用：isDirty 变为 true 时启动防抖定时器
  useEffect(() => {
    if (!isDirty) return

    // 清除之前的定时器（重置防抖）
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      saveFlow()
      timerRef.current = null
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isDirty, saveFlow])

  // 初始加载
  useEffect(() => {
    loadFlow()
  }, [taskId, loadFlow])

  // 卸载清理：清除定时器；若仍有未保存修改，立即 flush 一次（防止防抖窗口内切页丢改动）
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (useFlowStore.getState().isDirty) {
        saveFlowRef.current()
      }
    }
  }, [])

  // 页面关闭/刷新前：存在未保存修改时提示
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useFlowStore.getState().isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  return { loadFlow, forceSave, isSaving }
}
