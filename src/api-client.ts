import { invoke } from '@tauri-apps/api/core'

import { t } from '@/i18n'

export interface ApiResult<T> {
  ok: boolean
  data: T
  error: string | null
}

export async function api<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const result = await invoke<ApiResult<T>>(command, args)

  if (!result.ok) {
    // 后端错误文案属本次 Out of Scope（保持中文）；仅当后端未给出 error 时
    // 用当前语言兜底，避免英文界面弹出中文空文案。
    throw new Error(result.error ?? t('app.errors.requestFailed'))
  }

  return result.data
}

export async function apiRaw<T>(command: string, args?: Record<string, unknown>): Promise<ApiResult<T>> {
  return invoke<ApiResult<T>>(command, args)
}
