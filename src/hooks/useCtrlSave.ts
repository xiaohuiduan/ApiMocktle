import { useEffect } from 'react'

/**
 * 全局 Ctrl+S / Cmd+S 快捷键。
 * 使用 capture 阶段监听，确保在 Monaco 等编辑器或任何组件的 stopPropagation 之前触发，
 * 并阻止事件继续传播，避免与编辑器内部行为冲突。
 */
export function useCtrlSave(handler: () => void, active = true) {
  useEffect(() => {
    if (!active) { return }

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        e.stopPropagation()
        handler()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [handler, active])
}
