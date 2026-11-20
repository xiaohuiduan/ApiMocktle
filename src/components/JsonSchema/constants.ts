import type { TFunction } from 'i18next'

import type { JsonSchema } from './JsonSchema.type'

export const KEY_PROPERTIES = 'properties'
export const KEY_ITEMS = 'items'

/** 字段名路径分隔符。 */
export const SEPARATOR = '.'

/** 树结构的层级缩进数值。 */
export const INDENT = 16

export const columnHeight = 32

export const enum SchemaType {
  Null = 'null',
  Integer = 'integer',
  Number = 'number',
  String = 'string',
  Boolean = 'boolean',
  Object = 'object',
  Array = 'array',
  Any = 'any',
  Refer = 'ref',
}

/**
 * Schema 类型的展示配置。
 *
 * `text` 是类型名，属协议常量，**不翻译**；语言相关的展示名单独放在 `labelKey`
 * （目前只有 `ref` 需要，见 `ui.schema.refModel`）。消费方在**渲染期**调用
 * `getSchemaTypeLabel()` 取词，避免模块顶层求值导致切语言不刷新。
 */
export const defaultSchemaTypeConfig = {
  [SchemaType.Null]: {
    text: 'null',
    varColor: '--color-orange-6',
  },
  [SchemaType.Integer]: {
    text: 'integer',
    varColor: '--color-pink-6',
  },
  [SchemaType.Number]: {
    text: 'number',
    varColor: '--color-orange-6',
  },
  [SchemaType.String]: {
    text: 'string',
    varColor: '--color-green-6',
  },
  [SchemaType.Boolean]: {
    text: 'boolean',
    varColor: '--color-pink-6',
  },
  [SchemaType.Array]: {
    text: 'array',
    varColor: '--color-green-6',
  },
  [SchemaType.Object]: {
    text: 'object',
    varColor: '--color-blue-6',
  },
  [SchemaType.Any]: {
    text: 'any',
    varColor: '--color-blue-6',
  },
  [SchemaType.Refer]: {
    text: 'ref',
    labelKey: 'ui.schema.refModel',
    varColor: '--color-purple-6',
  },
} as const satisfies Record<SchemaType, { text: string, labelKey?: string, varColor: string }>

/**
 * 取 Schema 类型的展示名。
 *
 * 有 `labelKey` 的走 i18n；否则回落到协议类型名。`ref` 之外的类型名是协议常量，不翻译。
 *
 * `t` 由调用方传入（而非在此处 `import { t }`）：这样组件内可以用
 * `useMemo(() => ..., [t])` 显式把语言作为依赖，语言切换时必定重算，
 * 也让 eslint 的 exhaustive-deps 满意。
 */
export function getSchemaTypeLabel(type: SchemaType, t: TFunction): string {
  const config = defaultSchemaTypeConfig[type]

  return 'labelKey' in config ? t(config.labelKey) : config.text
}

export const defaultFieldData: JsonSchema = {
  name: '',
  type: SchemaType.String,
}
