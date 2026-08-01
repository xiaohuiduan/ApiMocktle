import { useCallback, useEffect, useState } from 'react'

/**
 * 受控输入草稿 Hook（用于配置面板表单）
 *
 * 背景：节点配置表单若直接受控（value + onChange 直写 store），
 * 每次击键都会 pushHistory + isDirty，历史被击键次数污染。
 * 若用 uncontrolled（defaultValue + onBlur），撤销/重做、切换节点后输入框不回显最新值。
 *
 * 本 Hook 折中方案：
 * - 本地维护草稿值：击键即时响应，不写 store
 * - 外部 value 变化时（撤销/重做、切换节点、外部写入）自动同步回显
 * - blur 时通过 onCommit 提交一次
 */
export function useDraft(value: string, onCommit: (v: string) => void) {
  const [draft, setDraft] = useState(value)

  // 外部值变化（撤销/重做、切换节点）时回显
  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = useCallback(() => {
    onCommit(draft)
  }, [draft, onCommit])

  return { draft, setDraft, commit }
}
