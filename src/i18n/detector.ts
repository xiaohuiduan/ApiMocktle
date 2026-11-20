/** 语言设置模式：跟随系统或手动指定。 */
export type LanguageSetting = 'system' | 'zh-CN' | 'en-US'

/** 实际生效的语言（已归一化）。 */
export type ResolvedLanguage = 'zh-CN' | 'en-US'

/** 受支持的语言列表。 */
export const SUPPORTED_LANGUAGES: readonly ResolvedLanguage[] = ['zh-CN', 'en-US']

/** 默认语言（未知语言一律回落此值）。 */
export const DEFAULT_LANGUAGE: ResolvedLanguage = 'zh-CN'

/**
 * 把任意 BCP-47 语言标签归一化到受支持集合。
 *
 * 显式归一而不依赖 i18next 的隐式匹配，是为了让「未知语言 → 中文」成为
 * 可测试的稳定契约：`en-GB` → `en-US`、`zh-Hans-CN` / `zh-TW` → `zh-CN`、
 * `ja-JP` → `zh-CN`（默认）。
 */
export function normalizeLanguage(raw: string | undefined | null): ResolvedLanguage {
  const lower = (raw ?? '').trim().toLowerCase()

  if (lower === 'en' || lower.startsWith('en-') || lower.startsWith('en_')) {
    return 'en-US'
  }

  if (lower === 'zh' || lower.startsWith('zh-') || lower.startsWith('zh_')) {
    return 'zh-CN'
  }

  return DEFAULT_LANGUAGE
}

/**
 * 探测系统语言。
 *
 * 参数可注入（默认取 `navigator`），便于测试与 SSR 场景固定结果。
 * 探测失败时软失败回落默认语言，绝不抛错——WebView2 在少数 Windows 环境下
 * 存在 `navigator.language` 不准的已知问题。
 */
export function detectSystemLanguage(
  nav: Pick<Navigator, 'language' | 'languages'> | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): ResolvedLanguage {
  try {
    const candidates = nav?.languages?.length ? nav.languages : (nav?.language ? [nav.language] : [])

    for (const code of candidates) {
      const normalized = normalizeLanguage(code)

      // normalizeLanguage 对未知语言返回默认值，无法区分「命中默认」与「回落」，
      // 因此这里先判断原始语言是否属于已知语族，只接受真正命中的结果。
      if (/^(en|zh)([-_]|$)/i.test(code)) {
        return normalized
      }
    }

    return DEFAULT_LANGUAGE
  }
  catch {
    return DEFAULT_LANGUAGE
  }
}
