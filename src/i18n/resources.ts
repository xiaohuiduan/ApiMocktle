import { api as enApi } from './locales/en-US/api'
import { app as enApp } from './locales/en-US/app'
import { common as enCommon } from './locales/en-US/common'
import { flow as enFlow } from './locales/en-US/flow'
import { menu as enMenu } from './locales/en-US/menu'
import { settings as enSettings } from './locales/en-US/settings'
import { share as enShare } from './locales/en-US/share'
import { ui as enUi } from './locales/en-US/ui'
import { api as zhApi } from './locales/zh-CN/api'
import { app as zhApp } from './locales/zh-CN/app'
import { common as zhCommon } from './locales/zh-CN/common'
import { flow as zhFlow } from './locales/zh-CN/flow'
import { menu as zhMenu } from './locales/zh-CN/menu'
import { settings as zhSettings } from './locales/zh-CN/settings'
import { share as zhShare } from './locales/zh-CN/share'
import { ui as zhUi } from './locales/zh-CN/ui'
import type { ResolvedLanguage } from './detector'

/**
 * 中文语言包。作为类型基准：英文包必须与之同构，否则编译报错。
 *
 * 各功能域以一级键区分，取词写作 `t('menu.catalog.overview')`：
 * - `common`   跨域复用的按钮、状态词、单位词
 * - `menu`     左侧目录、HTTP 状态码、接口状态
 * - `api`      接口文档、参数表、Schema、运行调试
 * - `flow`     自动化测试流程编辑器
 * - `settings` 设置弹窗、项目设置、导入导出、分享服务
 * - `share`    局域网只读分享页
 * - `app`      应用外壳：登录注册、项目列表、主导航、标签栏、全局 hooks/contexts
 * - `ui`       通用 UI：Schema 编辑器、表格、主题编辑器、编辑器外壳、图标、Toast
 *
 * 不划分 i18next 命名空间：桌面应用不做懒加载，单命名空间下一级键已足够隔离。
 */
export const zhCN = {
  common: zhCommon,
  menu: zhMenu,
  api: zhApi,
  flow: zhFlow,
  settings: zhSettings,
  share: zhShare,
  app: zhApp,
  ui: zhUi,
} as const

/**
 * 把中文包的字面量类型「擦成 string」，但保留树形结构与可选性，
 * 用于约束英文包：键缺失或层级不符时编译报错，而不强制英文值与中文值相同。
 */
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>
}

/** 英文语言包。由 `DeepStringify<typeof zhCN>` 保证与中文键结构一致。 */
export const enUS = {
  common: enCommon,
  menu: enMenu,
  api: enApi,
  flow: enFlow,
  settings: enSettings,
  share: enShare,
  app: enApp,
  ui: enUi,
} as const satisfies DeepStringify<typeof zhCN>

/** i18next 所需的资源表。 */
export const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS },
} as const

export type { ResolvedLanguage }
