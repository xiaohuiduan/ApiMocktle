import { api } from '@/api-client'

/**
 * 动态变量定义（{{$xxx}}）——补全提示与说明弹窗共用。
 *
 * 数据源为 DB（list_dynamic_variables，内置 seed + 用户自定义），求值在 Rust 单点
 * （services/dynamic_variables.rs，Rhai 引擎）。此文件仅做定义拉取与缓存。
 */
export interface DynamicVariableDef {
  /** 变量名（含 $ 前缀，不含 {{}}） */
  name: string
  /** 简要说明 */
  desc: string
  /** 示例值（DB 的 value，如内置的函数名） */
  example: string
}

let defsCache: DynamicVariableDef[] | null = null

/** 拉取动态变量定义（内置 + 自定义）；进程内缓存，供补全/说明弹窗 */
export async function fetchDynamicVariableDefs(sessionId: string): Promise<DynamicVariableDef[]> {
  if (defsCache) { return defsCache }

  const list = await api<{ name: string, description: string, value: string }[]>(
    'list_dynamic_variables',
    { sessionId },
  )
  defsCache = list.map((d) => ({ name: d.name, desc: d.description, example: d.value }))

  return defsCache
}

/** 变量定义变更（新建/保存/删除）后清缓存，下次拉取最新 */
export function invalidateDynamicVariableDefs(): void {
  defsCache = null
}
