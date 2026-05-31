import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCtrlSave } from './useCtrlSave'

describe('useCtrlSave', () => {
  it('Ctrl+S 触发 handler', () => {
    const handler = vi.fn()
    renderHook(() => useCtrlSave(handler, true))

    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true })
    window.dispatchEvent(event)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('Cmd+S (metaKey) 也触发 handler', () => {
    const handler = vi.fn()
    renderHook(() => useCtrlSave(handler, true))

    const event = new KeyboardEvent('keydown', { key: 's', metaKey: true })
    window.dispatchEvent(event)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('active=false 时不触发 handler', () => {
    const handler = vi.fn()
    renderHook(() => useCtrlSave(handler, false))

    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true })
    window.dispatchEvent(event)

    expect(handler).not.toHaveBeenCalled()
  })

  it('普通 S 键不触发 handler', () => {
    const handler = vi.fn()
    renderHook(() => useCtrlSave(handler, true))

    const event = new KeyboardEvent('keydown', { key: 's' })
    window.dispatchEvent(event)

    expect(handler).not.toHaveBeenCalled()
  })

  it('组件卸载时移除事件监听', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useCtrlSave(handler, true))

    unmount()

    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true })
    window.dispatchEvent(event)

    expect(handler).not.toHaveBeenCalled()
  })

  it('handler 变更后使用新的 handler', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    const { rerender } = renderHook(
      ({ handler }) => useCtrlSave(handler, true),
      { initialProps: { handler: handler1 } }
    )

    // 用 handler1 触发
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    expect(handler1).toHaveBeenCalledTimes(1)

    // 更新 handler
    rerender({ handler: handler2 })

    // 再次触发，应该调用 handler2
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    expect(handler2).toHaveBeenCalledTimes(1)
  })
})
