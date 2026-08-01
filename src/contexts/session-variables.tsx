import { createContext, useCallback, useContext, useState } from 'react'

interface SessionVariablesContextData {
  /** 当前会话中脚本设置的变量 */
  sessionVars: Record<string, string>
  /** 添加/更新会话变量 */
  setSessionVar: (name: string, value: string) => void
  /** 批量设置会话变量 */
  setSessionVars: (vars: Record<string, string>) => void
  /** 删除会话变量 */
  removeSessionVar: (name: string) => void
  /** 清空会话变量 */
  clearSessionVars: () => void
}

const SessionVariablesContext = createContext<SessionVariablesContextData>({} as SessionVariablesContextData)

export function SessionVariablesProvider(props: React.PropsWithChildren) {
  const [sessionVars, setSessionVarsState] = useState<Record<string, string>>({})

  const setSessionVar = useCallback((name: string, value: string) => {
    setSessionVarsState((prev) => ({ ...prev, [name]: value }))
  }, [])

  const setSessionVars = useCallback((vars: Record<string, string>) => {
    setSessionVarsState((prev) => ({ ...prev, ...vars }))
  }, [])

  const removeSessionVar = useCallback((name: string) => {
    setSessionVarsState((prev) => {
      const next = { ...prev }
      Reflect.deleteProperty(next, name)

      return next
    })
  }, [])

  const clearSessionVars = useCallback(() => {
    setSessionVarsState({})
  }, [])

  return (
    <SessionVariablesContext.Provider
      value={{ sessionVars, setSessionVar, setSessionVars, removeSessionVar, clearSessionVars }}
    >
      {props.children}
    </SessionVariablesContext.Provider>
  )
}

export const useSessionVariablesContext = () => useContext(SessionVariablesContext)
