import dayjs from 'dayjs'

import 'dayjs/locale/zh-cn'

import type { ResolvedLanguage } from './detector'

/**
 * 同步 dayjs 语言。
 *
 * antd 的日期组件（DatePicker / RangePicker）内部用 dayjs 渲染月份与星期名，
 * 仅切 `ConfigProvider locale` 不够，必须同时切 dayjs 的 locale，否则会出现
 * 「英文面板 + 中文月份」的混合态。项目当前仅 `CreateShareModal` 用到日期选择器。
 */
export function syncDayjs(language: ResolvedLanguage): void {
  dayjs.locale(language === 'en-US' ? 'en' : 'zh-cn')
}
