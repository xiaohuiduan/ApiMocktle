import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFlowStore } from '../store/useFlowStore'
import type { FlowGraph } from '../types/flow.types'

const DEBOUNCE_MS = 2000

/**
 * 自动保存和加载流程图的 Hook
 * - 监听 isDirty 变化，2 秒防抖后自动保存
 * - 提供 forceSave() 立即保存
 * - 提供 loadFlow() 从后端加载流程图
 * - 组件卸载时清除定时器
 */
export function useFlowPersistence(taskId: string) {
  const { loadGraph, getGraph, markSaved, reset, isDirty } = useFlowStore()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // 保存流程图
  const saveFlow = useCallback(async () => {
    if (!taskId) return
    try {
      const graph = getGraph()
      await invoke('save_test_flow_graph', { taskId, graphJson: graph })
      markSaved()
    } catch (err) {
      console.error('[useFlowPersistence] 保存流程图失败:', err)
    }
  }, [taskId, getGraph, markSaved])

  // 强制保存（立即执行，取消防抖）
  const forceSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    await saveFlow()
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

  // 卸载清理
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  return { loadFlow, forceSave, isSaving: false }
}
