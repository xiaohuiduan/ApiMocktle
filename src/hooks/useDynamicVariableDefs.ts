import { useEffect, useState } from 'react'

import { useAuth } from '@/contexts/auth'
import { type DynamicVariableDef, fetchDynamicVariableDefs } from '@/utils/dynamic-variables'

/** 动态变量定义（内置 + 自定义），供补全/说明弹窗；带进程内缓存 */
export function useDynamicVariableDefs(): DynamicVariableDef[] {
  const { sessionId } = useAuth()
  const [defs, setDefs] = useState<DynamicVariableDef[]>([])

  useEffect(() => {
    if (!sessionId) { return }

    void fetchDynamicVariableDefs(sessionId).then(setDefs).catch(() => undefined)
  }, [sessionId])

  return defs
}
