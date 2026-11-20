import { initReactI18next } from 'react-i18next'

import i18n from 'i18next'

import { DEFAULT_LANGUAGE, detectSystemLanguage, normalizeLanguage, type ResolvedLanguage } from './detector'
import { resources } from './resources'
import { type LanguageSetting, readLanguageSetting, resolveLanguage, writeLanguageSetting } from './storage'

/** 语言变化时需要在 i18n 之外同步的外部状态（文档元信息、dayjs 等）。 */
type LanguageSideEffect = (language: ResolvedLanguage) => void

const sideEffects = new Set<LanguageSideEffect>()

let initialized = false
let reactBound = false

/** 注册语言变化时的副作用；返回反注册函数。 */
export function onLanguageChange(effect: LanguageSideEffect): () => void {
  sideEffects.add(effect)

  if (initialized) {
    effect(normalizeLanguage(i18n.language))
  }

  return () => {
    sideEffects.delete(effect)
  }
}

function runSideEffects(language: ResolvedLanguage): void {
  for (const effect of sideEffects) {
    try {
      effect(language)
    }
    catch (error) {
      // 副作用失败不得阻断语言切换主流程
      console.error('[i18n] language side effect failed', error)
    }
  }
}

export interface InitI18nOptions {
  /**
   * 语言来源模式。主应用读 localStorage 的三态设置；
   * 分享页是局域网访客访问的独立入口，无本地偏好，只能跟随浏览器语言。
   */
  mode?: 'setting' | 'system'
}

/**
 * 初始化 i18n。
 *
 * **必须同步完成**：`resources` 已随包打进内存，i18next 在 init 时走同步 load 分支，
 * 因此 init 返回后立即可 `t()`。这样首帧渲染即为正确语言，不会出现中文闪现。
 * 两个入口（`src/main.tsx` 与 `src/share/main.tsx`）各自调用一次。
 */
export function initI18n(options: InitI18nOptions = {}): ResolvedLanguage {
  const { mode = 'setting' } = options

  const setting: LanguageSetting = mode === 'system' ? 'system' : readLanguageSetting()
  const language = resolveLanguage(setting, detectSystemLanguage())

  if (!initialized) {
    /*
      必须注册 initReactI18next：它为 i18next 设置 `options.react` 并把实例写入
      react-i18next 的全局单例，`useTranslation()` 才能在没有 <I18nextProvider>
      的情况下找到实例。项目里的组件测试全部裸 render()（不包任何 Provider），
      漏掉这一步会让它们取到 key 原文而不是中文，存量中文断言集体失败。
    */
    if (!reactBound) {
      i18n.use(initReactI18next)
      reactBound = true
    }

    void i18n.init({
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: ['zh-CN', 'en-US'],
      resources,
      // React 已经对文本做转义，再转一次会得到 &amp; 这类双重转义
      interpolation: { escapeValue: false },
      // 项目没有任何 <Suspense> 边界，资源又全在内存里，不需要 Suspense 语义
      react: { useSuspense: false },
      returnEmptyString: false,
      // 缺键时返回 key 而不是空串，配合下方 parseMissingKeyHandler 给出可观测兜底
      parseMissingKeyHandler: (key: string) => {
        if (import.meta.env.DEV) {
          console.warn(`[i18n] missing translation key: ${key}`)
        }

        return key
      },
    })

    initialized = true

    i18n.on('languageChanged', (next: string) => {
      runSideEffects(normalizeLanguage(next))
    })
  }
  else {
    void i18n.changeLanguage(language)
  }

  runSideEffects(language)

  return language
}

/** 切换语言（同时持久化模式）。仅主应用使用；分享页不写本地偏好。 */
export function setLanguage(setting: LanguageSetting): ResolvedLanguage {
  const language = resolveLanguage(setting, detectSystemLanguage())

  writeLanguageSetting(setting)
  void i18n.changeLanguage(language)

  return language
}

/** 取当前生效语言（归一化后）。 */
export function getLanguage(): ResolvedLanguage {
  return normalizeLanguage(i18n.language)
}

/**
 * 非渲染时机取词（模块级函数、事件回调等）。
 *
 * 规则：只在函数体内部调用，**绝不能**在模块顶层把结果存成 `const` 常量、
 * 也不能写入 state / localStorage / 数据库——那样切语言后不会刷新。
 * 组件内请优先用 `useTranslation()`。
 *
 * 用 `bind` 保留 i18next 的 `this` 绑定，同时继承 `i18n.t` 的重载与泛型签名，
 * 从而维持编译期键名校验。
 */
export const t: typeof i18n.t = i18n.t.bind(i18n)

/** 两个入口共用的 i18next 实例。 */
export { i18n }

export { syncDayjs } from './dayjs'
export { DEFAULT_LANGUAGE, detectSystemLanguage, normalizeLanguage, type ResolvedLanguage } from './detector'
export { syncDocument } from './document'
export { enUS, zhCN } from './resources'
export { type LanguageSetting, readLanguageSetting, writeLanguageSetting } from './storage'
