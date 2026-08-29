import { useEffect } from 'react'

/** 页签「保存并关闭」请求事件：detail 携带目标页签 key。 */
export const TAB_SAVE_EVENT = 'api-tab-save'

/**
 * 页签保存桥接：ApiTab 的「保存并关闭」通过全局事件请求内容组件执行保存
 * （与 Ctrl+S 同一条保存路径）。组件侧在对应页签挂载时调用本 hook 接入。
 */
export function useTabSaveBridge(tabKey: string, handler: () => void, active = true) {
  useEffect(() => {
    if (!active) { return }

    const onSaveRequest = (e: Event) => {
      const detail = (e as CustomEvent<{ key?: string }>).detail

      if (detail?.key !== tabKey) { return }

      handler()
    }

    window.addEventListener(TAB_SAVE_EVENT, onSaveRequest)

    return () => {
      window.removeEventListener(TAB_SAVE_EVENT, onSaveRequest)
    }
  }, [tabKey, handler, active])
}
