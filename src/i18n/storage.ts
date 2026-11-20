import { DEFAULT_LANGUAGE, type LanguageSetting, normalizeLanguage, type ResolvedLanguage } from './detector'

/** 语言模式在 localStorage 中的键。 */
export const LANGUAGE_STORAGE_KEY = 'i18n:language'

/** localStorage 是否可用（隐私模式 / 配额受限时可能抛错）。 */
function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  }
  catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  }
  catch {
    // 写入失败时静默降级：本次会话仍可用，只是下次启动回默认模式
  }
}

/**
 * 读取语言设置模式。
 *
 * 存的是「模式」而非解析结果：存 `'system'` 才能在用户修改系统语言后继续跟随。
 * 脏数据（手工改坏 / 旧版本残留）一律回退 `'system'`，不让启动路径被脏值瘫痪。
 */
export function readLanguageSetting(): LanguageSetting {
  const raw = safeGet(LANGUAGE_STORAGE_KEY)

  if (raw === 'system' || raw === 'zh-CN' || raw === 'en-US') {
    return raw
  }

  return 'system'
}

/** 持久化语言设置模式。 */
export function writeLanguageSetting(setting: LanguageSetting): void {
  safeSet(LANGUAGE_STORAGE_KEY, setting)
}

/** 把设置模式解析为实际生效语言。 */
export function resolveLanguage(setting: LanguageSetting, detected: ResolvedLanguage): ResolvedLanguage {
  return setting === 'system' ? detected : setting
}

export { DEFAULT_LANGUAGE, type LanguageSetting, normalizeLanguage, type ResolvedLanguage }
