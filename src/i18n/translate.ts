import type { TFunction } from 'i18next'

import { i18n } from './index'

/**
 * 动态 key 取词。
 *
 * ## 为什么需要它
 *
 * i18next 通过 `CustomTypeOptions` 把 `t()` 的入参收窄成键字面量联合，这在
 * 手写 `t('api.doc.title')` 时提供了极好的编译期校验。但项目里有一类 key 是
 * **运行期才确定的**：
 *
 * - `src/configs/static.ts` 的 `*Key` 字段（与颜色、数值同处一个对象，只能是 `string`）
 * - `features/test-flow` 的 `NODE_TYPE_LABEL_KEYS` / `OPERATOR_LABEL_KEYS` 等映射表
 * - `t(\`flow.palette.${type}\`)` 这类模板拼接
 *
 * 对这些位置直接写 `t(key as never)` 会把类型逃逸散落到几十个文件里，既难看也
 * 无法统一约束。本模块把「一次有意的、可审计的类型收窄」集中到单一出口。
 *
 * ## 置信来源
 *
 * 这些动态 key 的**实际有效性**由 `src/i18n/i18n-coverage.test.ts` 与
 * `src/i18n/i18n-keys.test.ts` 兜底校验：后者会把所有映射表里的 key 逐个
 * 在两种语言下求值，缺键会直接测试失败。因此这里的 `as never` 不是盲目逃逸，
 * 而是「校验责任已移交测试」的显式声明。
 */

/** 把任意字符串按当前语言翻译。空串直接返回空串（配置里「无此项」的约定）。 */
export function translateKey(key: string): string {
  if (!key) {
    return ''
  }

  return i18n.t(key as never) as string
}

/** hook 版：供组件内在 `useMemo([t])` 场景使用。 */
export function createTranslate(t: TFunction): (key: string) => string {
  return (key: string) => (key ? (t(key as never) as string) : '')
}
