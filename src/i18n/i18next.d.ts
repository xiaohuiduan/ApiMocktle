import 'i18next'

import type { zhCN } from './resources'

/**
 * i18next 键名类型声明。
 *
 * 以中文包为键集合基准（中文是主语言、键最全），`t('menu.catalog.overview')`
 * 这类调用在键名写错时会直接触发 `pnpm lint:ts` 报错。
 * 英文包的结构一致性由 `resources.ts` 的 `satisfies DeepStringify<typeof zhCN>` 保证。
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: {
      translation: typeof zhCN
    }
    strictInterpolationChecks: true
  }
}
