import { invoke } from '@tauri-apps/api/core'

export interface ApiResult<T> {
  ok: boolean
  data: T
  error: string | null
}

export async function api<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const result = await invoke<ApiResult<T>>(command, args)

  if (!result.ok) {
    throw new Error(result.error ?? '请求失败')
  }

  return result.data
}

export async function apiRaw<T>(command: string, args?: Record<string, unknown>): Promise<ApiResult<T>> {
  return invoke<ApiResult<T>>(command, args)
}
