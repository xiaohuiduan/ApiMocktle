import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'

import type { ResolvedLanguage } from './detector'

/**
 * antd 语言包映射。
 *
 * antd 组件的内置文案（分页器、表格空状态、Select 的 Not Found、Popconfirm 的
 * 确定/取消、Modal 默认按钮等）不归我们的语言包管理，必须通过
 * `ConfigProvider locale` 切换。主应用与分享页两套 Provider 树都要消费本映射。
 */
export const ANTD_LOCALES = {
  'zh-CN': zhCN,
  'en-US': enUS,
} as const

/** 按语言取 antd locale，未知语言回落中文。 */
export function getAntdLocale(language: ResolvedLanguage) {
  return ANTD_LOCALES[language] ?? zhCN
}
